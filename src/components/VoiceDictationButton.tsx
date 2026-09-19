import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Square, Globe, AlertCircle, Sparkles, Check, RefreshCw } from 'lucide-react';

export type SpeechLanguage = 'sw-KE' | 'en-KE' | 'en-US';

interface VoiceDictationButtonProps {
  onTranscript: (text: string, mode: 'append' | 'replace') => void;
  currentValue?: string;
  fieldLabel?: string;
  placeholderPrompt?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscript,
  currentValue = '',
  fieldLabel = 'Incident Details',
  placeholderPrompt = 'e.g. Speak in English or Swahili...',
  size = 'md',
  className = '',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [selectedLang, setSelectedLang] = useState<SpeechLanguage>('sw-KE');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  // Audio level visualizer during recording
  const startAudioVisualizer = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyserRef.current = analyser;
          analyser.fftSize = 32;

          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevel = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animationFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      }
    } catch {
      // Audio level visualizer is a bonus UI touch, speech recognition will still work
    }
  };

  const stopAudioVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  const cleanupRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    stopAudioVisualizer();
    setIsListening(false);
  };

  useEffect(() => {
    return () => {
      cleanupRecognition();
    };
  }, []);

  const handleToggleListening = () => {
    setSpeechError(null);

    if (isListening) {
      cleanupRecognition();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError(
        'Web Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari, or enter text manually.'
      );
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = selectedLang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
        setInterimText('');
        startAudioVisualizer();
      };

      recognition.onresult = (event: any) => {
        let finalTranscriptChunk = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptChunk += transcript + ' ';
          } else {
            currentInterim += transcript;
          }
        }

        setInterimText(currentInterim);

        if (finalTranscriptChunk.trim()) {
          onTranscript(finalTranscriptChunk.trim(), 'append');
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error event:', event.error);
        if (event.error === 'no-speech') {
          // Keep listening or inform user gently
          setSpeechError('No speech detected. Please speak clearly into your microphone.');
        } else if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          setSpeechError('Microphone access was denied. Please allow microphone permission in your browser.');
          cleanupRecognition();
        } else if (event.error === 'network') {
          setSpeechError('Network error occurred with Speech API. Please verify your connection.');
          cleanupRecognition();
        } else if (event.error !== 'aborted') {
          setSpeechError(`Speech recognition notice: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
        stopAudioVisualizer();
      };

      recognition.start();
    } catch (err: any) {
      console.error('Failed to start Speech Recognition:', err);
      setSpeechError(err?.message || 'Unable to access microphone for speech recognition.');
      cleanupRecognition();
    }
  };

  const languages: { code: SpeechLanguage; label: string; flag: string; native: string }[] = [
    { code: 'sw-KE', label: 'Kiswahili (Kenya)', flag: '🇰🇪', native: 'Kiswahili' },
    { code: 'en-KE', label: 'English (Kenya)', flag: '🇰🇪', native: 'English (KE)' },
    { code: 'en-US', label: 'English (Global)', flag: '🌐', native: 'English (US)' },
  ];

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Voice Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-50/60 border border-red-200/80 rounded-2xl p-2.5">
        <div className="flex items-center gap-2">
          {/* Main Record Button */}
          <button
            type="button"
            id="btn-voice-dictation"
            onClick={handleToggleListening}
            className={`cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-xs ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse ring-4 ring-red-200'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white active:scale-95'
            }`}
            title={isListening ? 'Click to stop dictation' : 'Click to describe case verbally'}
          >
            {isListening ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Done (Nimemaliza)</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-red-400" />
                <span>Describe by Voice (Ongea)</span>
              </>
            )}
          </button>

          {/* Audio Wave / Pulse Indicator */}
          {isListening && (
            <div className="flex items-center gap-1 px-2 py-1 bg-white border border-red-300 rounded-lg shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping mr-1" />
              <div className="flex items-end gap-0.5 h-4">
                {[0.4, 0.9, 0.6, 1, 0.5, 0.8].map((scale, i) => (
                  <span
                    key={i}
                    className="w-1 bg-red-600 rounded-full transition-all duration-75"
                    style={{
                      height: `${Math.max(4, (audioLevel / 100) * 16 * scale)}px`,
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-red-800 uppercase ml-1">
                Live
              </span>
            </div>
          )}
        </div>

        {/* Language Selection Chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 hidden sm:inline">
            Lang:
          </span>
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-zinc-200 text-xs">
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setSelectedLang(l.code);
                  if (isListening) {
                    cleanupRecognition();
                  }
                }}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  selectedLang === l.code
                    ? 'bg-[#991B1B] text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
                title={`Dictate in ${l.label}`}
              >
                <span>{l.flag}</span> <span className="ml-0.5">{l.native}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Listening Overlay & Interim Transcript */}
      {isListening && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-xl space-y-1.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs font-bold text-red-900">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              Listening to voice input ({languages.find((l) => l.code === selectedLang)?.native})...
            </span>
            <span className="text-[10px] text-zinc-500 font-normal">
              Speak clearly into your phone/mic
            </span>
          </div>
          
          <div className="bg-white/90 p-2.5 rounded-lg border border-red-200 text-xs text-zinc-800 min-h-[38px] font-medium leading-relaxed italic">
            {interimText ? (
              <span className="text-zinc-900 font-semibold">{interimText}...</span>
            ) : (
              <span className="text-zinc-400 not-italic">
                {selectedLang === 'sw-KE'
                  ? 'Ongea sasa... (mfano: "Punda watatu wameibwa kijiji cha Kyatune saa nane usiku...")'
                  : 'Start speaking... (e.g. "Three donkeys stolen from boma, suspects seen headed to Kanyangi...")'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error / Browser Notice */}
      {speechError && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">{speechError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSpeechError(null)}
            className="text-amber-700 hover:text-amber-900 font-bold text-xs cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {!isSupported && (
        <div className="p-2 bg-zinc-100 border border-zinc-200 rounded-xl text-[11px] text-zinc-600 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-zinc-500" />
          <span>
            Voice input requires Chrome, Edge, or Safari with Web Speech support. You can type in the box below.
          </span>
        </div>
      )}
    </div>
  );
};
