import { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';
import { firebaseApp } from './firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DonkeyCase, UserProfile, DiraMessage } from '../types';
export { SUPER_ADMIN_ACCOUNT } from '../data/mockData';
import { SUPER_ADMIN_ACCOUNT } from '../data/mockData';

const DB_NAME = 'dira_donkey_db_v1';
const DB_VERSION = 2;
const STORE_CASES = 'cases';
const STORE_USERS = 'users';
const STORE_MESSAGES = 'messages';
const STORE_SYNC_QUEUE = 'sync_queue';
const STORE_META = 'metadata';

const STORAGE_KEY_CASES_LEGACY = 'kaa_rada_cases_v2';
const SAVED_PROFILES_KEY = 'kaa_rada_saved_profiles_v2';
const FIRESTORE_COLLECTION_CASES = 'dira_cases';
const FIRESTORE_COLLECTION_MESSAGES = 'dira_messages';
const FIRESTORE_COLLECTION_USERS = 'dira_users';
const FIRESTORE_COLLECTION_USERS_ALT = 'users';
const CHAT_BROADCAST_CHANNEL = 'dira_chat_broadcast_v1';

// Lazy Firestore instance
let firestoreDb: ReturnType<typeof getFirestore> | null = null;
export function getFirestoreClient() {
  if (!firestoreDb) {
    try {
      const dbId = (firebaseConfig as any)?.firestoreDatabaseId || undefined;
      firestoreDb = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    } catch (err) {
      console.warn('Firestore initialization warning (will use local IndexedDB):', err);
    }
  }
  return firestoreDb;
}

// ---------------------------------------------------------------------------
// FIRESTORE QUOTA CIRCUIT BREAKER & SAFETY
// ---------------------------------------------------------------------------
let isFirestoreQuotaExhausted = false;
let quotaExhaustedUntil = 0;
let hasEnsuredSuperAdminInCloud = false;

export function markFirestoreQuotaExhausted() {
  isFirestoreQuotaExhausted = true;
  // Cooldown for 5 minutes before re-attempting non-critical cloud operations
  quotaExhaustedUntil = Date.now() + 5 * 60 * 1000;
  console.warn('[Firestore] Daily quota limit reached. Gracefully operating in local offline/server mode.');
}

export function isFirestoreQuotaLimited(): boolean {
  if (isFirestoreQuotaExhausted) {
    if (Date.now() < quotaExhaustedUntil) {
      return true;
    }
    isFirestoreQuotaExhausted = false;
  }
  return false;
}

export function handleFirestoreError(err: any): boolean {
  if (!err) return false;
  const msg = err?.message || String(err || '');
  const code = err?.code || '';
  if (code === 'resource-exhausted' || msg.includes('Quota limit exceeded') || msg.includes('resource-exhausted')) {
    markFirestoreQuotaExhausted();
    return true;
  }
  return false;
}

/**
 * Open or upgrade the client-side IndexedDB database.
 * Provides high-performance, durable storage for APK and offline environments.
 */
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Cases store
      if (!db.objectStoreNames.contains(STORE_CASES)) {
        const casesStore = db.createObjectStore(STORE_CASES, { keyPath: 'id' });
        casesStore.createIndex('status', 'status', { unique: false });
        casesStore.createIndex('category', 'category', { unique: false });
        casesStore.createIndex('createdAt', 'createdAt', { unique: false });
        casesStore.createIndex('reportedByPhone', 'reportedByPhone', { unique: false });
      }

      // Users store
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        const usersStore = db.createObjectStore(STORE_USERS, { keyPath: 'phone' });
        usersStore.createIndex('role', 'role', { unique: false });
      }

      // In-App Community Messages store
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        msgStore.createIndex('channelId', 'channelId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Sync queue for offline mutations
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
      }

      // Metadata store (lastSync, app version)
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Helper to run a transaction on an IndexedDB store
 */
async function performDbTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest | void
): Promise<T> {
  const db = await openIndexedDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    let req: IDBRequest | void;
    try {
      req = callback(store);
    } catch (e) {
      return reject(e);
    }

    tx.oncomplete = () => {
      if (req && 'result' in req) {
        resolve(req.result as T);
      } else {
        resolve(undefined as unknown as T);
      }
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });
}

/**
 * Initialize the database:
 * 1. Opens IndexedDB
 * 2. Migrates any legacy localStorage records into IndexedDB
 * 3. Syncs with Firestore if online
 */
export async function initAppDatabase(): Promise<DonkeyCase[]> {
  try {
    const db = await openIndexedDb();
    console.log('DIRA Database initialized: IndexedDB ready');

    // 0. Purge legacy dummy accounts and seed Super Admin
    await purgeLegacyDummyAccounts();

    // 1. Check existing IndexedDB cases
    let localCases = await getAllCasesFromDb();

    // 2. Migration from legacy localStorage if IndexedDB is empty
    if (localCases.length === 0 && typeof window !== 'undefined') {
      try {
        const legacy = localStorage.getItem(STORAGE_KEY_CASES_LEGACY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`Migrating ${parsed.length} cases from legacy storage to IndexedDB`);
            await saveAllCasesToDb(parsed);
            localCases = parsed;
          }
        }
      } catch (e) {
        console.warn('Legacy migration notice:', e);
      }
    }

    // 3. Try to sync with Firestore in background if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => {
        syncCasesWithFirestore().catch(err => {
          console.warn('Background Firestore initial sync failed, working offline:', err);
        });
        // Seed or sync Super Admin in Firestore
        getAllUsersFromDb().catch(err => {
          console.warn('Background Firestore users sync warning:', err);
        });
      }, 1000);
    }

    return localCases;
  } catch (err) {
    console.error('Failed to initialize IndexedDB, falling back to localStorage:', err);
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CASES_LEGACY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Retrieve all cases from IndexedDB
 */
export async function getAllCasesFromDb(): Promise<DonkeyCase[]> {
  try {
    const items = await performDbTx<DonkeyCase[]>(STORE_CASES, 'readonly', (store) => {
      return store.getAll();
    });
    const list = items || [];
    return list.sort((a, b) => {
      const timeA = a?.reportedAt ? new Date(a.reportedAt).getTime() : 0;
      const timeB = b?.reportedAt ? new Date(b.reportedAt).getTime() : 0;
      return timeB - timeA;
    });
  } catch (err) {
    console.warn('getAllCasesFromDb error:', err);
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CASES_LEGACY);
      const list: DonkeyCase[] = saved ? JSON.parse(saved) : [];
      return list.sort((a, b) => {
        const timeA = a?.reportedAt ? new Date(a.reportedAt).getTime() : 0;
        const timeB = b?.reportedAt ? new Date(b.reportedAt).getTime() : 0;
        return timeB - timeA;
      });
    } catch {
      return [];
    }
  }
}

/**
 * Save a single case (Insert or Update) into IndexedDB and queue/sync to Firestore
 */
export async function saveCaseToDb(caseItem: DonkeyCase): Promise<void> {
  // 1. Save to IndexedDB
  try {
    await performDbTx(STORE_CASES, 'readwrite', (store) => {
      store.put(caseItem);
    });
  } catch (err) {
    console.warn('IndexedDB put error, saving to localStorage as fallback:', err);
  }

  // Also sync to legacy localStorage for instant synchronous safety
  try {
    const all = await getAllCasesFromDb();
    const idx = all.findIndex(c => c.id === caseItem.id);
    if (idx >= 0) all[idx] = caseItem;
    else all.unshift(caseItem);
    localStorage.setItem(STORAGE_KEY_CASES_LEGACY, JSON.stringify(all));
  } catch {
    // Ignore storage quota
  }

  // 2. Cloud Firestore Sync (when quota allows)
  try {
    if (!isFirestoreQuotaLimited()) {
      const firestore = getFirestoreClient();
      if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
        const caseDocRef = doc(firestore, FIRESTORE_COLLECTION_CASES, caseItem.id);
        await setDoc(caseDocRef, cleanForFirestore(caseItem), { merge: true });
        console.log(`Synced case ${caseItem.id} to Firestore`);
      } else {
        await enqueueOfflineSync({
          id: `sync_case_${caseItem.id}_${Date.now()}`,
          action: 'UPSERT_CASE',
          caseId: caseItem.id,
          payload: caseItem,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      await enqueueOfflineSync({
        id: `sync_case_${caseItem.id}_${Date.now()}`,
        action: 'UPSERT_CASE',
        caseId: caseItem.id,
        payload: caseItem,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    handleFirestoreError(err);
    console.warn('Firestore write failed, queued for offline sync:', err);
    await enqueueOfflineSync({
      id: `sync_case_${caseItem.id}_${Date.now()}`,
      action: 'UPSERT_CASE',
      caseId: caseItem.id,
      payload: caseItem,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Bulk save cases into IndexedDB and LocalStorage for rapid offline durability.
 * Does not fire duplicate batch writes to Firestore to avoid exhausting daily quota.
 */
export async function saveAllCasesToDb(cases: DonkeyCase[]): Promise<void> {
  try {
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_CASES, 'readwrite');
    const store = tx.objectStore(STORE_CASES);
    cases.forEach(item => {
      store.put(item);
    });
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn('Batch save to IndexedDB failed:', err);
  }

  try {
    localStorage.setItem(STORAGE_KEY_CASES_LEGACY, JSON.stringify(cases));
  } catch {
    // Ignore
  }
}

/**
 * Delete a case by ID from both IndexedDB and Firestore
 */
export async function deleteCaseFromDb(caseId: string): Promise<void> {
  try {
    await performDbTx(STORE_CASES, 'readwrite', (store) => {
      store.delete(caseId);
    });
  } catch (err) {
    console.warn('Failed to delete from IndexedDB:', err);
  }

  // Cloud Firestore Delete
  try {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      const caseDocRef = doc(firestore, FIRESTORE_COLLECTION_CASES, caseId);
      await deleteDoc(caseDocRef);
    } else {
      await enqueueOfflineSync({
        id: `del_case_${caseId}_${Date.now()}`,
        action: 'DELETE_CASE',
        caseId: caseId,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Firestore delete failed:', err);
  }
}

/**
 * Enqueue an operation into the offline sync queue
 */
interface SyncQueueItem {
  id: string;
  action: 'UPSERT_CASE' | 'DELETE_CASE';
  caseId: string;
  payload?: any;
  timestamp: string;
}

async function enqueueOfflineSync(item: SyncQueueItem): Promise<void> {
  try {
    await performDbTx(STORE_SYNC_QUEUE, 'readwrite', (store) => {
      store.put(item);
    });
  } catch (err) {
    console.warn('Failed to enqueue offline sync:', err);
  }
}

/**
 * Synchronize local IndexedDB with Firestore (Two-way sync)
 */
export async function syncCasesWithFirestore(): Promise<{ synced: number; cloudTotal: number }> {
  const firestore = getFirestoreClient();
  if (!firestore) throw new Error('Firestore not initialized');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Device is offline');
  }

  // 1. Process pending offline queue first
  try {
    const queue = await performDbTx<SyncQueueItem[]>(STORE_SYNC_QUEUE, 'readonly', store => store.getAll());
    if (queue && queue.length > 0) {
      console.log(`Processing ${queue.length} queued offline sync items...`);
      for (const item of queue) {
        if (item.action === 'UPSERT_CASE' && item.payload) {
          const ref = doc(firestore, FIRESTORE_COLLECTION_CASES, item.caseId);
          await setDoc(ref, cleanForFirestore(item.payload), { merge: true });
        } else if (item.action === 'DELETE_CASE') {
          const ref = doc(firestore, FIRESTORE_COLLECTION_CASES, item.caseId);
          await deleteDoc(ref);
        }
      }
      // Clear queue
      await performDbTx(STORE_SYNC_QUEUE, 'readwrite', store => store.clear());
    }
  } catch (e) {
    console.warn('Error flushing sync queue:', e);
  }

  // 2. Fetch all cloud cases
  const casesCollection = collection(firestore, FIRESTORE_COLLECTION_CASES);
  const snapshot = await getDocs(casesCollection);
  const cloudCases: DonkeyCase[] = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data() as DonkeyCase;
    cloudCases.push({ ...data, id: docSnap.id });
  });

  // 3. Merge with local cases
  const localCases = await getAllCasesFromDb();
  const mergedMap = new Map<string, DonkeyCase>();

  // Add local cases
  localCases.forEach(c => mergedMap.set(c.id, c));

  // Merge cloud cases (cloud wins if timestamp newer or equal)
  cloudCases.forEach(cloudCase => {
    const existing = mergedMap.get(cloudCase.id);
    if (!existing) {
      mergedMap.set(cloudCase.id, cloudCase);
    } else {
      const existingTime = new Date((existing as any).updatedAt || existing.resolvedAt || existing.reportedAt || 0).getTime();
      const cloudTime = new Date((cloudCase as any).updatedAt || cloudCase.resolvedAt || cloudCase.reportedAt || 0).getTime();
      if (cloudTime >= existingTime) {
        mergedMap.set(cloudCase.id, cloudCase);
      }
    }
  });

  // 4. Also upload any local-only cases to Cloud Firestore
  for (const localCase of localCases) {
    const inCloud = cloudCases.some(c => c.id === localCase.id);
    if (!inCloud) {
      try {
        const ref = doc(firestore, FIRESTORE_COLLECTION_CASES, localCase.id);
        await setDoc(ref, cleanForFirestore(localCase), { merge: true });
      } catch (err) {
        console.warn('Failed to upload local case to cloud:', err);
      }
    }
  }

  const mergedList = Array.from(mergedMap.values());
  await saveAllCasesToDb(mergedList);

  return {
    synced: mergedList.length,
    cloudTotal: cloudCases.length,
  };
}

/**
 * Subscribe to real-time updates from Firestore when online
 */
export function subscribeToFirestoreCases(onUpdate: (cases: DonkeyCase[]) => void): () => void {
  const firestore = getFirestoreClient();
  if (!firestore) return () => {};

  try {
    const casesCollection = collection(firestore, FIRESTORE_COLLECTION_CASES);
    const unsubscribe = onSnapshot(
      casesCollection,
      async (snapshot) => {
        const cases: DonkeyCase[] = [];
        snapshot.forEach(docSnap => {
          cases.push({ ...(docSnap.data() as DonkeyCase), id: docSnap.id });
        });

        if (cases.length > 0) {
          // Merge with local DB
          const localCases = await getAllCasesFromDb();
          const map = new Map<string, DonkeyCase>();
          localCases.forEach(c => map.set(c.id, c));
          cases.forEach(c => map.set(c.id, c));

          const merged = Array.from(map.values());
          await saveAllCasesToDb(merged);
          onUpdate(merged);
        }
      },
      (error) => {
        console.warn('Firestore live subscription error (continuing with offline IndexedDB):', error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Could not establish Firestore live subscription:', err);
    return () => {};
  }
}

/**
 * Export full database to a downloadable JSON file for offline backups or desktop transfer
 */
export async function exportDatabaseBackup(): Promise<string> {
  const cases = await getAllCasesFromDb();
  let users: any[] = [];
  try {
    users = await performDbTx<any[]>(STORE_USERS, 'readonly', store => store.getAll()) || [];
  } catch {
    users = [];
  }

  const backupData = {
    app: 'DIRA - Donkey Incident Reporting APP',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    totalCases: cases.length,
    databaseEngine: 'IndexedDB + Cloud Firestore',
    cases: cases,
    users: users,
  };

  const jsonStr = JSON.stringify(backupData, null, 2);

  // Trigger file download in browser
  if (typeof document !== 'undefined') {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DIRA_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return jsonStr;
}

/**
 * Import a database JSON backup and merge into IndexedDB + Firestore
 */
export async function importDatabaseBackup(jsonString: string): Promise<number> {
  const data = JSON.parse(jsonString);
  const casesToImport: DonkeyCase[] = Array.isArray(data) ? data : data.cases;

  if (!Array.isArray(casesToImport)) {
    throw new Error('Invalid backup file format: cases array not found.');
  }

  const existing = await getAllCasesFromDb();
  const map = new Map<string, DonkeyCase>();
  existing.forEach(c => map.set(c.id, c));
  casesToImport.forEach(c => map.set(c.id, c));

  const merged = Array.from(map.values());
  await saveAllCasesToDb(merged);

  // Sync to Firestore in background
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    syncCasesWithFirestore().catch(e => console.warn('Sync post-import notice:', e));
  }

  return casesToImport.length;
}

/**
 * Clean object before sending to Firestore (removes undefined fields which Firestore rejects)
 */
function cleanForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanForFirestore);
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// USER ACCOUNTS PERSISTENCE & REAL-TIME FIRESTORE SYNC
// ---------------------------------------------------------------------------

/**
 * Helper to check if a profile is a legacy dummy mock profile to purge
 */
export function isLegacyMockUser(profile: Partial<UserProfile>): boolean {
  if (!profile) return false;
  const id = profile.id || '';
  const phone = profile.phone || '';
  if (id === SUPER_ADMIN_ACCOUNT.id || phone === 'admin') return false;
  return (
    id.startsWith('super-user-') ||
    id.startsWith('pri-user-') ||
    id.startsWith('usr-officer-') ||
    id.startsWith('usr-elder-') ||
    id.startsWith('usr-primary-') ||
    id.startsWith('usr-farmer-') ||
    id.startsWith('usr-vet-') ||
    phone === '0722101202' ||
    phone === '0723456789' ||
    phone === '0733890123' ||
    phone === '0712345678' ||
    phone === '0722999111' ||
    phone === '0721888222' ||
    phone === '0720777333' ||
    phone === '0728666444'
  );
}

/**
 * Purge all legacy dummy accounts from local storage and IndexedDB
 */
export async function purgeLegacyDummyAccounts(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SAVED_PROFILES_KEY);
      if (raw) {
        const parsed: UserProfile[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(p => !isLegacyMockUser(p));
          // Always ensure super admin is present
          if (!cleaned.some(p => p.id === SUPER_ADMIN_ACCOUNT.id || p.phone === 'admin')) {
            cleaned.unshift(SUPER_ADMIN_ACCOUNT);
          }
          localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(cleaned));
        }
      } else {
        localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify([SUPER_ADMIN_ACCOUNT]));
      }
    }
  } catch (e) {
    console.warn('LocalStorage legacy purge warning:', e);
  }

  // Purge legacy accounts from IndexedDB users store
  try {
    const dbUsers = await performDbTx<UserProfile[]>(STORE_USERS, 'readonly', store => store.getAll());
    if (dbUsers && dbUsers.length > 0) {
      for (const u of dbUsers) {
        if (isLegacyMockUser(u) && u.phone) {
          await performDbTx(STORE_USERS, 'readwrite', store => store.delete(u.phone));
        }
      }
    }
    // Ensure Super Admin in IndexedDB
    await performDbTx(STORE_USERS, 'readwrite', store => store.put(SUPER_ADMIN_ACCOUNT));
  } catch (e) {
    console.warn('IndexedDB legacy purge warning:', e);
  }
}

/**
 * Get all user accounts from IndexedDB / LocalStorage merged with Cloud Firestore
 */
export async function getAllUsersFromDb(): Promise<UserProfile[]> {
  await purgeLegacyDummyAccounts();
  const userMap = new Map<string, UserProfile>();

  // 1. Always start with Super Admin
  userMap.set(SUPER_ADMIN_ACCOUNT.id, SUPER_ADMIN_ACCOUNT);

  // 2. Load from LocalStorage
  try {
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    if (raw) {
      const parsed: UserProfile[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(u => {
          if (!isLegacyMockUser(u) && u.id) {
            userMap.set(u.id, u);
          }
        });
      }
    }
  } catch {}

  // 3. Load from IndexedDB
  try {
    const idbUsers = await performDbTx<UserProfile[]>(STORE_USERS, 'readonly', store => store.getAll());
    if (idbUsers && Array.isArray(idbUsers)) {
      idbUsers.forEach(u => {
        if (!isLegacyMockUser(u) && u.id) {
          userMap.set(u.id, u);
        }
      });
    }
  } catch {}

  // 4. Fetch from Full-Stack Server Users registry
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data?.status === 'ok' && Array.isArray(data.users)) {
        data.users.forEach((u: UserProfile) => {
          if (!isLegacyMockUser(u) && u.id) {
            userMap.set(u.id, u);
          }
        });
      }
    } catch (e) {
      console.warn('Server users fetch warning:', e);
    }
  }

  // 5. Fetch from Cloud Firestore if online
  const firestore = getFirestoreClient();
  if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const usersCol = collection(firestore, FIRESTORE_COLLECTION_USERS);
      const snapshot = await getDocs(usersCol);
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as UserProfile;
        if (data && !isLegacyMockUser(data)) {
          const userObj = { ...data, id: docSnap.id };
          userMap.set(docSnap.id, userObj);
        }
      });

      // Ensure Super Admin exists in Firestore only if absent, done at most once per app session
      if (!hasEnsuredSuperAdminInCloud && !userMap.has(SUPER_ADMIN_ACCOUNT.id) && !isFirestoreQuotaLimited()) {
        hasEnsuredSuperAdminInCloud = true;
        const adminDocRef = doc(firestore, FIRESTORE_COLLECTION_USERS, SUPER_ADMIN_ACCOUNT.id);
        setDoc(adminDocRef, cleanForFirestore(SUPER_ADMIN_ACCOUNT), { merge: true }).catch((e) => handleFirestoreError(e));
      }
    } catch (err) {
      handleFirestoreError(err);
      console.warn('Firestore users fetch warning:', err);
    }
  }

  const allUsers = Array.from(userMap.values());
  // Save merged list locally
  try {
    localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(allUsers));
  } catch {}

  return allUsers;
}

/**
 * Save / Create / Update a user account in Firestore, IndexedDB, and LocalStorage
 */
export async function saveUserToDb(user: UserProfile): Promise<void> {
  if (isLegacyMockUser(user)) return;

  // 1. Update LocalStorage
  try {
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    const existing: UserProfile[] = raw ? JSON.parse(raw) : [SUPER_ADMIN_ACCOUNT];
    const idx = existing.findIndex(u => u.id === user.id || (u.phone && user.phone && u.phone === user.phone));
    if (idx >= 0) {
      existing[idx] = user;
    } else {
      existing.push(user);
    }
    localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(existing));
  } catch {}

  // 2. Save into IndexedDB
  try {
    await performDbTx(STORE_USERS, 'readwrite', store => {
      store.put(user);
    });
  } catch (e) {
    console.warn('IndexedDB put user warning:', e);
  }

  // 3. Send to Full-Stack Server User Registry so all connected devices immediately receive this user
  if (typeof window !== 'undefined') {
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    }).catch((err) => console.warn('Server user sync notice:', err));
  }

  // 4. Save into Cloud Firestore (when quota allows)
  if (!isFirestoreQuotaLimited()) {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const userDocRef = doc(firestore, FIRESTORE_COLLECTION_USERS, user.id);
        const cleaned = cleanForFirestore(user);
        await setDoc(userDocRef, cleaned, { merge: true });
        console.log(`Successfully saved user account "${user.name}" (${user.id}) to Cloud Firebase Firestore`);
      } catch (err) {
        handleFirestoreError(err);
        console.warn('Failed to save user to Cloud Firestore:', err);
      }
    }
  }
}

/**
 * Delete a user account from Cloud Firestore, IndexedDB, and LocalStorage
 */
export async function deleteUserFromDb(userId: string, userPhone?: string): Promise<void> {
  if (userId === SUPER_ADMIN_ACCOUNT.id || userPhone === 'admin') {
    throw new Error('The primary Super Admin account cannot be deleted.');
  }

  // 1. Delete from LocalStorage
  try {
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    if (raw) {
      const parsed: UserProfile[] = JSON.parse(raw);
      const filtered = parsed.filter(u => u.id !== userId && (!userPhone || u.phone !== userPhone));
      localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(filtered));
    }
  } catch {}

  // 2. Delete from IndexedDB
  try {
    if (userPhone) {
      await performDbTx(STORE_USERS, 'readwrite', store => store.delete(userPhone));
    }
  } catch (e) {
    console.warn('IndexedDB user delete error:', e);
  }

  // 3. Delete from Cloud Firestore
  if (!isFirestoreQuotaLimited()) {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const userDocRef = doc(firestore, FIRESTORE_COLLECTION_USERS, userId);
        await deleteDoc(userDocRef);
        console.log(`Successfully deleted user account ${userId} from Cloud Firebase Firestore`);
      } catch (err) {
        handleFirestoreError(err);
        console.warn('Failed to delete user from Cloud Firestore:', err);
      }
    }
  }
}

/**
 * Live Real-Time Subscription to Firestore user accounts
 */
export function subscribeToFirestoreUsers(onUpdate: (users: UserProfile[]) => void): () => void {
  const firestore = getFirestoreClient();
  if (!firestore) return () => {};

  try {
    const usersCol = collection(firestore, FIRESTORE_COLLECTION_USERS);
    const unsubscribe = onSnapshot(
      usersCol,
      (snapshot) => {
        const cloudUsers: UserProfile[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as UserProfile;
          if (data && !isLegacyMockUser(data)) {
            cloudUsers.push({ ...data, id: docSnap.id });
          }
        });

        // Always ensure Super Admin exists
        if (!cloudUsers.some(u => u.id === SUPER_ADMIN_ACCOUNT.id || u.phone === 'admin')) {
          cloudUsers.unshift(SUPER_ADMIN_ACCOUNT);
        }

        try {
          localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(cloudUsers));
        } catch {}

        onUpdate(cloudUsers);
      },
      (error) => {
        handleFirestoreError(error);
        console.warn('Firestore users subscription notice:', error.message);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to subscribe to Firestore users:', err);
    return () => {};
  }
}

/**
 * Find user by email or phone number across LocalStorage, IndexedDB, and Cloud Firestore
 */
export async function findUserByEmailOrPhone(identifier: string): Promise<UserProfile | null> {
  const clean = identifier.trim();
  if (!clean) return null;

  // 1. Check Super Admin shortcut
  if (clean.toLowerCase() === 'admin' || clean.toLowerCase() === 'superadmin') {
    return SUPER_ADMIN_ACCOUNT;
  }

  // 2. Search local database first
  const users = await getAllUsersFromDb();
  const lowerClean = clean.toLowerCase();
  const cleanDigits = clean.replace(/\D/g, '');

  const localMatch = users.find((u) => {
    // Email match
    if (u.email && u.email.toLowerCase() === lowerClean) return true;
    // Phone match
    if (u.phone) {
      if (u.phone === clean) return true;
      const uDigits = u.phone.replace(/\D/g, '');
      if (cleanDigits.length >= 7 && (uDigits.includes(cleanDigits) || cleanDigits.includes(uDigits))) return true;
    }
    // Admin check
    if (u.role === 'super_admin' && lowerClean === 'admin') return true;
    return false;
  });

  if (localMatch) return localMatch;

  // 3. Check Cloud Firestore in case user registered on another device/tab
  const firestore = getFirestoreClient();
  if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const snap = await getDocs(collection(firestore, FIRESTORE_COLLECTION_USERS));
      let cloudMatch: UserProfile | null = null;
      snap.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (!data) return;
        if (data.email && data.email.toLowerCase() === lowerClean) {
          cloudMatch = { ...data, id: docSnap.id };
        } else if (data.phone) {
          if (data.phone === clean) cloudMatch = { ...data, id: docSnap.id };
          const dDigits = data.phone.replace(/\D/g, '');
          if (cleanDigits.length >= 7 && (dDigits.includes(cleanDigits) || cleanDigits.includes(dDigits))) {
            cloudMatch = { ...data, id: docSnap.id };
          }
        }
      });
      if (cloudMatch) {
        // Cache locally for offline access
        await saveUserToDb(cloudMatch);
        return cloudMatch;
      }
    } catch (err) {
      console.warn('Firestore user search fallback:', err);
    }
  }

  return null;
}

/**
 * Authenticate user using Email or Phone Number and a Password
 */
export async function authenticateWithEmailOrPhone(
  identifier: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const cleanId = identifier.trim();
  const cleanPass = passwordInput.trim();

  if (!cleanId) {
    return { success: false, error: 'Please enter your email or phone number.' };
  }
  if (!cleanPass) {
    return { success: false, error: 'Please enter your password.' };
  }

  const user = await findUserByEmailOrPhone(cleanId);
  if (!user) {
    return {
      success: false,
      error: 'No account found with this email or phone number. Please click "Sign Up" to create an account.'
    };
  }

  // Check password
  const expectedPassword = user.password || '1234';
  const isSuperAdmin = user.role === 'super_admin' || user.id === SUPER_ADMIN_ACCOUNT.id;

  const isPasswordValid = 
    cleanPass === expectedPassword ||
    (isSuperAdmin && (cleanPass.toLowerCase() === 'admin' || cleanPass === '1234')) ||
    (!user.password && cleanPass === '1234');

  if (!isPasswordValid) {
    return {
      success: false,
      error: 'Incorrect password. Please verify and try again, or use SMS OTP code.'
    };
  }

  return { success: true, user };
}

/**
 * Completely wipe all signed up user accounts and all sample/reported cases,
 * messages, and queue items from LocalStorage, IndexedDB, and Cloud Firestore.
 * Retains only the primary Super Admin (admin / admin).
 */
export async function deleteAllSignedUpUsersAndSampleData(): Promise<{ usersDeleted: number; casesDeleted: number }> {
  let usersDeleted = 0;
  let casesDeleted = 0;

  // 1. Wipe LocalStorage
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_CASES_LEGACY);
      localStorage.removeItem('kaa_rada_cases_v2');
      localStorage.removeItem('kaa_rada_current_user_v2');
      localStorage.removeItem('kaa_rada_notifications_v1');
      localStorage.removeItem('kaa_rada_active_user_device');
      localStorage.removeItem('dira_chat_messages_v1');
      localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify([SUPER_ADMIN_ACCOUNT]));
    }
  } catch (e) {
    console.warn('LocalStorage wipe warning:', e);
  }

  // 2. Wipe IndexedDB Stores
  try {
    const db = await openIndexedDb();

    // Clear cases
    await performDbTx(STORE_CASES, 'readwrite', (store) => {
      store.clear();
    });

    // Clear messages
    await performDbTx(STORE_MESSAGES, 'readwrite', (store) => {
      store.clear();
    });

    // Clear sync queue
    await performDbTx(STORE_SYNC_QUEUE, 'readwrite', (store) => {
      store.clear();
    });

    // Clear users, put back only SUPER_ADMIN_ACCOUNT
    await performDbTx(STORE_USERS, 'readwrite', (store) => {
      store.clear();
      store.put(SUPER_ADMIN_ACCOUNT);
    });
  } catch (e) {
    console.warn('IndexedDB wipe warning:', e);
  }

  // 3. Wipe Cloud Firestore
  const firestore = getFirestoreClient();
  if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      // Delete users in dira_users except super admin
      const usersCol = collection(firestore, FIRESTORE_COLLECTION_USERS);
      const userSnaps = await getDocs(usersCol);
      for (const snap of userSnaps.docs) {
        if (snap.id !== SUPER_ADMIN_ACCOUNT.id) {
          await deleteDoc(snap.ref);
          usersDeleted++;
        }
      }

      // Delete users in alt users collection except super admin
      const altUsersCol = collection(firestore, FIRESTORE_COLLECTION_USERS_ALT);
      const altUserSnaps = await getDocs(altUsersCol);
      for (const snap of altUserSnaps.docs) {
        if (snap.id !== SUPER_ADMIN_ACCOUNT.id) {
          await deleteDoc(snap.ref);
        }
      }

      // Ensure Super Admin remains
      const adminDocRef = doc(firestore, FIRESTORE_COLLECTION_USERS, SUPER_ADMIN_ACCOUNT.id);
      await setDoc(adminDocRef, cleanForFirestore(SUPER_ADMIN_ACCOUNT), { merge: true });

      // Delete cases in dira_cases
      const casesCol = collection(firestore, FIRESTORE_COLLECTION_CASES);
      const caseSnaps = await getDocs(casesCol);
      for (const snap of caseSnaps.docs) {
        await deleteDoc(snap.ref);
        casesDeleted++;
      }

      // Delete messages in dira_messages
      const msgCol = collection(firestore, FIRESTORE_COLLECTION_MESSAGES);
      const msgSnaps = await getDocs(msgCol);
      for (const snap of msgSnaps.docs) {
        await deleteDoc(snap.ref);
      }
    } catch (e) {
      console.warn('Firestore wipe warning:', e);
    }
  }

  return { usersDeleted, casesDeleted };
}

// ---------------------------------------------------------------------------
// IN-APP MESSAGING PERSISTENCE & REAL-TIME FIRESTORE SYNC
// ---------------------------------------------------------------------------

export const INITIAL_DEMO_MESSAGES: DiraMessage[] = [];

const LOCAL_STORAGE_MESSAGES_KEY = 'dira_chat_messages_v1';

/**
 * Get all messages from IndexedDB or local storage
 */
export async function getAllMessagesFromDb(channelId?: string): Promise<DiraMessage[]> {
  try {
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_MESSAGES_KEY);
    let allMsgs: DiraMessage[] = rawLocal ? JSON.parse(rawLocal) : [];

    // Try reading from IndexedDB
    try {
      const records = await performDbTx<DiraMessage[]>(STORE_MESSAGES, 'readonly', (store) => {
        return store.getAll();
      });

      if (records && records.length > 0) {
        // Merge with local storage
        const map = new Map<string, DiraMessage>();
        allMsgs.forEach(m => map.set(m.id, m));
        records.forEach(m => map.set(m.id, m));
        allMsgs = Array.from(map.values());
      }
    } catch {
      // IndexedDB fallback OK
    }

    // Sort by timestamp ascending
    allMsgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (channelId) {
      return allMsgs.filter(m => m.channelId === channelId);
    }
    return allMsgs;
  } catch (err) {
    console.error('Failed to get messages:', err);
    return [];
  }
}

/**
 * Save a message to IndexedDB, LocalStorage, broadcast across tabs, full-stack server relay, and sync to Cloud Firestore
 */
export async function saveMessageToDb(message: DiraMessage): Promise<void> {
  try {
    // 1. Update localStorage
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_MESSAGES_KEY);
    const msgs: DiraMessage[] = rawLocal ? JSON.parse(rawLocal) : [...INITIAL_DEMO_MESSAGES];
    const existingIndex = msgs.findIndex(m => m.id === message.id);
    if (existingIndex >= 0) {
      msgs[existingIndex] = message;
    } else {
      msgs.push(message);
    }
    localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(msgs.slice(-200)));

    // 2. Save into IndexedDB
    try {
      await performDbTx(STORE_MESSAGES, 'readwrite', (store) => {
        return store.put(message);
      });
    } catch (e) {
      console.warn('Failed to save message to IndexedDB:', e);
    }

    // 3. Broadcast to other open tabs on this browser
    broadcastChatMessage(message);

    // 4. Send to Full-Stack Server Relay (guarantees cross-device delivery even during Firestore quota limits)
    if (typeof window !== 'undefined') {
      try {
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      } catch (err) {
        console.warn('Server chat relay post notice:', err);
      }
    }

    // 5. Sync to Cloud Firestore if connected (when quota allows)
    if (!isFirestoreQuotaLimited()) {
      const firestore = getFirestoreClient();
      if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const messageDocRef = doc(firestore, FIRESTORE_COLLECTION_MESSAGES, message.id);
          const cleaned = cleanForFirestore(message);
          await setDoc(messageDocRef, cleaned, { merge: true });
        } catch (cloudErr: any) {
          handleFirestoreError(cloudErr);
          // Handle Firestore quota exhaustion gracefully
          if (cloudErr?.message?.includes('Quota limit exceeded') || cloudErr?.code === 'resource-exhausted') {
            console.warn('Firestore write quota reached for today. Message safely relayed via full-stack server.');
          } else {
            console.warn('Cloud Firestore message sync notice:', cloudErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error saving message:', err);
  }
}

/**
 * Broadcast chat message across browser tabs and devices
 */
export function broadcastChatMessage(message: DiraMessage): void {
  // 1. BroadcastChannel for modern browsers
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHAT_BROADCAST_CHANNEL);
      channel.postMessage({ type: 'CHAT_MESSAGE', message });
      setTimeout(() => channel.close(), 500);
    } catch {
      // Ignore
    }
  }

  // 2. Storage event fallback for cross-tab or mobile WebViews
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('dira_chat_broadcast_event', JSON.stringify({ message, ts: Date.now() }));
    } catch {
      // Ignore
    }
  }
}

/**
 * Subscribe to cross-tab chat messages via BroadcastChannel and StorageEvent fallback
 */
export function subscribeToChatMessageBroadcast(onMessage: (message: DiraMessage) => void): () => void {
  let isClosed = false;
  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHAT_BROADCAST_CHANNEL);
      channel.onmessage = (event) => {
        if (!isClosed && event.data?.type === 'CHAT_MESSAGE' && event.data?.message) {
          onMessage(event.data.message);
        }
      };
    } catch {
      // Ignore
    }
  }

  const storageListener = (e: StorageEvent) => {
    if (isClosed) return;
    if (e.key === 'dira_chat_broadcast_event' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.message && parsed.message.id) {
          onMessage(parsed.message);
        }
      } catch {
        // Ignore
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageListener);
  }

  return () => {
    isClosed = true;
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', storageListener);
    }
  };
}

/**
 * Real-time subscription to chat messages for a specific channel
 * Uses dual-pipeline: Full-Stack Server SSE Stream + Firestore onSnapshot + Poll Fallback
 */
export function subscribeToFirestoreMessages(
  channelId: string,
  onUpdate: (messages: DiraMessage[]) => void
): () => void {
  let isSubActive = true;
  const mergedMap = new Map<string, DiraMessage>();

  const emitSorted = () => {
    if (!isSubActive) return;
    const list = Array.from(mergedMap.values())
      .filter((m) => !channelId || channelId === 'all' || m.channelId === channelId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    onUpdate(list);
  };

  // 1. Initial fetch from server API
  if (typeof window !== 'undefined') {
    fetch(`/api/chat/messages?channelId=${encodeURIComponent(channelId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isSubActive && data?.status === 'ok' && Array.isArray(data.messages)) {
          data.messages.forEach((m: DiraMessage) => mergedMap.set(m.id, m));
          emitSorted();
        }
      })
      .catch(() => {});
  }

  // 2. Server-Sent Events (SSE) live push from server for instant cross-device delivery
  let eventSource: EventSource | null = null;
  if (typeof window !== 'undefined' && 'EventSource' in window) {
    try {
      eventSource = new EventSource('/api/chat/stream');
      eventSource.onmessage = (event) => {
        if (!isSubActive) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'NEW_MESSAGE' && payload.message) {
            const incoming: DiraMessage = payload.message;
            if (!channelId || channelId === 'all' || incoming.channelId === channelId) {
              mergedMap.set(incoming.id, incoming);
              emitSorted();
            }
          }
        } catch {
          // Heartbeat or malformed
        }
      };
    } catch {
      // EventSource fallback to polling
    }
  }

  // 3. Fallback periodic polling every 2.5 seconds (bulletproof against socket disconnects)
  const pollInterval = setInterval(() => {
    if (!isSubActive || typeof window === 'undefined') return;
    fetch(`/api/chat/messages?channelId=${encodeURIComponent(channelId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isSubActive && data?.status === 'ok' && Array.isArray(data.messages)) {
          let hasNew = false;
          data.messages.forEach((m: DiraMessage) => {
            if (!mergedMap.has(m.id)) {
              mergedMap.set(m.id, m);
              hasNew = true;
            }
          });
          if (hasNew) emitSorted();
        }
      })
      .catch(() => {});
  }, 2500);

  // 4. Cloud Firestore collection snapshot (when quota is active)
  let unsubFirestore = () => {};
  try {
    const firestore = getFirestoreClient();
    if (firestore) {
      const messagesCollection = collection(firestore, FIRESTORE_COLLECTION_MESSAGES);
      unsubFirestore = onSnapshot(
        messagesCollection,
        (snapshot) => {
          if (!isSubActive) return;
          let changed = false;
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as DiraMessage;
            const msgId = data.id || docSnap.id;
            if (msgId && (!channelId || channelId === 'all' || data.channelId === channelId)) {
              if (!mergedMap.has(msgId)) {
                mergedMap.set(msgId, { ...data, id: msgId });
                changed = true;
              }
            }
          });
          if (changed) emitSorted();
        },
        (error) => {
          console.warn('Firestore messages subscription notice:', error.message);
        }
      );
    }
  } catch (err) {
    console.warn('Failed to subscribe to Firestore messages:', err);
  }

  return () => {
    isSubActive = false;
    clearInterval(pollInterval);
    if (eventSource) {
      eventSource.close();
    }
    unsubFirestore();
  };
}

/**
 * Real-time global broadcast subscription across ALL channels:
 * Detects new messages sent by any user across all devices (Server SSE + Firestore + Cross-tab).
 * Used at the app root level so all logged-in users receive broadcasts instantly!
 */
export function subscribeToGlobalChatBroadcast(
  onNewMessage: (message: DiraMessage) => void,
  onAllMessagesUpdate?: (messages: DiraMessage[]) => void
): () => void {
  let isClosed = false;
  const knownMessageIds = new Set<string>();

  // 1. Cross-tab BroadcastChannel & storage event listener
  const unsubBroadcast = subscribeToChatMessageBroadcast((incomingMsg) => {
    if (incomingMsg && incomingMsg.id && !knownMessageIds.has(incomingMsg.id)) {
      knownMessageIds.add(incomingMsg.id);
      onNewMessage(incomingMsg);
    }
  });

  // 2. Server-Sent Events (SSE) from server relay for cross-device notification
  let eventSource: EventSource | null = null;
  if (typeof window !== 'undefined' && 'EventSource' in window) {
    try {
      eventSource = new EventSource('/api/chat/stream');
      eventSource.onmessage = (event) => {
        if (isClosed) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'NEW_MESSAGE' && payload.message) {
            const msg = payload.message as DiraMessage;
            if (!knownMessageIds.has(msg.id)) {
              knownMessageIds.add(msg.id);
              onNewMessage(msg);
            }
          }
        } catch {}
      };
    } catch {}
  }

  // 3. Cloud Firestore real-time collection snapshot
  let unsubFirestore = () => {};
  try {
    const firestore = getFirestoreClient();
    if (firestore) {
      const messagesCollection = collection(firestore, FIRESTORE_COLLECTION_MESSAGES);
      let isInitialLoad = true;
      unsubFirestore = onSnapshot(
        messagesCollection,
        (snapshot) => {
          if (isClosed) return;
          const allMsgs: DiraMessage[] = [];
          const newlyAdded: DiraMessage[] = [];

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data() as DiraMessage;
              const msg: DiraMessage = {
                ...data,
                id: data.id || change.doc.id,
              };

              if (!knownMessageIds.has(msg.id)) {
                knownMessageIds.add(msg.id);
                if (!isInitialLoad) {
                  newlyAdded.push(msg);
                }
              }
            }
          });

          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as DiraMessage;
            const msgId = data.id || docSnap.id;
            if (msgId) {
              allMsgs.push({ ...data, id: msgId });
            }
          });

          allMsgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          if (onAllMessagesUpdate) {
            onAllMessagesUpdate(allMsgs);
          }

          if (!isInitialLoad && newlyAdded.length > 0) {
            newlyAdded.forEach((msg) => {
              onNewMessage(msg);
            });
          }

          isInitialLoad = false;
        },
        (err) => {
          handleFirestoreError(err);
          console.warn('Global Firestore chat subscription warning:', err);
        }
      );
    }
  } catch (e) {
    console.warn('Failed to subscribe to global Firestore chat:', e);
  }

  return () => {
    isClosed = true;
    unsubBroadcast();
    if (eventSource) {
      eventSource.close();
    }
    unsubFirestore();
  };
}
