import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderPlus, 
  Upload, 
  RefreshCw, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  File, 
  Trash2, 
  ExternalLink, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  HardDrive, 
  X, 
  Folder, 
  Download, 
  Lock, 
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { 
  listDriveFiles, 
  uploadFileToDrive, 
  deleteDriveFile, 
  getOrCreateFolder, 
  getDiraVaultFolderId, 
  exportCaseDossierToDrive,
  DriveFileItem, 
  getDriveAbout, 
  DriveAboutInfo,
  DIRA_VAULT_FOLDER_NAME
} from '../services/googleDriveService';
import { 
  googleSignIn, 
  getAccessToken, 
  logoutGoogle, 
  hasValidGoogleToken 
} from '../services/firebaseAuth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { DonkeyCase, UserProfile } from '../types';

interface GoogleDriveVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  cases: DonkeyCase[];
  currentUser: UserProfile | null;
}

export const GoogleDriveVaultModal: React.FC<GoogleDriveVaultModalProps> = ({
  isOpen,
  onClose,
  cases,
  currentUser,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(false);
  const [driveUser, setDriveUser] = useState<DriveAboutInfo['user'] | null>(null);
  const [storageQuota, setStorageQuota] = useState<DriveAboutInfo['storageQuota'] | null>(null);

  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [vaultFolderId, setVaultFolderId] = useState<string>('');
  const [currentFolderName, setCurrentFolderName] = useState<string>(DIRA_VAULT_FOLDER_NAME);

  // Uploading state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Folder Modal
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  // Confirmation Modal for Destructive Delete (Mandatory workspace-integration requirement)
  const [itemToDelete, setItemToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Bulk Export State
  const [isExportingAll, setIsExportingAll] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check auth state on open
  useEffect(() => {
    if (isOpen) {
      checkAuthAndLoad();
    }
  }, [isOpen]);

  const checkAuthAndLoad = async () => {
    const token = await getAccessToken();
    if (token) {
      setIsAuthenticated(true);
      loadDriveData();
    } else {
      setIsAuthenticated(false);
      setFiles([]);
    }
  };

  const loadDriveData = async () => {
    setIsLoadingFiles(true);
    setErrorMessage(null);
    try {
      // Get user info and storage
      const about = await getDriveAbout();
      setDriveUser(about.user);
      if (about.storageQuota) {
        setStorageQuota(about.storageQuota);
      }

      // Ensure DIRA master folder exists
      const masterId = await getDiraVaultFolderId();
      setVaultFolderId(masterId);
      setCurrentFolderId(masterId);

      // Load files inside DIRA vault
      const data = await listDriveFiles({ folderId: masterId, searchQuery });
      setFiles(data.files || []);
    } catch (err: any) {
      console.error('Failed to load Google Drive data:', err);
      if (err?.message?.includes('token') || err?.message?.includes('401')) {
        setIsAuthenticated(false);
      } else {
        setErrorMessage(err?.message || 'Failed to connect to Google Drive.');
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleRefreshFiles = async (folderId?: string) => {
    setIsLoadingFiles(true);
    setErrorMessage(null);
    try {
      const targetFolder = folderId || currentFolderId || vaultFolderId;
      const data = await listDriveFiles({ folderId: targetFolder, searchQuery });
      setFiles(data.files || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to refresh files.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoadingAuth(true);
    setErrorMessage(null);
    try {
      await googleSignIn();
      setIsAuthenticated(true);
      setSuccessMessage('Successfully connected to Google Drive!');
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadDriveData();
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage(err?.message || 'Failed to sign in with Google.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setIsAuthenticated(false);
    setDriveUser(null);
    setFiles([]);
    setSuccessMessage('Disconnected from Google Drive.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Upload file selected by user
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesToUpload = event.target.files;
    if (!filesToUpload || filesToUpload.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgressMsg(`Uploading ${file.name} (${i + 1}/${filesToUpload.length})...`);
        await uploadFileToDrive({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          content: file,
          folderId: currentFolderId || vaultFolderId,
        });
      }
      setSuccessMessage(`Successfully uploaded ${filesToUpload.length} file(s) to Google Drive!`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await handleRefreshFiles();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to upload file to Google Drive.');
    } finally {
      setIsUploading(false);
      setUploadProgressMsg('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Create new folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsLoadingFiles(true);
    setErrorMessage(null);
    try {
      await getOrCreateFolder(newFolderName.trim(), currentFolderId || vaultFolderId);
      setSuccessMessage(`Created folder "${newFolderName.trim()}" in Google Drive`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setNewFolderName('');
      setIsNewFolderModalOpen(false);
      await handleRefreshFiles();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create folder.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Export All Cases as Dossiers to Drive
  const handleExportAllCases = async () => {
    if (cases.length === 0) {
      setErrorMessage('No incident cases available to export.');
      return;
    }

    setIsExportingAll(true);
    setErrorMessage(null);
    try {
      for (let i = 0; i < cases.length; i++) {
        setUploadProgressMsg(`Exporting dossier ${cases[i].id} (${i + 1}/${cases.length})...`);
        await exportCaseDossierToDrive(cases[i]);
      }
      setSuccessMessage(`Archived ${cases.length} incident dossiers to "DIRA - Caritas Kitui Evidence Vault / Case Dossiers"!`);
      setTimeout(() => setSuccessMessage(null), 5000);
      await handleRefreshFiles();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to export cases to Google Drive.');
    } finally {
      setIsExportingAll(false);
      setUploadProgressMsg('');
    }
  };

  // Perform Delete with Mandatory User Confirmation
  const confirmDeleteFile = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await deleteDriveFile(itemToDelete.id);
      setSuccessMessage(`Deleted "${itemToDelete.name}" from Google Drive.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setItemToDelete(null);
      await handleRefreshFiles();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete file from Google Drive.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '—';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className="w-5 h-5 text-amber-500 shrink-0" />;
    }
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-emerald-600 shrink-0" />;
    }
    if (mimeType.startsWith('video/')) {
      return <Film className="w-5 h-5 text-indigo-600 shrink-0" />;
    }
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
      return <FileText className="w-5 h-5 text-blue-600 shrink-0" />;
    }
    if (mimeType.includes('sheet') || mimeType.includes('csv')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />;
    }
    return <File className="w-5 h-5 text-zinc-500 shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-zinc-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Google Drive Branding */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 text-white flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white p-2 flex items-center justify-center shadow-md">
              {/* Official Google Drive Tri-color Icon */}
              <svg viewBox="0 0 87.3 78" className="w-full h-full">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A8.9 8.9 0 0 0 0 53h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
                <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-13.75-23.8-13.75 23.8z" fill="#2684fc"/>
                <path d="m73.55 76.8-13.75-23.8H27.5L41.25 76.8c1.35.8 2.9 1.2 4.45 1.2h23.4c1.55 0 3.1-.4 4.45-1.2z" fill="#ffba00"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
                  Cloud Archive & Evidence Vault
                </span>
                <span className="text-[9px] px-1.5 py-0.2 bg-white/10 text-white rounded font-bold border border-white/20">
                  Google Drive API
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black font-display text-white">
                DIRA Google Drive Integration
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Alert Messages */}
        {successMessage && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {!isAuthenticated ? (
            /* Unauthenticated State: Sign in with Google */
            <div className="py-8 px-4 text-center space-y-5 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto text-[#991B1B]">
                <Cloud className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-zinc-950">
                  Connect Google Drive to DIRA
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Sign in with your Google account to automatically sync and store donkey theft evidence, case dossiers, photos, witness audio, and veterinary reports in your Google Drive cloud vault.
                </p>
              </div>

              <div className="pt-2">
                <GoogleSignInButton
                  onClick={handleGoogleLogin}
                  loading={isLoadingAuth}
                  label="Sign in with Google to Connect Drive"
                  className="shadow-md hover:shadow-lg"
                />
              </div>

              <div className="bg-zinc-50 rounded-2xl p-3 border border-zinc-200 text-left space-y-1.5 text-[11px] text-zinc-600">
                <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                  <ShieldCheck className="w-4 h-4 text-[#991B1B]" />
                  <span>Privacy & Security Assured</span>
                </div>
                <p>
                  Access is strictly managed via Google OAuth. Files are stored securely inside your private <code>{DIRA_VAULT_FOLDER_NAME}</code> folder.
                </p>
              </div>
            </div>
          ) : (
            /* Authenticated State: Google Drive Manager */
            <div className="space-y-4">
              {/* Account Info Bar */}
              <div className="bg-zinc-50 rounded-2xl p-3 sm:p-3.5 border border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  {driveUser?.photoLink ? (
                    <img 
                      src={driveUser.photoLink} 
                      alt={driveUser.displayName} 
                      className="w-8 h-8 rounded-full border border-zinc-300" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-800 font-bold flex items-center justify-center text-xs">
                      {driveUser?.displayName?.charAt(0) || 'G'}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                      <span>{driveUser?.displayName || 'Google Account Connected'}</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-[11px] text-zinc-500 font-medium">
                      {driveUser?.emailAddress || 'Google Drive Active'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportAllCases}
                    disabled={isExportingAll || isUploading}
                    className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isExportingAll ? 'Archiving...' : `Backup Dossiers (${cases.length})`}</span>
                  </button>

                  <button
                    onClick={handleGoogleLogout}
                    className="text-zinc-500 hover:text-zinc-800 font-medium px-2 py-1.5 rounded-lg hover:bg-zinc-200 text-xs transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Search in Drive */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search files in Google Drive..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRefreshFiles()}
                    className="w-full bg-white pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#991B1B]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {/* Create Folder Button */}
                  <button
                    onClick={() => setIsNewFolderModalOpen(true)}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-zinc-200 transition-all"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-zinc-600" />
                    <span>New Folder</span>
                  </button>

                  {/* Upload Evidence / File Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  {/* Refresh Files Button */}
                  <button
                    onClick={() => handleRefreshFiles()}
                    disabled={isLoadingFiles}
                    className="p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl border border-zinc-200 transition-all"
                    title="Refresh Drive files"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Progress Indicator */}
              {(isUploading || isExportingAll) && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-[#991B1B] font-bold animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{uploadProgressMsg || 'Uploading evidence to Google Drive...'}</span>
                </div>
              )}

              {/* Current Folder Path Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-white p-2.5 rounded-xl border border-zinc-200">
                <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                <button 
                  onClick={() => {
                    setCurrentFolderId(vaultFolderId);
                    setCurrentFolderName(DIRA_VAULT_FOLDER_NAME);
                    handleRefreshFiles(vaultFolderId);
                  }}
                  className="hover:underline text-[#991B1B]"
                >
                  DIRA Vault
                </button>
                {currentFolderId !== vaultFolderId && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-zinc-950 truncate">{currentFolderName}</span>
                  </>
                )}
                <span className="ml-auto text-[10px] text-zinc-400 font-medium">
                  {files.length} item(s)
                </span>
              </div>

              {/* File List */}
              <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100 min-h-[220px]">
                {isLoadingFiles ? (
                  <div className="py-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#991B1B]" />
                    <span className="text-xs font-medium">Connecting to Google Drive...</span>
                  </div>
                ) : files.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
                    <Cloud className="w-8 h-8 text-zinc-300" />
                    <p className="text-xs font-semibold text-zinc-600">No files found in this Google Drive folder.</p>
                    <p className="text-[11px] text-zinc-400 max-w-xs">
                      Click "Backup Dossiers" above or "Upload File" to store photos, witness notes, and case reports.
                    </p>
                  </div>
                ) : (
                  files.map((file) => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                    return (
                      <div
                        key={file.id}
                        className="p-3 hover:bg-zinc-50 flex items-center justify-between gap-3 transition-colors text-xs"
                      >
                        <div 
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (isFolder) {
                              setCurrentFolderId(file.id);
                              setCurrentFolderName(file.name);
                              handleRefreshFiles(file.id);
                            } else if (file.webViewLink) {
                              window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
                            }
                          }}
                        >
                          {file.thumbnailLink ? (
                            <img 
                              src={file.thumbnailLink} 
                              alt={file.name} 
                              className="w-8 h-8 rounded-lg object-cover border border-zinc-200 shrink-0" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            getFileIcon(file.mimeType)
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-zinc-900 truncate hover:text-[#991B1B]">
                              {file.name}
                            </h4>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <span>{isFolder ? 'Folder' : formatFileSize(file.size)}</span>
                              {file.modifiedTime && (
                                <>
                                  <span>•</span>
                                  <span>{new Date(file.modifiedTime).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-all"
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {file.webContentLink && (
                            <a
                              href={file.webContentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-all"
                              title="Download File"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {/* Trigger User Confirmation Modal for Destructive Delete */}
                          <button
                            onClick={() => setItemToDelete(file)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all"
                            title="Delete from Google Drive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Caritas Kitui • DIRA Cloud Evidence Archive</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs transition-all shadow-xs"
          >
            Done
          </button>
        </div>
      </div>

      {/* New Folder Modal */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-zinc-200 space-y-4">
            <h3 className="text-sm font-bold text-zinc-950 flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-[#991B1B]" />
              <span>Create New Google Drive Folder</span>
            </h3>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <input
                type="text"
                placeholder="Folder name (e.g., Kitui Central Evidence)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                className="w-full bg-zinc-50 px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#991B1B]"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsNewFolderModalOpen(false)}
                  className="px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#991B1B] hover:bg-[#7F1D1D] rounded-xl shadow-xs disabled:opacity-50"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory Explicit Confirmation Dialog for Destructive Operations */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-zinc-200 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-zinc-950">
                Delete from Google Drive?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-zinc-900">"{itemToDelete.name}"</span>? This will remove the file from your Google Drive cloud archive.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
