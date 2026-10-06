import express from 'express';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Body parsers for JSON and attachments
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// In-memory chat storage with file-system persistence
const CHAT_DATA_FILE = path.join(process.cwd(), 'dira-chat-data.json');
const USERS_DATA_FILE = path.join(process.cwd(), 'dira-users-data.json');
const CODES_DATA_FILE = path.join(process.cwd(), 'dira-codes-data.json');
const VAPID_KEYS_FILE = path.join(process.cwd(), 'dira-vapid-keys.json');
const PUSH_SUBS_FILE = path.join(process.cwd(), 'dira-push-subscriptions.json');

// Web Push VAPID Configuration
let vapidKeys = {
  publicKey: '',
  privateKey: '',
};

try {
  if (fs.existsSync(VAPID_KEYS_FILE)) {
    const rawKeys = fs.readFileSync(VAPID_KEYS_FILE, 'utf-8');
    vapidKeys = JSON.parse(rawKeys);
  }
} catch (e) {
  console.warn('Could not read VAPID keys:', e);
}

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(vapidKeys, null, 2));
    console.log('Generated new VAPID keys for DIRA Web Push Notifications.');
  } catch (e) {
    console.warn('Could not persist VAPID keys:', e);
  }
}

try {
  webpush.setVapidDetails(
    'mailto:alerts@dira.ke',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch (e) {
  console.warn('Error setting VAPID details:', e);
}

interface ServerPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  userName?: string;
  userRole?: string;
  userPhone?: string;
  deviceId?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

let pushSubscriptions: ServerPushSubscription[] = [];

try {
  if (fs.existsSync(PUSH_SUBS_FILE)) {
    const rawSubs = fs.readFileSync(PUSH_SUBS_FILE, 'utf-8');
    const parsed = JSON.parse(rawSubs);
    if (Array.isArray(parsed)) {
      pushSubscriptions = parsed;
      console.log(`Loaded ${pushSubscriptions.length} push subscriptions for phone background notifications.`);
    }
  }
} catch (e) {
  console.warn('Could not read push subscriptions file:', e);
}

function persistPushSubscriptions() {
  try {
    fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(pushSubscriptions, null, 2));
  } catch (e) {
    console.warn('Could not persist push subscriptions:', e);
  }
}

function cleanPhoneDigits(phone?: string): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

async function sendPushToSubscribers(options: {
  targetUserIds?: string[];
  targetPhones?: string[];
  excludeUserId?: string;
  excludePhone?: string;
  payload: {
    type: 'CALL_INVITE' | 'CHAT_MESSAGE' | 'CASE_ALERT';
    title: string;
    body: string;
    url?: string;
    tag?: string;
    callId?: string;
    channelId?: string;
    messageId?: string;
    requireInteraction?: boolean;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string }>;
    [key: string]: any;
  };
}) {
  const { targetUserIds, targetPhones, excludeUserId, excludePhone, payload } = options;
  const cleanExclude = cleanPhoneDigits(excludePhone);
  const cleanTargets = (targetPhones || []).map(p => cleanPhoneDigits(p)).filter(Boolean);

  const matched = pushSubscriptions.filter(sub => {
    // Exclude sender
    if (excludeUserId && sub.userId === excludeUserId) return false;
    if (cleanExclude && sub.userPhone && cleanPhoneDigits(sub.userPhone) === cleanExclude) return false;

    // Filter by targets if specified
    if ((targetUserIds && targetUserIds.length > 0) || cleanTargets.length > 0) {
      const idMatch = sub.userId && targetUserIds?.includes(sub.userId);
      const phoneMatch = sub.userPhone && cleanTargets.includes(cleanPhoneDigits(sub.userPhone));
      return Boolean(idMatch || phoneMatch);
    }

    return true; // Broadcast to all registered phone subscribers
  });

  if (matched.length === 0) return;

  const expiredEndpoints: string[] = [];

  const promises = matched.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: payload.type === 'CALL_INVITE' ? 90 : 86400,
          urgency: payload.type === 'CALL_INVITE' ? 'high' : 'normal',
        }
      );
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        expiredEndpoints.push(sub.endpoint);
      }
    }
  });

  await Promise.allSettled(promises);

  if (expiredEndpoints.length > 0) {
    pushSubscriptions = pushSubscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
    persistPushSubscriptions();
  }
}

interface ServerChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhone?: string;
  senderRole?: string;
  senderSubCounty?: string;
  channelId: string;
  content: string;
  timestamp: string;
  caseTrackingCode?: string;
  location?: { latitude: number; longitude: number; name?: string };
  mediaAttachment?: any;
  voiceNote?: any;
  delivered?: boolean;
}

interface ServerUserProfile {
  id: string;
  name: string;
  phone?: string;
  password?: string;
  role?: string;
  roleTitle?: string;
  designation?: string;
  subCounty?: string;
  village?: string;
  email?: string;
  organization?: string;
  badgeNumber?: string;
  coordinates?: { lat: number; lng: number };
  lastKnownLocation?: any;
  updatedAt?: string;
}

interface VerificationCodeItem {
  email: string;
  code: string;
  purpose: 'signup_verification' | 'password_reset';
  createdAt: number;
  expiresAt: number;
}

let chatMessages: ServerChatMessage[] = [];
let registeredUsers: ServerUserProfile[] = [
  {
    id: 'usr-super-admin',
    name: 'Super Admin',
    phone: 'admin',
    email: 'admin@dira.ke',
    role: 'super_admin',
    roleTitle: 'System Super Administrator',
    designation: 'Super Administrator',
    subCounty: 'Kitui Central',
    village: 'County Command HQ',
    organization: 'DIRA County Administration',
    badgeNumber: 'SUPER-ADMIN-01',
  }
];

// Load initial messages and users from file if exists
try {
  if (fs.existsSync(CHAT_DATA_FILE)) {
    const raw = fs.readFileSync(CHAT_DATA_FILE, 'utf-8');
    chatMessages = JSON.parse(raw);
    console.log(`Loaded ${chatMessages.length} messages from server storage.`);
  }
} catch (e) {
  console.warn('Could not load chat data file:', e);
}

try {
  if (fs.existsSync(USERS_DATA_FILE)) {
    const raw = fs.readFileSync(USERS_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      registeredUsers = parsed;
      console.log(`Loaded ${registeredUsers.length} registered users from server storage.`);
    }
  }
} catch (e) {
  console.warn('Could not load users data file:', e);
}

function persistChatMessages() {
  try {
    fs.writeFileSync(CHAT_DATA_FILE, JSON.stringify(chatMessages.slice(-500), null, 2));
  } catch (e) {
    console.warn('Could not persist chat data:', e);
  }
}

function persistUsers() {
  try {
    fs.writeFileSync(USERS_DATA_FILE, JSON.stringify(registeredUsers, null, 2));
  } catch (e) {
    console.warn('Could not persist users data:', e);
  }
}

// In-memory verification codes cache with file backup
let verificationCodes: VerificationCodeItem[] = [];
try {
  if (fs.existsSync(CODES_DATA_FILE)) {
    const raw = fs.readFileSync(CODES_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      verificationCodes = parsed.filter(c => c.expiresAt > Date.now());
    }
  }
} catch (e) {
  console.warn('Could not load codes data file:', e);
}

function persistCodes() {
  try {
    // Purge expired codes before saving
    verificationCodes = verificationCodes.filter(c => c.expiresAt > Date.now());
    fs.writeFileSync(CODES_DATA_FILE, JSON.stringify(verificationCodes, null, 2));
  } catch (e) {
    console.warn('Could not persist codes data:', e);
  }
}

/**
 * Dispatch real verification or password reset security code to user email
 */
async function sendVerificationEmail(
  toEmail: string,
  code: string,
  purpose: 'signup_verification' | 'password_reset',
  recipientName?: string
): Promise<{ success: boolean; message: string; previewCode?: string }> {
  const isReset = purpose === 'password_reset';
  const cleanEmail = toEmail.trim().toLowerCase();
  const subject = isReset 
    ? `DIRA Kaa Rada: Your Password Reset Code is ${code}`
    : `DIRA Kaa Rada: Your Email Verification Code is ${code}`;
  
  const textContent = `Jambo ${recipientName || 'Member'}!

Your DIRA (Donkey Incident Reporting APP - Kaa Rada) security code is:

[ ${code} ]

Purpose: ${isReset ? 'Reset your account password' : 'Sign up and verify your email'}
This code will expire in 15 minutes.

If you did not request this, please disregard this email.
Caritas Kitui & DIRA Community Welfare Network.`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; background-color: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #ef4444; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 6px 0;">DIRA • KAA RADA!</h1>
        <p style="color: #a1a1aa; font-size: 13px; margin: 0;">Caritas Kitui Donkey Welfare & Incident Reporting Network</p>
      </div>

      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <p style="color: #d4d4d8; font-size: 14px; margin: 0 0 16px 0; font-weight: 500;">
          ${isReset ? 'You requested to reset your password. Use the verification code below to set up your new password:' : 'Welcome to DIRA! Use the 6-digit verification code below to complete your registration:'}
        </p>
        
        <div style="display: inline-block; background-color: #27272a; border: 1px solid #ef4444; border-radius: 10px; padding: 14px 28px; margin-bottom: 16px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #ffffff;">${code}</span>
        </div>

        <p style="color: #71717a; font-size: 12px; margin: 0;">
          ⏱️ This verification code is valid for <strong>15 minutes</strong>.
        </p>
      </div>

      <p style="color: #71717a; font-size: 12px; text-align: center; margin: 0 0 16px 0;">
        If you did not initiate this request, you can safely ignore this email. Your credentials remain safe.
      </p>

      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <span style="color: #52525b; font-size: 11px;">Kitui County Community Welfare & Animal Protection • Kenya</span>
      </div>
    </div>
  `;

  let emailDelivered = false;

  // 1. Try Resend API if RESEND_API_KEY is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM || 'DIRA Welfare <onboarding@resend.dev>',
          to: [cleanEmail],
          subject: subject,
          text: textContent,
          html: htmlContent
        })
      });
      if (res.ok) {
        emailDelivered = true;
        console.log(`[DIRA Email] Sent via Resend to ${cleanEmail}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('[DIRA Email] Resend returned non-ok:', errData);
      }
    } catch (e: any) {
      console.warn('[DIRA Email] Resend fetch error:', e?.message || e);
    }
  }

  // 2. Try SMTP if SMTP_HOST and SMTP_USER are configured
  if (!emailDelivered && process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"DIRA Support" <${process.env.SMTP_USER}>`,
        to: cleanEmail,
        subject: subject,
        text: textContent,
        html: htmlContent,
      });

      emailDelivered = true;
      console.log(`[DIRA Email] Sent via SMTP to ${cleanEmail}`);
    } catch (e: any) {
      console.warn('[DIRA Email] SMTP sendMail error:', e?.message || e);
    }
  }

  // Always log to server output so development and testing can verify codes without delay
  console.log(`[DIRA Security Code] Code for ${cleanEmail}: [${code}] (Purpose: ${purpose}, Delivered via Provider: ${emailDelivered})`);

  return {
    success: true,
    message: emailDelivered 
      ? `Verification code sent to ${cleanEmail}. Please check your inbox and spam folder.`
      : `Verification code generated for ${cleanEmail}. Check your email or preview code below.`,
    previewCode: code,
  };
}

// Active Server-Sent Events (SSE) connections for instant cross-device broadcast
type SSEClient = { id: string; userId?: string; userPhone?: string; res: express.Response };
const sseClients: SSEClient[] = [];

function broadcastToClients(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      if (client.res.destroyed || client.res.writableEnded) {
        sseClients.splice(i, 1);
        continue;
      }
      client.res.write(payload);
      if (typeof (client.res as any).flush === 'function') {
        (client.res as any).flush();
      }
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// CALLS & REAL-TIME WEBRTC SIGNALING STATE
// ---------------------------------------------------------------------------
interface ServerCallSession {
  callId: string;
  channelId?: string;
  channelName?: string;
  callType: 'audio' | 'video';
  isGroup: boolean;
  initiator: {
    id: string;
    name: string;
    role?: string;
    phone?: string;
  };
  initiatorDeviceId?: string;
  targetDeviceId?: string;
  targetUser?: {
    id: string;
    name: string;
    phone?: string;
    role?: string;
  };
  participants: Array<{
    id: string;
    name: string;
    phone?: string;
    role?: string;
    subCounty?: string;
    isMuted?: boolean;
    isVideoOff?: boolean;
    isScreenSharing?: boolean;
    joinedAt: string;
    lastPing: number;
  }>;
  status: 'calling' | 'ringing' | 'connected' | 'ended' | 'rejected';
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
}

const activeCalls: Map<string, ServerCallSession> = new Map();
const onlineUsers: Map<string, { id: string; name: string; role?: string; phone?: string; lastSeen: number }> = new Map();

// In-memory buffer for recent WebRTC signals to ensure no dropped signals
interface StoredCallSignal {
  id: string;
  callId: string;
  signal: any;
  timestamp: number;
}
let recentCallSignals: StoredCallSignal[] = [];

// Helper to clean up stale calls and dead participant connections
setInterval(() => {
  const now = Date.now();
  for (const [callId, call] of activeCalls.entries()) {
    // If call is ended and older than 60s, purge
    if (call.status === 'ended' || call.status === 'rejected') {
      const endedTime = call.endedAt ? new Date(call.endedAt).getTime() : 0;
      if (now - endedTime > 60000) {
        activeCalls.delete(callId);
      }
      continue;
    }

    // Prune stale participants who haven't pinged in 35s
    const validParticipants = call.participants.filter(p => now - p.lastPing < 35000);
    if (validParticipants.length !== call.participants.length) {
      call.participants = validParticipants;
      if (call.participants.length === 0) {
        call.status = 'ended';
        call.endedAt = new Date().toISOString();
        broadcastToClients({ type: 'CALL_ENDED', callId, reason: 'timeout' });
      } else {
        broadcastToClients({ type: 'CALL_UPDATED', call });
      }
    }
  }

  // Prune online users older than 45s
  for (const [userId, user] of onlineUsers.entries()) {
    if (now - user.lastSeen > 45000) {
      onlineUsers.delete(userId);
    }
  }
}, 15000);


// ---------------------------------------------------------------------------
// API ROUTES FIRST
// ---------------------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    totalMessages: chatMessages.length,
    activeSSEListeners: sseClients.length,
    serverTime: new Date().toISOString()
  });
});

// GET all messages (optional channel filter)
app.get('/api/chat/messages', (req, res) => {
  const channelId = req.query.channelId as string | undefined;
  if (channelId && channelId !== 'all') {
    return res.json({
      status: 'ok',
      messages: chatMessages.filter(m => m.channelId === channelId)
    });
  }
  res.json({
    status: 'ok',
    messages: chatMessages
  });
});

// GET all registered users
app.get('/api/users', (req, res) => {
  res.json({
    status: 'ok',
    users: registeredUsers
  });
});

// POST register or update user profile across all connected devices
app.post('/api/users', (req, res) => {
  const incomingUser = req.body as ServerUserProfile;
  if (!incomingUser || !incomingUser.id) {
    return res.status(400).json({ error: 'Missing user ID' });
  }

  const existingIdx = registeredUsers.findIndex(u => u.id === incomingUser.id || (incomingUser.phone && u.phone === incomingUser.phone));
  const mergedUser: ServerUserProfile = {
    ...((existingIdx >= 0 ? registeredUsers[existingIdx] : {}) as ServerUserProfile),
    ...incomingUser,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    registeredUsers[existingIdx] = mergedUser;
  } else {
    registeredUsers.push(mergedUser);
  }

  persistUsers();

  // Broadcast user update to all connected clients immediately
  broadcastToClients({ type: 'USER_UPDATED', user: mergedUser });

  res.json({ status: 'ok', user: mergedUser });
});

// ---------------------------------------------------------------------------
// EMAIL VERIFICATION CODE & PASSWORD RESET ROUTES
// ---------------------------------------------------------------------------

// POST send 6-digit email verification security code
app.post('/api/auth/send-code', async (req, res) => {
  const { email, purpose = 'signup_verification', name } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const validPurpose = purpose === 'password_reset' ? 'password_reset' : 'signup_verification';

  // Generate 6-digit numeric security code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes

  // Store in memory & file backup
  const existingIdx = verificationCodes.findIndex(
    c => c.email.toLowerCase() === cleanEmail && c.purpose === validPurpose
  );

  const codeItem: VerificationCodeItem = {
    email: cleanEmail,
    code,
    purpose: validPurpose,
    createdAt: now,
    expiresAt,
  };

  if (existingIdx >= 0) {
    verificationCodes[existingIdx] = codeItem;
  } else {
    verificationCodes.push(codeItem);
  }
  persistCodes();

  try {
    const dispatchResult = await sendVerificationEmail(cleanEmail, code, validPurpose, name);
    res.json({
      status: 'ok',
      success: true,
      message: dispatchResult.message,
      email: cleanEmail,
      purpose: validPurpose,
      previewCode: dispatchResult.previewCode,
      expiresInMinutes: 15,
    });
  } catch (err: any) {
    console.error('Error dispatching verification email:', err);
    res.json({
      status: 'ok',
      success: true,
      message: `Code generated for ${cleanEmail}`,
      email: cleanEmail,
      purpose: validPurpose,
      previewCode: code,
      expiresInMinutes: 15,
    });
  }
});

// POST verify 6-digit security code
app.post('/api/auth/verify-code', (req, res) => {
  const { email, code, purpose = 'signup_verification' } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.toString().trim();
  const validPurpose = purpose === 'password_reset' ? 'password_reset' : 'signup_verification';

  const foundIdx = verificationCodes.findIndex(
    c => c.email.toLowerCase() === cleanEmail && c.purpose === validPurpose
  );

  if (foundIdx === -1) {
    return res.status(400).json({
      verified: false,
      error: 'No active verification code found for this email. Please request a new code.',
    });
  }

  const codeRecord = verificationCodes[foundIdx];
  if (Date.now() > codeRecord.expiresAt) {
    verificationCodes.splice(foundIdx, 1);
    persistCodes();
    return res.status(400).json({
      verified: false,
      error: 'Verification code has expired. Please request a new code.',
    });
  }

  if (codeRecord.code !== cleanCode) {
    return res.status(400).json({
      verified: false,
      error: 'Invalid verification code. Please check your email and try again.',
    });
  }

  res.json({
    status: 'ok',
    verified: true,
    message: 'Verification code confirmed successfully.',
  });
});

// POST reset password using verified code
app.post('/api/auth/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = newPassword.trim();
  const cleanCode = code ? code.toString().trim() : '';

  if (cleanPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  // Verify code if provided
  if (cleanCode) {
    const foundIdx = verificationCodes.findIndex(
      c => c.email.toLowerCase() === cleanEmail && c.purpose === 'password_reset'
    );
    if (foundIdx !== -1) {
      const codeRecord = verificationCodes[foundIdx];
      if (Date.now() <= codeRecord.expiresAt && codeRecord.code === cleanCode) {
        // Valid code, remove after use
        verificationCodes.splice(foundIdx, 1);
        persistCodes();
      } else if (Date.now() > codeRecord.expiresAt) {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
      } else {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }
    }
  }

  // Find user by email in registered users
  const userIdx = registeredUsers.findIndex(
    u => u.email && u.email.toLowerCase() === cleanEmail
  );

  let updatedUser: ServerUserProfile;
  if (userIdx >= 0) {
    registeredUsers[userIdx] = {
      ...registeredUsers[userIdx],
      password: cleanPassword,
      updatedAt: new Date().toISOString(),
    };
    updatedUser = registeredUsers[userIdx];
  } else {
    // If not found in memory, create a record so the user can log in
    updatedUser = {
      id: `usr-${Date.now().toString(36)}`,
      name: cleanEmail.split('@')[0],
      email: cleanEmail,
      password: cleanPassword,
      role: 'primary_user',
      roleTitle: 'Community Member',
      designation: 'Community Member',
      updatedAt: new Date().toISOString(),
    };
    registeredUsers.push(updatedUser);
  }

  persistUsers();
  broadcastToClients({ type: 'USER_UPDATED', user: updatedUser });

  res.json({
    status: 'ok',
    success: true,
    message: 'Password reset successfully! You can now log in with your new password.',
    user: updatedUser,
  });
});

// GET find user by email or phone
app.get('/api/auth/find-user', (req, res) => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const cleanDigits = query.replace(/\D/g, '');
  const user = registeredUsers.find(u => {
    if (u.email && u.email.toLowerCase() === query) return true;
    if (u.phone) {
      if (u.phone.toLowerCase() === query) return true;
      const uDigits = u.phone.replace(/\D/g, '');
      if (cleanDigits.length >= 7 && (uDigits.includes(cleanDigits) || cleanDigits.includes(uDigits))) return true;
    }
    return false;
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Return user info (excluding password in response for safety, or minimal data)
  res.json({
    status: 'ok',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      roleTitle: user.roleTitle,
      designation: user.designation,
    }
  });
});

// POST new message (broadcasts to all connected devices in real time)
app.post('/api/chat/messages', (req, res) => {
  const incoming = req.body as ServerChatMessage;
  if (!incoming || !incoming.id) {
    return res.status(400).json({ error: 'Missing required message parameters' });
  }

  // Fallback content if empty text but attachment/voice/location present
  if (!incoming.content || !incoming.content.trim()) {
    if (incoming.mediaAttachment) {
      incoming.content = incoming.mediaAttachment.type === 'image' ? '📷 Photo' : `📄 ${incoming.mediaAttachment.fileName || 'Attachment'}`;
    } else if (incoming.voiceNote) {
      incoming.content = '🎤 Voice note';
    } else if (incoming.location) {
      incoming.content = '📍 Location shared';
    } else {
      incoming.content = 'Message';
    }
  }

  // Deduplicate
  const existingIdx = chatMessages.findIndex(m => m.id === incoming.id);
  if (existingIdx >= 0) {
    chatMessages[existingIdx] = incoming;
  } else {
    chatMessages.push(incoming);
  }

  // Sort chronological
  chatMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Keep latest 500
  if (chatMessages.length > 500) {
    chatMessages = chatMessages.slice(-500);
  }

  // Save to disk
  persistChatMessages();

  // Instant real-time broadcast to all connected devices via SSE
  broadcastToClients({ type: 'NEW_MESSAGE', message: incoming });

  // Dispatch background Push Notification to phones even when app is closed
  const channelLabels: Record<string, string> = {
    general: 'Wanajamii Alerts',
    cases: 'Case Discussions',
    rescue: 'Search & Rescue',
    officers: 'Officers Desk',
  };
  const chLabel = channelLabels[incoming.channelId] || `#${incoming.channelId}`;
  const previewText = incoming.content || (incoming.voiceNote ? '🎤 Sent a voice note' : (incoming.mediaAttachment ? '📎 Sent an attachment' : 'Sent a message'));

  sendPushToSubscribers({
    excludeUserId: incoming.senderId,
    excludePhone: incoming.senderPhone,
    payload: {
      type: 'CHAT_MESSAGE',
      title: `💬 ${incoming.senderName} (${chLabel})`,
      body: previewText.length > 120 ? `${previewText.slice(0, 120)}...` : previewText,
      url: `/?channel=${incoming.channelId}`,
      tag: `dira-chat-${incoming.channelId}`,
      channelId: incoming.channelId,
      messageId: incoming.id,
      requireInteraction: false,
      vibrate: [250, 100, 250],
      actions: [
        { action: 'open_chat', title: '💬 Open Chat' }
      ]
    }
  }).catch(err => console.warn('Background chat push notification failed:', err));

  res.json({ status: 'ok', message: incoming });
});

// SSE endpoint for instant live push to phones and browsers
app.get('/api/chat/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
  res.flushHeaders();

  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const userId = req.query.userId as string | undefined;
  const client: SSEClient = { id: clientId, userId, res };
  sseClients.push(client);

  if (userId) {
    onlineUsers.set(userId, {
      id: userId,
      name: (req.query.userName as string) || 'User',
      role: req.query.userRole as string | undefined,
      phone: req.query.userPhone as string | undefined,
      lastSeen: Date.now(),
    });
  }

  // Send initial handshake ping
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', totalMessages: chatMessages.length, activeCalls: Array.from(activeCalls.values()).filter(c => c.status !== 'ended') })}\n\n`);

  // Heartbeat ping every 25 seconds to keep connection alive through cloud proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx >= 0) {
      sseClients.splice(idx, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// CALL MANAGEMENT & SIGNALING API ROUTES
// ---------------------------------------------------------------------------

// Presence heartbeat
app.post('/api/presence/ping', (req, res) => {
  const { userId, name, role, phone } = req.body;
  if (userId) {
    onlineUsers.set(userId, {
      id: userId,
      name: name || 'User',
      role,
      phone,
      lastSeen: Date.now(),
    });
  }
  res.json({ status: 'ok', onlineCount: onlineUsers.size });
});

// List currently online users
app.get('/api/presence/online', (req, res) => {
  const users = Array.from(onlineUsers.values());
  res.json({ status: 'ok', users });
});

// List all active calls
app.get('/api/calls/active', (req, res) => {
  const channelId = req.query.channelId as string | undefined;
  let calls = Array.from(activeCalls.values()).filter(c => c.status !== 'ended' && c.status !== 'rejected');
  if (channelId) {
    calls = calls.filter(c => c.channelId === channelId);
  }
  res.json({ status: 'ok', calls });
});

// Initiate a call (Group or 1-on-1 Direct)
app.post('/api/calls/initiate', (req, res) => {
  const { callId, channelId, channelName, callType, isGroup, initiator, initiatorDeviceId, targetDeviceId, targetUser } = req.body;
  if (!callId || !initiator) {
    return res.status(400).json({ error: 'Missing callId or initiator' });
  }

  // Enforce: ONLY ONE user can initiate a group call in a channel at a given time
  if (isGroup) {
    const effectiveChannelId = channelId || 'general';
    const effectiveChannelName = channelName || effectiveChannelId;

    // Clean up any stale group calls whose participants stopped pinging over 60 seconds ago
    const staleCutoff = Date.now() - 60000;
    for (const [id, c] of activeCalls.entries()) {
      if (c.isGroup && (c.channelId === effectiveChannelId || !c.channelId) && c.status !== 'ended' && c.status !== 'rejected') {
        const latestPing = Math.max(...c.participants.map(p => p.lastPing || 0), 0);
        if (latestPing > 0 && latestPing < staleCutoff) {
          c.status = 'ended';
          c.endedAt = new Date().toISOString();
        }
      }
    }

    const existingGroupCall = Array.from(activeCalls.values()).find(
      c => c.isGroup && (c.channelId === effectiveChannelId || !c.channelId) && c.status !== 'ended' && c.status !== 'rejected'
    );

    if (existingGroupCall) {
      console.log(`[Calls] Rejecting duplicate group call for #${effectiveChannelName}. Active call: ${existingGroupCall.callId}`);
      return res.status(409).json({
        status: 'error',
        code: 'GROUP_CALL_ALREADY_ACTIVE',
        message: `A group call is already active in #${effectiveChannelName}. The rest can join.`,
        call: existingGroupCall,
      });
    }
  }

  const now = new Date().toISOString();
  const newCall: ServerCallSession = {
    callId,
    channelId,
    channelName,
    callType: callType || 'video',
    isGroup: Boolean(isGroup),
    initiator,
    initiatorDeviceId,
    targetDeviceId,
    targetUser,
    participants: [{
      id: initiator.id,
      name: initiator.name,
      role: initiator.role,
      phone: initiator.phone,
      joinedAt: now,
      lastPing: Date.now(),
      isMuted: false,
      isVideoOff: false,
    }],
    status: 'ringing',
    startedAt: now,
    connectedAt: undefined,
  };

  activeCalls.set(callId, newCall);

  // Broadcast call invite / room creation to all clients via SSE
  broadcastToClients({
    type: 'CALL_INVITE',
    call: newCall,
    caller: initiator,
    initiatorDeviceId,
    targetDeviceId,
    targetUserId: targetUser?.id,
    targetPhone: targetUser?.phone,
    targetName: targetUser?.name,
    channelId,
  });

  // Dispatch background Push Notification so user receives call alert even when phone app is closed
  if (!newCall.isGroup && targetUser) {
    sendPushToSubscribers({
      targetUserIds: targetUser.id ? [targetUser.id] : undefined,
      targetPhones: targetUser.phone ? [targetUser.phone] : undefined,
      excludeUserId: initiator.id,
      excludePhone: initiator.phone,
      payload: {
        type: 'CALL_INVITE',
        callId: newCall.callId,
        channelId: newCall.channelId,
        channelName: newCall.channelName,
        callType: newCall.callType,
        isGroup: false,
        callerName: initiator.name,
        callerRole: initiator.roleTitle || initiator.role || 'Officer',
        title: `📞 Incoming ${newCall.callType === 'video' ? 'Video' : 'Voice'} Call: ${initiator.name}`,
        body: `${initiator.roleTitle || initiator.role || 'User'} is calling you on DIRA. Tap to answer.`,
        url: `/?callId=${newCall.callId}&action=answer`,
        tag: `dira-call-${newCall.callId}`,
        requireInteraction: true,
        vibrate: [500, 250, 500, 250, 500, 250, 500],
        actions: [
          { action: 'answer', title: '🟢 Answer Call' },
          { action: 'decline', title: '🔴 Decline' }
        ]
      }
    }).catch(err => console.warn('Direct call push delivery note:', err));
  } else {
    sendPushToSubscribers({
      excludeUserId: initiator.id,
      excludePhone: initiator.phone,
      payload: {
        type: 'CALL_INVITE',
        callId: newCall.callId,
        channelId: newCall.channelId,
        channelName: newCall.channelName,
        callType: newCall.callType,
        isGroup: true,
        callerName: initiator.name,
        callerRole: initiator.roleTitle || initiator.role || 'Officer',
        title: `📞 DIRA Group ${newCall.callType === 'video' ? 'Video' : 'Voice'} Call: #${newCall.channelName || newCall.channelId || 'general'}`,
        body: `${initiator.name} started a group call. Tap to join.`,
        url: `/?callId=${newCall.callId}&action=answer`,
        tag: `dira-call-${newCall.callId}`,
        requireInteraction: true,
        vibrate: [500, 250, 500, 250, 500, 250, 500],
        actions: [
          { action: 'answer', title: '🟢 Join Call' },
          { action: 'decline', title: 'Dismiss' }
        ]
      }
    }).catch(err => console.warn('Group call push delivery note:', err));
  }

  res.json({ status: 'ok', call: newCall });
});

// Ping an ongoing call to prevent stale timeout
app.post('/api/calls/ping', (req, res) => {
  const { callId, participantId } = req.body;
  if (callId) {
    const call = activeCalls.get(callId);
    if (call) {
      if (participantId) {
        const p = call.participants.find(part => part.id === participantId);
        if (p) p.lastPing = Date.now();
      } else {
        // Ping all participants if not specified
        call.participants.forEach(p => p.lastPing = Date.now());
      }
    }
  }
  res.json({ status: 'ok' });
});

// Join an ongoing call
app.post('/api/calls/join', (req, res) => {
  const { callId, participant } = req.body;
  if (!callId || !participant || !participant.id) {
    return res.status(400).json({ error: 'Missing callId or participant' });
  }

  const call = activeCalls.get(callId);
  if (!call) {
    return res.status(404).json({ error: 'Call session not found' });
  }

  const existingIdx = call.participants.findIndex(p => p.id === participant.id);
  const now = new Date().toISOString();
  const participantEntry = {
    id: participant.id,
    name: participant.name,
    phone: participant.phone,
    role: participant.role,
    subCounty: participant.subCounty,
    isMuted: Boolean(participant.isMuted),
    isVideoOff: Boolean(participant.isVideoOff),
    joinedAt: now,
    lastPing: Date.now(),
  };

  if (existingIdx >= 0) {
    call.participants[existingIdx] = participantEntry;
  } else {
    call.participants.push(participantEntry);
  }

  call.status = 'connected';
  if (!call.connectedAt) {
    call.connectedAt = now;
  }

  broadcastToClients({
    type: 'CALL_PARTICIPANT_JOINED',
    callId,
    participant: participantEntry,
    call,
  });

  broadcastToClients({
    type: 'CALL_UPDATED',
    call,
  });

  res.json({ status: 'ok', call });
});

// Leave a call
app.post('/api/calls/leave', (req, res) => {
  const { callId, participantId } = req.body;
  if (!callId || !participantId) {
    return res.status(400).json({ error: 'Missing callId or participantId' });
  }

  const call = activeCalls.get(callId);
  if (!call) {
    return res.json({ status: 'ok' });
  }

  call.participants = call.participants.filter(p => p.id !== participantId);

  broadcastToClients({
    type: 'CALL_PARTICIPANT_LEFT',
    callId,
    participantId,
  });

  // If 1-on-1 call and either user left, or group call and 0 participants left -> end call
  if (call.participants.length === 0 || (!call.isGroup && (call.initiator.id === participantId || call.targetUser?.id === participantId))) {
    call.status = 'ended';
    call.endedAt = new Date().toISOString();

    const durSec = call.connectedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(call.connectedAt).getTime()) / 1000))
      : 0;
    const mins = Math.floor(durSec / 60);
    const secs = durSec % 60;
    const durFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    broadcastToClients({
      type: 'CALL_ENDED',
      callId,
      reason: 'participant_left',
      duration: durFormatted,
      endedAt: call.endedAt,
      call,
    });

    if (call.channelId) {
      const callEndMsg: ServerChatMessage = {
        id: `msg-end-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: 'system',
        senderName: 'DIRA Dispatch System',
        senderRole: 'system',
        channelId: call.channelId,
        content: `📞 ${call.isGroup ? 'Group' : 'Direct'} ${call.callType} call ended • Duration: ${durFormatted} • Participants: ${call.participants.length + 1}`,
        timestamp: new Date().toISOString(),
        delivered: true,
      };
      chatMessages.push(callEndMsg);
      persistChatMessages();
      broadcastToClients({ type: 'NEW_MESSAGE', message: callEndMsg });
    }
  } else {
    broadcastToClients({
      type: 'CALL_UPDATED',
      call,
    });
  }

  res.json({ status: 'ok', call });
});

// End / Reject a call
app.post('/api/calls/end', (req, res) => {
  const { callId, reason } = req.body;
  if (!callId) {
    return res.status(400).json({ error: 'Missing callId' });
  }

  const call = activeCalls.get(callId);
  let durFormatted = '00:00';
  if (call) {
    call.status = reason === 'rejected' ? 'rejected' : 'ended';
    call.endedAt = new Date().toISOString();

    const durSec = call.connectedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(call.connectedAt).getTime()) / 1000))
      : 0;
    const mins = Math.floor(durSec / 60);
    const secs = durSec % 60;
    durFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (call.channelId) {
      const statusLabel = reason === 'rejected' ? 'Declined / Missed' : `Completed (${durFormatted})`;
      const callEndMsg: ServerChatMessage = {
        id: `msg-end-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: 'system',
        senderName: 'DIRA Dispatch System',
        senderRole: 'system',
        channelId: call.channelId,
        content: `📞 ${call.isGroup ? 'Group' : 'Direct'} ${call.callType} call ended • Status: ${statusLabel}`,
        timestamp: new Date().toISOString(),
        delivered: true,
      };
      chatMessages.push(callEndMsg);
      persistChatMessages();
      broadcastToClients({ type: 'NEW_MESSAGE', message: callEndMsg });
    }
  }

  broadcastToClients({
    type: 'CALL_ENDED',
    callId,
    reason: reason || 'hangup',
    duration: durFormatted,
    endedAt: call?.endedAt || new Date().toISOString(),
    call,
  });

  res.json({ status: 'ok', duration: durFormatted });
});

// WebRTC Signaling Relay (Offers, Answers, ICE candidates, Mute state)
app.post('/api/calls/signal', (req, res) => {
  const signal = req.body;
  if (!signal || !signal.callId || !signal.type) {
    return res.status(400).json({ error: 'Invalid signal payload' });
  }

  // Store in circular buffer for reconnecting / polling clients
  recentCallSignals.push({
    id: `sig-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    callId: signal.callId,
    signal,
    timestamp: Date.now(),
  });
  // Keep latest 200 signals and prune older than 2 minutes
  const twoMinutesAgo = Date.now() - 120000;
  if (recentCallSignals.length > 200) {
    recentCallSignals = recentCallSignals.filter(s => s.timestamp > twoMinutesAgo);
  }

  const call = activeCalls.get(signal.callId);

  // When call is accepted, update call state to connected and broadcast update immediately
  if (signal.type === 'CALL_ACCEPT') {
    if (call) {
      call.status = 'connected';
      if (!call.connectedAt) {
        call.connectedAt = new Date().toISOString();
      }
      if (signal.participant) {
        const existingIdx = call.participants.findIndex(p => p.id === signal.participant.id || (p.phone && p.phone === signal.participant.phone));
        if (existingIdx >= 0) {
          call.participants[existingIdx] = {
            ...call.participants[existingIdx],
            ...signal.participant,
            lastPing: Date.now(),
          };
        } else {
          call.participants.push({
            ...signal.participant,
            lastPing: Date.now(),
          });
        }
      }
      broadcastToClients({
        type: 'CALL_UPDATED',
        call,
      });
    }
  }

  // Handle participant join in group calls
  if (signal.type === 'CALL_JOIN') {
    if (call) {
      call.status = 'connected';
      if (!call.connectedAt) {
        call.connectedAt = new Date().toISOString();
      }
      if (signal.participant) {
        const existingIdx = call.participants.findIndex(p => p.id === signal.participant.id || (p.phone && p.phone === signal.participant.phone));
        if (existingIdx >= 0) {
          call.participants[existingIdx] = {
            ...call.participants[existingIdx],
            ...signal.participant,
            lastPing: Date.now(),
          };
        } else {
          call.participants.push({
            ...signal.participant,
            lastPing: Date.now(),
          });
        }
      }
      broadcastToClients({
        type: 'CALL_UPDATED',
        call,
      });
    }
  }

  // Handle screen sharing and participant audio/video state updates
  if (signal.type === 'CALL_PARTICIPANT_UPDATE') {
    if (call && signal.participant) {
      const idx = call.participants.findIndex(p => p.id === signal.participant.id || (p.phone && p.phone === signal.participant.phone));
      if (idx >= 0) {
        call.participants[idx] = {
          ...call.participants[idx],
          ...signal.participant,
          lastPing: Date.now(),
        };
      } else {
        call.participants.push({
          ...signal.participant,
          lastPing: Date.now(),
        });
      }
      // If someone enabled screen share, ensure call type is video
      if (signal.participant.isScreenSharing) {
        call.callType = 'video';
      }
      broadcastToClients({
        type: 'CALL_UPDATED',
        call,
      });
    }
  }

  // Broadcast to all clients for real-time WebRTC negotiation
  broadcastToClients({
    type: 'CALL_SIGNAL',
    signal,
  });

  res.json({ status: 'ok' });
});

// Fetch missed or recent signals for a call
app.get('/api/calls/signals', (req, res) => {
  const callId = req.query.callId as string;
  const since = parseInt((req.query.since as string) || '0', 10);
  if (!callId) {
    return res.status(400).json({ error: 'Missing callId' });
  }
  const signals = recentCallSignals
    .filter(s => s.callId === callId && s.timestamp > since)
    .map(s => s.signal);
  res.json({ status: 'ok', signals });
});

// ---------------------------------------------------------------------------
// WEB PUSH NOTIFICATION API ROUTES (Background alerts when app is closed)
// ---------------------------------------------------------------------------

// Public VAPID key for browser clients to subscribe
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Register or update phone/browser push subscription
app.post('/api/push/subscribe', (req, res) => {
  const { subscription, userId, userName, userRole, userPhone, deviceId, userAgent } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const now = new Date().toISOString();
  const existingIdx = pushSubscriptions.findIndex(s => s.endpoint === subscription.endpoint);
  const newSubEntry: ServerPushSubscription = {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    userId: userId || undefined,
    userName: userName || undefined,
    userRole: userRole || undefined,
    userPhone: userPhone || undefined,
    deviceId: deviceId || undefined,
    userAgent: userAgent || undefined,
    createdAt: existingIdx >= 0 ? pushSubscriptions[existingIdx].createdAt : now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    pushSubscriptions[existingIdx] = newSubEntry;
  } else {
    pushSubscriptions.push(newSubEntry);
  }

  persistPushSubscriptions();
  console.log(`Saved push subscription for user ${userName || userId || 'Guest'} (${pushSubscriptions.length} total subscribers).`);
  res.json({ status: 'ok', subscribersCount: pushSubscriptions.length });
});

// Unsubscribe
app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== endpoint);
    persistPushSubscriptions();
  }
  res.json({ status: 'ok' });
});

// Trigger a live test push alert to a device
app.post('/api/push/test', async (req, res) => {
  const { endpoint, type = 'call' } = req.body;
  let targetSub: ServerPushSubscription | undefined;

  if (endpoint) {
    targetSub = pushSubscriptions.find(s => s.endpoint === endpoint);
  } else if (pushSubscriptions.length > 0) {
    targetSub = pushSubscriptions[pushSubscriptions.length - 1];
  }

  if (!targetSub) {
    return res.status(404).json({ error: 'No active push subscription found on server.' });
  }

  const isCall = type === 'call';
  const testPayload = {
    type: isCall ? 'CALL_INVITE' : 'CHAT_MESSAGE',
    title: isCall ? '📞 DIRA Test Emergency Call' : '💬 DIRA Test Broadcast Message',
    body: isCall
      ? 'Incoming phone call simulation. Your phone will ring even when DIRA is closed!'
      : 'Community alert simulation: Kaa-Rada incident message delivered to your device.',
    url: isCall ? '/?callId=test-call&action=answer' : '/?channel=general',
    tag: `dira-test-${Date.now()}`,
    callId: isCall ? 'test-call' : undefined,
    channelId: 'general',
    requireInteraction: isCall,
    vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [250, 100, 250],
    actions: isCall ? [
      { action: 'answer', title: '🟢 Answer Call' },
      { action: 'decline', title: '🔴 Decline' }
    ] : [
      { action: 'open_chat', title: '💬 Open Chat' }
    ]
  };

  try {
    await webpush.sendNotification(
      {
        endpoint: targetSub.endpoint,
        keys: {
          p256dh: targetSub.keys.p256dh,
          auth: targetSub.keys.auth,
        }
      },
      JSON.stringify(testPayload),
      { TTL: 60, urgency: 'high' }
    );
    res.json({ status: 'ok', message: 'Test push notification sent successfully.' });
  } catch (err: any) {
    console.error('Test push error:', err);
    res.status(500).json({ error: err.message || 'Push delivery failed' });
  }
});

// Query push statistics
app.get('/api/push/status', (req, res) => {
  res.json({
    status: 'ok',
    totalSubscribers: pushSubscriptions.length,
    vapidConfigured: Boolean(vapidKeys.publicKey),
  });
});


// ---------------------------------------------------------------------------
// VITE MIDDLEWARE / STATIC ASSETS
// ---------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DIRA Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
