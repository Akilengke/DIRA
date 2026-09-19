import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';
import { VoiceNoteAttachment } from '../types';

interface VoiceNotePlayerProps {
  voiceNote: VoiceNoteAttachment;
  isMe?: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ voiceNote, isMe = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(voiceNote.durationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio(voiceNote.audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: any) => {
      console.warn('Voice note playback error:', e);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audioRef.current = null;
    };
  }, [voiceNote.audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('Playback error:', err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const cycleSpeed = () => {
    const speeds = [1.0, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackRate(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Generate waveform bars
  const bars = voiceNote.waveform && voiceNote.waveform.length > 0 
    ? voiceNote.waveform 
    : [20, 45, 75, 30, 90, 60, 40, 85, 95, 55, 35, 70, 80, 50, 65, 30, 80, 45, 60, 25];

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`p-2 sm:p-2.5 rounded-xl border flex flex-col gap-1.5 select-none ${
      isMe 
        ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-100' 
        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
    }`}>
      <div className="flex items-center gap-2">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-xs cursor-pointer ${
            isMe 
              ? 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950' 
              : 'bg-emerald-800 hover:bg-emerald-700 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play voice note'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Waveform and scrubber */}
        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
          {/* Visual Waveform */}
          <div className="flex items-center gap-[2px] sm:gap-[3px] h-6 px-1">
            {bars.map((heightPct, idx) => {
              const barPercent = (idx / bars.length) * 100;
              const isPlayed = barPercent <= progressPercent;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    const targetSecs = (idx / bars.length) * duration;
                    setCurrentTime(targetSecs);
                    if (audioRef.current) audioRef.current.currentTime = targetSecs;
                  }}
                  style={{ height: `${Math.max(15, Math.min(100, heightPct))}%` }}
                  className={`w-1 sm:w-1.5 rounded-full transition-all duration-150 cursor-pointer ${
                    isPlayed
                      ? isMe 
                        ? 'bg-emerald-300' 
                        : 'bg-emerald-700'
                      : isMe 
                        ? 'bg-emerald-800/80 hover:bg-emerald-700' 
                        : 'bg-zinc-300 hover:bg-zinc-400'
                  } ${isPlaying && isPlayed ? 'opacity-100' : 'opacity-85'}`}
                />
              );
            })}
          </div>

          {/* Hidden range slider for exact touch/scrub */}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-transparent cursor-pointer opacity-0 -mt-2 z-10"
          />

          {/* Timers and speed badge */}
          <div className="flex items-center justify-between text-[10px] font-mono leading-none">
            <span className={isMe ? 'text-emerald-200' : 'text-zinc-500'}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <button
              type="button"
              onClick={cycleSpeed}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                isMe
                  ? 'bg-emerald-800/80 text-emerald-200 hover:bg-emerald-700'
                  : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
              }`}
              title="Change playback speed"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
