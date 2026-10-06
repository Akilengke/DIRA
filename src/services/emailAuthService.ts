import { doc, setDoc, getDoc, getFirestore } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebaseApp, firebaseAuth } from './firebaseAuth';
import { UserProfile } from '../types';
import {
  saveUserToDb,
  findUserByEmailOrPhone,
  getAllUsersFromDb,
} from './db';

const FIRESTORE_COLLECTION_CODES = 'dira_verification_codes';

export interface VerificationResult {
  success: boolean;
  message: string;
  previewCode?: string;
  email?: string;
}

/**
 * Dispatch a 6-digit verification code to the user's real email address
 * Handles server dispatch (SMTP / Resend), Firestore security token backup,
 * and Firebase Auth password reset triggers when applicable.
 */
export async function sendEmailVerificationCode(
  email: string,
  purpose: 'signup_verification' | 'password_reset' = 'signup_verification',
  name?: string
): Promise<VerificationResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      message: 'Please provide a valid email address.',
    };
  }

  let previewCode: string | undefined;
  let serverMessage = '';

  // 1. Call Full-Stack Server Email Dispatcher
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, purpose, name }),
    });

    const data = await res.json();
    if (data.previewCode) {
      previewCode = data.previewCode;
    }
    serverMessage = data.message || '';
  } catch (err) {
    console.warn('Server send-code notice:', err);
  }

  // 2. If previewCode was generated, also record it in Firestore as resilient cloud backup
  if (previewCode) {
    try {
      const firestore = getFirestore(firebaseApp);
      const codeDocId = `${cleanEmail.replace(/[^a-z0-9]/g, '_')}_${purpose}`;
      await setDoc(doc(firestore, FIRESTORE_COLLECTION_CODES, codeDocId), {
        email: cleanEmail,
        code: previewCode,
        purpose,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        used: false,
      });
    } catch (e) {
      console.warn('Firestore code backup notice:', e);
    }
  }

  // 3. If password reset, also trigger Firebase Auth's native password reset email as a complementary channel
  if (purpose === 'password_reset') {
    try {
      await sendPasswordResetEmail(firebaseAuth, cleanEmail);
      console.log('Firebase Auth native password reset email dispatched to:', cleanEmail);
    } catch (fbErr: any) {
      // It's normal if the user was registered in custom DB rather than Firebase Auth
      console.log('Firebase Auth reset info:', fbErr?.code || fbErr?.message);
    }
  }

  return {
    success: true,
    message: serverMessage || `Verification code sent to ${cleanEmail}. Check your inbox and spam folder.`,
    previewCode,
    email: cleanEmail,
  };
}

/**
 * Verify the 6-digit code entered by the user
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  purpose: 'signup_verification' | 'password_reset' = 'signup_verification'
): Promise<{ verified: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  if (!cleanEmail || !cleanCode) {
    return { verified: false, message: 'Email and verification code are required.' };
  }

  // 1. Check Full-Stack Server
  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, code: cleanCode, purpose }),
    });

    const data = await res.json();
    if (res.ok && data.verified) {
      return { verified: true, message: data.message || 'Code verified successfully.' };
    }
  } catch (err) {
    console.warn('Server verify-code notice:', err);
  }

  // 2. Firestore Cloud Backup Verification Fallback
  try {
    const firestore = getFirestore(firebaseApp);
    const codeDocId = `${cleanEmail.replace(/[^a-z0-9]/g, '_')}_${purpose}`;
    const snap = await getDoc(doc(firestore, FIRESTORE_COLLECTION_CODES, codeDocId));
    if (snap.exists()) {
      const data = snap.data();
      const isNotExpired = new Date(data.expiresAt).getTime() > Date.now();
      if (isNotExpired && data.code === cleanCode) {
        return { verified: true, message: 'Code verified successfully via cloud record.' };
      }
    }
  } catch (e) {
    console.warn('Firestore verify fallback notice:', e);
  }

  return {
    verified: false,
    message: 'Invalid or expired verification code. Please check your email and try again.',
  };
}

/**
 * Reset user password with verified security code
 * Updates password across Server, Cloud Firestore, IndexedDB, and LocalStorage
 */
export async function resetPasswordWithEmailCode(
  email: string,
  code: string,
  newPassword: string
): Promise<{ success: boolean; user?: UserProfile; message?: string; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = newPassword.trim();
  const cleanCode = code.trim();

  if (!cleanEmail) {
    return { success: false, error: 'Email address is required.' };
  }
  if (!cleanPass || cleanPass.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters long.' };
  }

  // 1. Verify code first
  const verification = await verifyEmailCode(cleanEmail, cleanCode, 'password_reset');
  if (!verification.verified) {
    return { success: false, error: verification.message };
  }

  // 2. Find the user in database
  let targetUser = await findUserByEmailOrPhone(cleanEmail);

  // If not found by exact email, search all users
  if (!targetUser) {
    const allUsers = await getAllUsersFromDb();
    targetUser = allUsers.find(u => u.email && u.email.toLowerCase() === cleanEmail) || null;
  }

  // 3. Update in Server Registry
  try {
    await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, code: cleanCode, newPassword: cleanPass }),
    });
  } catch (e) {
    console.warn('Server password reset sync notice:', e);
  }

  // 4. Update in Firestore, IndexedDB, and LocalStorage
  if (targetUser) {
    const updatedUser: UserProfile = {
      ...targetUser,
      password: cleanPass,
      updatedAt: new Date().toISOString(),
    };
    await saveUserToDb(updatedUser);
    return {
      success: true,
      user: updatedUser,
      message: 'Password reset successfully! You can now log in with your new password.',
    };
  } else {
    // If the account was registered without saving to DB yet, create a fresh valid profile
    const freshUser: UserProfile = {
      id: `usr-${Date.now().toString(36)}`,
      name: cleanEmail.split('@')[0],
      email: cleanEmail,
      phone: '',
      password: cleanPass,
      role: 'primary_user',
      roleTitle: 'Community Member',
      designation: 'Community Member',
      updatedAt: new Date().toISOString(),
    };
    await saveUserToDb(freshUser);
    return {
      success: true,
      user: freshUser,
      message: 'Password reset successfully! Account created with your new credentials.',
    };
  }
}
