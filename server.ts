import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Body parsers for JSON and attachments
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// In-memory chat storage with file-system persistence
const CHAT_DATA_FILE = path.join(process.cwd(), 'dira-chat-data.json');
const USERS_DATA_FILE = path.join(process.cwd(), 'dira-users-data.json');

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
  role?: string;
  roleTitle?: string;
  designation?: string;
  subCounty?: string;
  village?: string;
  email?: string;
  organization?: string;
  badgeNumber?: string;
  updatedAt?: string;
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
    status: isGroup ? 'connected' : 'ringing',
    startedAt: now,
    connectedAt: isGroup ? now : undefined,
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
    broadcastToClients({
      type: 'CALL_ENDED',
      callId,
      reason: 'participant_left',
    });
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
  if (call) {
    call.status = reason === 'rejected' ? 'rejected' : 'ended';
    call.endedAt = new Date().toISOString();
  }

  broadcastToClients({
    type: 'CALL_ENDED',
    callId,
    reason: reason || 'hangup',
  });

  res.json({ status: 'ok' });
});

// WebRTC Signaling Relay (Offers, Answers, ICE candidates, Mute state)
app.post('/api/calls/signal', (req, res) => {
  const signal = req.body;
  if (!signal || !signal.callId || !signal.type) {
    return res.status(400).json({ error: 'Invalid signal payload' });
  }

  // Broadcast to all clients for real-time WebRTC negotiation
  broadcastToClients({
    type: 'CALL_SIGNAL',
    signal,
  });

  res.json({ status: 'ok' });
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
