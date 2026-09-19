import React, { useState, useEffect } from 'react';
import { 
  Database, RefreshCw, Download, Upload, CheckCircle2, AlertCircle, 
  HardDrive, Cloud, ShieldCheck, X, Server, Layers, Trash2 
} from 'lucide-react';
import { 
  getAllCasesFromDb, 
  syncCasesWithFirestore, 
  exportDatabaseBackup, 
  importDatabaseBackup,
  deleteAllSignedUpUsersAndSampleData 
} from '../services/db';
import { DonkeyCase } from '../types';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCasesUpdated: (cases: DonkeyCase[]) => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen,
  onClose,
  onCasesUpdated,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [caseCount, setCaseCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    if (!isOpen) return;

    loadDatabaseStats();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOpen]);

  const loadDatabaseStats = async () => {
    try {
      const cases = await getAllCasesFromDb();
      setCaseCount(cases.length);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSyncNow = async () => {
    if (!navigator.onLine) {
      setError('Cannot sync while offline. All changes are securely stored locally.');
      return;
    }

    setIsSyncing(true);
    setError(null);
    setSyncStatus(null);

    try {
      const result = await syncCasesWithFirestore();
      const updated = await getAllCasesFromDb();
      setCaseCount(updated.length);
      onCasesUpdated(updated);
      setSyncStatus(`Synchronized ${result.synced} total cases with Cloud Firestore!`);
    } catch (err: any) {
      setError(err.message || 'Synchronization failed. Changes remain safe in local IndexedDB.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      await exportDatabaseBackup();
      setSyncStatus('Database exported successfully as JSON file.');
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSyncStatus(null);

    try {
      const text = await file.text();
      const count = await importDatabaseBackup(text);
      const updated = await getAllCasesFromDb();
      setCaseCount(updated.length);
      onCasesUpdated(updated);
      setSyncStatus(`Successfully restored ${count} cases into database!`);
    } catch (err: any) {
      setError('Invalid backup JSON file: ' + err.message);
    }
  };

  const handleWipeAllDataAndUsers = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncStatus(null);
    try {
      const result = await deleteAllSignedUpUsersAndSampleData();
      setCaseCount(0);
      onCasesUpdated([]);
      setSyncStatus(`Database wiped: deleted ${result.usersDeleted} signed-up user(s) and ${result.casesDeleted} case(s). Clean state restored!`);
    } catch (err: any) {
      setError('Wipe failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs select-none">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-zinc-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight font-display">
                DIRA App Database
              </h3>
              <p className="text-xs text-zinc-400">
                IndexedDB & Cloud Firestore Engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Status Banners */}
          {syncStatus && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2.5 text-emerald-900 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{syncStatus}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2.5 text-red-900 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Database Info Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col">
              <span className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-zinc-700" />
                Local Storage
              </span>
              <span className="text-xl font-black text-zinc-950 font-display mt-1">
                {caseCount} Cases
              </span>
              <span className="text-[10px] text-zinc-500 mt-0.5">IndexedDB (Offline)</span>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col">
              <span className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1">
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                Cloud Firestore
              </span>
              <span className="text-sm font-black text-zinc-950 font-display mt-1 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {isOnline ? 'Connected' : 'Offline'}
              </span>
              <span className="text-[10px] text-zinc-500 mt-0.5">Auto two-way sync</span>
            </div>
          </div>

          {/* APK & Offline Storage Notice */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 text-xs text-emerald-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              APK & Offline Persistence Ready
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              When exported or running in Android APK, all cases, media attachments, and emergency reports persist locally inside the device's native IndexedDB sandbox without requiring an active internet connection.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing with Firestore...' : 'Sync with Cloud Database Now'}</span>
            </button>

            <button
              onClick={handleExportBackup}
              className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-zinc-200 shadow-2xs transition-all active:scale-98"
            >
              <Download className="w-3.5 h-3.5 text-zinc-700" />
              <span>Export Database Backup (.JSON)</span>
            </button>

            <label className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-zinc-200 shadow-2xs transition-all active:scale-98 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-zinc-700" />
              <span>Import / Restore Database</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </label>

            <button
              onClick={handleWipeAllDataAndUsers}
              disabled={isSyncing}
              className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-red-200 shadow-2xs transition-all active:scale-98"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
              <span>Wipe All Signed-Up Users & Sample Data</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-zinc-50 border-t border-zinc-100 p-3.5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
