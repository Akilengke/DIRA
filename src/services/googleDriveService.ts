import { getAccessToken } from './firebaseAuth';
import { DonkeyCase } from '../types';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  parents?: string[];
  owners?: { displayName: string; emailAddress: string; photoLink?: string }[];
}

export interface DriveAboutInfo {
  user: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
  };
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
export const DIRA_VAULT_FOLDER_NAME = 'DIRA - Caritas Kitui Evidence Vault';

/**
 * Helper to execute authenticated Drive fetch
 */
async function driveFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google Drive access token missing. Please sign in with Google to continue.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMsg = errorData?.error?.message || `Google Drive API error (${response.status}): ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return response;
}

/**
 * Get current Google Drive user & storage quota details
 */
export async function getDriveAbout(): Promise<DriveAboutInfo> {
  const res = await driveFetch(`${DRIVE_API_BASE}/about?fields=user,storageQuota`);
  return res.json();
}

/**
 * List files and folders with optional search and parent filtering
 */
export async function listDriveFiles(params?: {
  folderId?: string;
  searchQuery?: string;
  pageSize?: number;
}): Promise<{ files: DriveFileItem[]; nextPageToken?: string }> {
  const queryParts: string[] = ['trashed = false'];

  if (params?.folderId) {
    queryParts.push(`'${params.folderId}' in parents`);
  }

  if (params?.searchQuery && params.searchQuery.trim()) {
    const clean = params.searchQuery.replace(/'/g, "\\'");
    queryParts.push(`name contains '${clean}'`);
  }

  const q = encodeURIComponent(queryParts.join(' and '));
  const fields = encodeURIComponent(
    'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, iconLink, parents, owners)'
  );
  const pageSize = params?.pageSize || 40;

  const url = `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&pageSize=${pageSize}&orderBy=folder,modifiedTime desc`;
  const res = await driveFetch(url);
  return res.json();
}

/**
 * Find or create a specific folder in Google Drive
 */
export async function getOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
  let query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id, name)`);
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  const folderMetadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    folderMetadata.parents = [parentId];
  }

  const createRes = await driveFetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folderMetadata),
  });

  const createdData = await createRes.json();
  return createdData.id;
}

/**
 * Get or create the master DIRA Evidence Vault folder
 */
export async function getDiraVaultFolderId(): Promise<string> {
  return getOrCreateFolder(DIRA_VAULT_FOLDER_NAME);
}

/**
 * Upload a file/document/image directly to Google Drive (Multipart upload)
 */
export async function uploadFileToDrive({
  name,
  mimeType,
  content,
  folderId,
}: {
  name: string;
  mimeType: string;
  content: Blob | string;
  folderId?: string;
}): Promise<DriveFileItem> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google Drive access token missing.');
  }

  const metadata: any = {
    name,
    mimeType,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataContentType = 'application/json; charset=UTF-8';

  let body: Blob | string;

  if (content instanceof Blob) {
    const metadataBlob = new Blob(
      [
        `${delimiter}Content-Type: ${metadataContentType}\r\n\r\n${JSON.stringify(
          metadata
        )}\r\n${delimiter}Content-Type: ${mimeType}\r\n\r\n`,
      ],
      { type: 'text/plain' }
    );
    const closeBlob = new Blob([closeDelimiter], { type: 'text/plain' });
    body = new Blob([metadataBlob, content, closeBlob]);
  } else {
    body =
      `${delimiter}Content-Type: ${metadataContentType}\r\n\r\n${JSON.stringify(
        metadata
      )}\r\n${delimiter}Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;
  }

  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,thumbnailLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || `Failed to upload file to Google Drive (${response.status})`);
  }

  return response.json();
}

/**
 * Format a full case report into structured markdown and export it to Google Drive
 */
export async function exportCaseDossierToDrive(donkeyCase: DonkeyCase): Promise<DriveFileItem> {
  const masterVaultId = await getDiraVaultFolderId();
  const caseDossiersFolderId = await getOrCreateFolder('Case Dossiers & Reports', masterVaultId);

  const timestamp = new Date(donkeyCase.reportedAt).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const markdownContent = `# DIRA Incident Dossier: ${donkeyCase.id}
**Caritas Kitui • Donkey Welfare & Anti-Theft Response Network**
**Toll-Free Emergency Hotline**: 0800 000 890

---

### Incident Summary
- **Tracking ID**: \`${donkeyCase.id}\` (Tracking Code: \`${donkeyCase.trackingCode}\`)
- **Incident Category**: ${donkeyCase.category.toUpperCase().replace('_', ' ')}
- **Severity / Urgency Level**: ${donkeyCase.urgency.toUpperCase()}
- **Current Status**: ${donkeyCase.status.toUpperCase()}
- **Date & Time Reported**: ${timestamp}
- **Number of Donkeys Affected**: ${donkeyCase.donkeysCount || 1}

---

### Location Details
- **County**: ${donkeyCase.location.county || 'Kitui County, Kenya'}
- **Sub-County**: ${donkeyCase.location.subCounty}
- **Ward / Area**: ${donkeyCase.location.ward || 'N/A'}
- **Village / Landmark**: ${donkeyCase.location.village} (Landmark: ${donkeyCase.location.landmark || 'N/A'})
- **GPS Coordinates**: ${donkeyCase.location.coordinates ? `Lat ${donkeyCase.location.coordinates.lat.toFixed(5)}, Lng ${donkeyCase.location.coordinates.lng.toFixed(5)}` : 'Coordinates not recorded'}

---

### Reporter Details
- **Reporter Name**: ${donkeyCase.reporter?.name || 'Anonymous Community Member'}
- **Phone Contact**: ${donkeyCase.reporter?.phone || 'Confidential'}
- **Relationship**: ${donkeyCase.reporter?.relationship || 'Community Resident'}

---

### Case Description & Notes
${donkeyCase.description}

---

### Assigned Response Personnel
${
  donkeyCase.assignedOfficer
    ? `- **Assigned Officer**: ${donkeyCase.assignedOfficer.name} (${donkeyCase.assignedOfficer.title})
- **Department**: ${donkeyCase.assignedOfficer.department}
- **Officer Phone**: ${donkeyCase.assignedOfficer.phone}`
    : `*No field officer currently designated.*`
}

---

### Action & Investigation Logs
${
  donkeyCase.actionLogs && donkeyCase.actionLogs.length > 0
    ? donkeyCase.actionLogs
        .map(
          (log, idx) => `#### ${idx + 1}. ${log.action} (${new Date(log.timestamp).toLocaleString()})
- **Officer / Desk**: ${log.officer}
- **Notes**: ${log.notes}
${log.newStatus ? `- **Status Change**: Set to \`${log.newStatus}\`` : ''}`
        )
        .join('\n\n')
    : '*No action logs recorded yet.*'
}

---

${
  donkeyCase.resolution
    ? `### Case Resolution Summary
- **Summary**: ${donkeyCase.resolution.summary}
- **Donkeys Recovered**: ${donkeyCase.resolution.donkeysRecovered}
- **Suspects Apprehended**: ${donkeyCase.resolution.suspectsApprehended || 0}
- **Resolved By**: ${donkeyCase.resolution.officerName} on ${new Date(donkeyCase.resolution.resolvedAt).toLocaleString()}`
    : ''
}

---
*Generated automatically by DIRA (Donkey Incident Reporting APP) for Caritas Kitui Donkey Welfare Program.*
`;

  const fileName = `Dossier_${donkeyCase.id}_${donkeyCase.location.subCounty.replace(/\s+/g, '_')}.md`;

  return uploadFileToDrive({
    name: fileName,
    mimeType: 'text/markdown',
    content: markdownContent,
    folderId: caseDossiersFolderId,
  });
}

/**
 * Delete a file or folder from Google Drive
 * (Caller MUST prompt with user confirmation first)
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'DELETE',
  });
}
