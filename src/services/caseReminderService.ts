import { DonkeyCase, UserProfile, CaseReminderRecord } from '../types';

const STORAGE_KEY_REMINDERS = 'dira_case_hourly_reminders_v2';
export const ONE_HOUR_MS = 60 * 60 * 1000; // 3,600,000 milliseconds

/**
 * Checks if a specific DonkeyCase is allocated to the given user.
 * Supports matching by user ID, phone number, and full name.
 */
export function isCaseAllocatedToUser(c: DonkeyCase, user: UserProfile | null): boolean {
  if (!user || !c) return false;
  const isOfficer = 
    user.role === 'super_user' || 
    user.role === 'super_admin' || 
    user.role === 'chief_officer' || 
    user.role === 'field_officer';
  if (!isOfficer) return false;

  const assigned = c.assignedOfficer;
  const aiAlloc = c.aiAllocation;

  // 1. Direct ID match
  if (assigned?.id && (assigned.id === user.id || assigned.id === `usr-${user.id}`)) return true;
  if (aiAlloc?.officerId && (aiAlloc.officerId === user.id || aiAlloc.officerId === `usr-${user.id}`)) return true;

  // 2. Clean phone number match
  const cleanPhone = (p?: string) => (p || '').replace(/\D/g, '');
  if (user.phone) {
    const userPhoneClean = cleanPhone(user.phone);
    if (userPhoneClean.length >= 7) {
      if (cleanPhone(assigned?.phone).includes(userPhoneClean) || userPhoneClean.includes(cleanPhone(assigned?.phone))) {
        return true;
      }
      if (cleanPhone(aiAlloc?.officerPhone).includes(userPhoneClean) || userPhoneClean.includes(cleanPhone(aiAlloc?.officerPhone))) {
        return true;
      }
    }
  }

  // 3. Name match
  if (user.name && assigned?.name) {
    const uName = user.name.trim().toLowerCase();
    const aName = assigned.name.trim().toLowerCase();
    if (uName === aName || uName.includes(aName) || aName.includes(uName)) {
      return true;
    }
  }

  return false;
}

/**
 * Reads all stored reminder records from localStorage
 */
export function getAllReminderRecords(): Record<string, CaseReminderRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REMINDERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read case reminder records:', err);
  }
  return {};
}

/**
 * Persists reminder records to localStorage
 */
export function saveAllReminderRecords(records: Record<string, CaseReminderRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify(records));
  } catch (err) {
    console.warn('Could not persist case reminder records:', err);
  }
}

/**
 * Registers an allocated case into the hourly reminder tracking registry.
 */
export function registerCaseAllocation(
  caseItem: DonkeyCase,
  officer?: { id: string; name: string; phone?: string }
): CaseReminderRecord {
  const records = getAllReminderRecords();
  const existing = records[caseItem.id];

  const allocatedAt = 
    caseItem.aiAllocation?.allocatedAt || 
    existing?.allocatedAt || 
    caseItem.reportedAt || 
    new Date().toISOString();

  const record: CaseReminderRecord = {
    caseId: caseItem.id,
    trackingCode: caseItem.trackingCode,
    officerId: officer?.id || caseItem.assignedOfficer?.id || existing?.officerId || 'unknown-officer',
    officerName: officer?.name || caseItem.assignedOfficer?.name || existing?.officerName || 'Super User',
    officerPhone: officer?.phone || caseItem.assignedOfficer?.phone || existing?.officerPhone,
    allocatedAt,
    lastRemindedAt: existing?.lastRemindedAt,
    remindersCount: existing?.remindersCount || 0,
    isResolved: caseItem.status === 'resolved' || caseItem.status === 'dismissed',
    nextReminderDueAt: existing?.nextReminderDueAt || new Date(Date.now() + ONE_HOUR_MS).toISOString(),
  };

  records[caseItem.id] = record;
  saveAllReminderRecords(records);
  return record;
}

/**
 * Marks a case as resolved in the reminder system, immediately halting future reminders.
 */
export function markCaseResolvedInReminders(caseId: string): void {
  const records = getAllReminderRecords();
  if (records[caseId]) {
    records[caseId].isResolved = true;
    records[caseId].nextReminderDueAt = '';
    saveAllReminderRecords(records);
  }
}

/**
 * Retrieves the reminder tracking record for a specific case
 */
export function getCaseReminderRecord(caseId: string): CaseReminderRecord | null {
  const records = getAllReminderRecords();
  return records[caseId] || null;
}

/**
 * Calculates human-readable time until next hourly reminder
 */
export function formatNextReminderTime(nextReminderDueAt?: string): string {
  if (!nextReminderDueAt) return 'Pending next cycle';
  try {
    const dueMs = new Date(nextReminderDueAt).getTime();
    const diffMs = dueMs - Date.now();
    if (diffMs <= 0) return 'Due now';
    const mins = Math.ceil(diffMs / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `in ${hours}h ${remMins}m`;
  } catch {
    return 'in ~1 hour';
  }
}

/**
 * Computes how many hours have elapsed since a case was allocated
 */
export function calculateHoursSinceAllocation(allocatedAtIso?: string): number {
  if (!allocatedAtIso) return 0;
  try {
    const startMs = new Date(allocatedAtIso).getTime();
    const diffMs = Date.now() - startMs;
    return Math.max(0, Math.floor(diffMs / ONE_HOUR_MS));
  } catch {
    return 0;
  }
}

/**
 * Checks all active cases allocated to the current super user and fires hourly reminders
 * for any case that has reached or exceeded 1 hour since its last reminder or allocation.
 */
export function checkHourlyRemindersDue(
  cases: DonkeyCase[],
  currentUser: UserProfile | null,
  onTriggerReminder: (caseItem: DonkeyCase, hourCount: number) => void
): void {
  if (!currentUser) return;
  const isOfficer = 
    currentUser.role === 'super_user' || 
    currentUser.role === 'super_admin' || 
    currentUser.role === 'chief_officer' || 
    currentUser.role === 'field_officer';
  if (!isOfficer) return;

  const records = getAllReminderRecords();
  let updated = false;
  const now = Date.now();

  for (const c of cases) {
    if (!c || c.status === 'resolved' || c.status === 'dismissed') {
      if (records[c.id] && !records[c.id].isResolved) {
        records[c.id].isResolved = true;
        updated = true;
      }
      continue;
    }

    // Check if this case is allocated to the logged-in super user
    const isAllocatedToMe = isCaseAllocatedToUser(c, currentUser);
    if (!isAllocatedToMe) continue;

    let rec = records[c.id];
    if (!rec) {
      rec = registerCaseAllocation(c, {
        id: currentUser.id,
        name: currentUser.name,
        phone: currentUser.phone,
      });
      records[c.id] = rec;
      updated = true;
    }

    const allocTime = new Date(rec.allocatedAt).getTime();
    const lastRemindTime = rec.lastRemindedAt ? new Date(rec.lastRemindedAt).getTime() : allocTime;

    // Check if 1 hour has elapsed since last reminder (or since allocation)
    const timeSinceLast = now - lastRemindTime;
    const isDue = timeSinceLast >= ONE_HOUR_MS;

    if (isDue) {
      const nextHourCount = (rec.remindersCount || 0) + 1;
      rec.remindersCount = nextHourCount;
      rec.lastRemindedAt = new Date(now).toISOString();
      rec.nextReminderDueAt = new Date(now + ONE_HOUR_MS).toISOString();
      updated = true;

      console.warn(`[Hourly Action Reminder] Case #${c.trackingCode} is still ${c.status}. Triggering Reminder #${nextHourCount}.`);
      onTriggerReminder(c, nextHourCount);
    }
  }

  if (updated) {
    saveAllReminderRecords(records);
  }
}

/**
 * Manually triggers an hourly reminder for testing/demonstration without waiting 60 minutes.
 */
export function triggerInstantHourlyReminder(
  caseItem: DonkeyCase,
  currentUser: UserProfile | null,
  onTriggerReminder: (caseItem: DonkeyCase, hourCount: number) => void
): void {
  const records = getAllReminderRecords();
  let rec = records[caseItem.id];

  if (!rec) {
    rec = registerCaseAllocation(caseItem, currentUser ? {
      id: currentUser.id,
      name: currentUser.name,
      phone: currentUser.phone,
    } : undefined);
    records[caseItem.id] = rec;
  }

  const nextCount = (rec.remindersCount || 0) + 1;
  rec.remindersCount = nextCount;
  rec.lastRemindedAt = new Date().toISOString();
  rec.nextReminderDueAt = new Date(Date.now() + ONE_HOUR_MS).toISOString();
  saveAllReminderRecords(records);

  onTriggerReminder(caseItem, nextCount);
}
