import { DonkeyCase } from '../types';

/**
 * Sorts donkey cases from the latest (newest reportedAt) to the oldest.
 */
export function sortCasesLatestFirst(cases: DonkeyCase[]): DonkeyCase[] {
  if (!Array.isArray(cases)) return [];
  return [...cases].sort((a, b) => {
    const timeA = a?.reportedAt ? new Date(a.reportedAt).getTime() : 0;
    const timeB = b?.reportedAt ? new Date(b.reportedAt).getTime() : 0;
    return timeB - timeA;
  });
}

/**
 * Formats a reportedAt ISO date string into a friendly, full readable date & time.
 * E.g., "16 Sep 2026, 02:45 PM"
 */
export function formatReportedDateTime(isoString?: string): string {
  if (!isoString) return 'Date not specified';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Invalid date';

    const datePart = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const timePart = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${datePart}, ${timePart}`;
  } catch {
    return 'Invalid date';
  }
}

/**
 * Formats just the calendar date portion.
 * E.g., "16 Sep 2026"
 */
export function formatReportedDate(isoString?: string): string {
  if (!isoString) return 'Unknown date';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Unknown date';

    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Unknown date';
  }
}

/**
 * Formats relative time elapsed since the case was reported.
 * E.g., "Just now", "12m ago", "3h ago", "Yesterday", "3d ago"
 */
export function formatReportedRelative(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 45) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatReportedDate(isoString);
  } catch {
    return '';
  }
}
