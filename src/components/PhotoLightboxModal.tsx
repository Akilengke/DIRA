import React, { useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { downloadFile } from '../utils/attachmentUtils';

interface PhotoLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName?: string;
  senderName?: string;
  caption?: string;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  fileName = 'donkey_incident_photo.jpg',
  senderName,
  caption,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="w-full flex items-center justify-between text-white pb-3 px-1">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-200 truncate max-w-[200px] sm:max-w-md">
              {fileName}
            </span>
            {senderName && (
              <span className="text-[11px] text-zinc-400">
                Shared by {senderName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadFile(imageUrl, fileName)}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white flex items-center gap-1.5 transition-all border border-zinc-700 cursor-pointer"
              title="Download photo"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save Image</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all border border-zinc-700 cursor-pointer"
              title="Close image preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 max-h-[75vh] flex items-center justify-center">
          <img
            src={imageUrl}
            alt={caption || fileName}
            className="max-h-[75vh] max-w-full object-contain rounded-2xl"
          />
        </div>

        {/* Optional Caption */}
        {caption && (
          <div className="w-full text-center mt-3 text-xs text-zinc-300 bg-zinc-900/80 px-4 py-2 rounded-xl border border-zinc-800">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
};
