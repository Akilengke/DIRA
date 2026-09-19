import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause, AlertCircle, RefreshCw } from 'lucide-react';
import { VoiceNoteAttachment } from '../types';

interface VoiceNoteRecorderProps {
  onSend: (voiceNote: VoiceNoteAttachment) => void;
  onCancel: () => void;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({ onSend, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const capturedWaveformRef = useRef<number[]>([]);

  // Start recording on mount
  useEffect(() => {
    startRecording();

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
  };

  const getSupportedMimeType = (): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/aac',
    ];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  };

  const startRecording = async () => {
    setPermissionError(null);
    setAudioUrl(null);
    setRecordSeconds(0);
    audioChunksRef.current = [];
    capturedWaveformRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError('Audio recording is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      // Setup audio analyzer for dynamic waveforms
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const sampleAudio = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.max(15, Math.round((avg / 128) * 100)));

            setWaveformBars((prev) => {
              const updated = [...prev.slice(-19), normalized];
              return updated;
            });

            animationFrameRef.current = requestAnimationFrame(sampleAudio);
          };

          animationFrameRef.current = requestAnimationFrame(sampleAudio);
        }
      } catch (audioCtxErr) {
        console.warn('AudioContext visualization warning:', audioCtxErr);
      }

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      setAudioMimeType(mediaRecorder.mimeType || 'audio/webm');

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          setAudioUrl(base64Data);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start(200); // 200ms slices
      setIsRecording(true);

      // Start duration timer
      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          // Auto-limit to 2 minutes max to prevent oversized payloads
          if (prev >= 120) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone access failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError('Microphone permission denied. Please allow microphone access in browser settings.');
      } else if (err.name === 'NotFoundError') {
        setPermissionError('No microphone detected on your device.');
      } else {
        setPermissionError(`Could not access microphone: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setIsRecording(false);
  };

  // Immediate send or finish and send
  const handleSend = () => {
    if (isRecording) {
      // If still recording, stop and let onstop set the data, then send
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const mime = mediaRecorderRef.current.mimeType || audioMimeType;
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mime });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result as string;
            const duration = Math.max(1, recordSeconds);
            onSend({
              audioUrl: base64Data,
              durationSeconds: duration,
              mimeType: mime,
              waveform: waveformBars.length > 0 ? waveformBars : undefined,
            });
          };
          reader.readAsDataURL(audioBlob);
        };
        stopRecording();
        return;
      }
    }

    if (audioUrl) {
      onSend({
        audioUrl,
        durationSeconds: Math.max(1, recordSeconds),
        mimeType: audioMimeType,
        waveform: waveformBars.length > 0 ? waveformBars : undefined,
      });
    }
  };

  const togglePreview = () => {
    if (!audioUrl) return;

    if (!previewAudioRef.current) {
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPreviewing(false);
    }

    if (isPreviewing) {
      previewAudioRef.current.pause();
      setIsPreviewing(false);
    } else {
      previewAudioRef.current.play().then(() => {
        setIsPreviewing(true);
      }).catch(() => setIsPreviewing(false));
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (permissionError) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-2 text-xs text-red-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{permissionError}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={startRecording}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-lg font-bold"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2.5 sm:p-3 bg-emerald-950 text-white rounded-2xl border border-emerald-800/80 shadow-md flex items-center justify-between gap-2 animate-fadeIn">
      {/* Left: Recording state / timer */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-ping absolute" />
          <span className="w-3 h-3 rounded-full bg-red-500 relative" />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black tracking-wide text-white">
              {isRecording ? 'Recording Voice Note' : 'Voice Note Ready'}
            </span>
            <span className="font-mono text-xs font-bold text-emerald-300">
              {formatSeconds(recordSeconds)}
            </span>
          </div>
          <span className="text-[10px] text-emerald-400">
            {isRecording ? 'Speak clearly into mic...' : 'Tap send or preview audio'}
          </span>
        </div>
      </div>

      {/* Center: Live Waveform Bars */}
      <div className="hidden sm:flex items-center gap-1 h-7 px-2">
        {(waveformBars.length > 0 ? waveformBars : [25, 40, 60, 30, 80, 50, 70, 45, 90, 35, 60, 40]).map((h, i) => (
          <div
            key={i}
            style={{ height: `${Math.max(15, h)}%` }}
            className={`w-1 rounded-full transition-all duration-100 ${
              isRecording ? 'bg-emerald-400' : 'bg-emerald-600'
            }`}
          />
        ))}
      </div>

      {/* Right: Actions (Cancel, Stop/Preview, Send) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Discard button */}
        <button
          type="button"
          onClick={() => {
            cleanup();
            onCancel();
          }}
          className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-950/50 transition-colors"
          title="Discard voice note"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Optional Stop / Preview button if stopped */}
        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="p-2 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 transition-colors"
            title="Stop recording and review"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          audioUrl && (
            <button
              type="button"
              onClick={togglePreview}
              className="p-2 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 transition-colors"
              title={isPreviewing ? 'Pause preview' : 'Play preview'}
            >
              {isPreviewing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
          )
        )}

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={recordSeconds === 0 && !audioUrl}
          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-40"
          title="Send voice note"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
