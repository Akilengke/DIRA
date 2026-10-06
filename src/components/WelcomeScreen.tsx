import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, ShieldCheck, Cpu, ArrowRight, Zap, 
  Bot, CheckCircle2, Award, HeartHandshake, Radio 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile } from '../types';

interface WelcomeScreenProps {
  user: UserProfile;
  onComplete: () => void;
  durationMs?: number;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  user,
  onComplete,
  durationMs = 4000,
}) => {
  const [progress, setProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  // Play pleasant pentatonic welcome chime via Web Audio API
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Notes: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.09);

          gain.gain.setValueAtTime(0.001, now + idx * 0.09);
          gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.09 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.4);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.09);
          osc.stop(now + idx * 0.09 + 0.45);
        });
      }
    } catch {
      // Audio context blocked or not permitted
    }

    // Trigger celebratory confetti burst
    try {
      confetti({
        particleCount: 65,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#059669', '#34d399', '#fbbf24', '#f59e0b'],
        disableForReducedMotion: true,
      });
    } catch {}

    // Subtle haptic feedback on supported mobile devices
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch {}
    }
  }, []);

  // Progress bar and auto-dismiss timer
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        handleFinish();
      }
    }, 25);

    return () => clearInterval(interval);
  }, [durationMs]);

  const handleFinish = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onComplete();
    }, 350);
  };

  const roleTitle = user.roleTitle || user.designation || (
    user.role === 'super_admin' ? 'Super Administrator' :
    user.role === 'super_user' ? 'Super User Officer' : 'Community Guardian'
  );

  return (
    <AnimatePresence>
      {!isClosing && (
        <motion.div
          id="dira-welcome-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-xl text-white px-4 select-none overflow-hidden"
        >
          {/* Ambient animated aura / background glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.2, 0.35, 0.2],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-emerald-600/30 via-teal-500/20 to-amber-500/10 blur-3xl"
            />
            <motion.div
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.15, 0.3, 0.15],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute w-[400px] h-[400px] rounded-full bg-emerald-500/15 blur-2xl -translate-y-12"
            />
          </div>

          {/* Main Card Container */}
          <motion.div
            initial={{ scale: 0.88, y: 25, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-emerald-950/50 flex flex-col items-center text-center"
          >
            {/* Top Badge: Verified Session */}
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-semibold tracking-wide uppercase shadow-inner mb-5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Kaa Rada • Session Authenticated</span>
            </motion.div>

            {/* App Emblem with Pulse Rings */}
            <div className="relative mb-5 flex items-center justify-center">
              <motion.div
                animate={{
                  scale: [1, 1.35, 1],
                  opacity: [0.4, 0, 0.4],
                }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
                className="absolute w-24 h-24 rounded-2xl border-2 border-emerald-500/40"
              />
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.6, 0.1, 0.6],
                }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: 0.4,
                }}
                className="absolute w-20 h-20 rounded-2xl border border-emerald-400/30"
              />

              <motion.div
                whileHover={{ scale: 1.05 }}
                className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-xl shadow-emerald-500/20 flex items-center justify-center overflow-hidden"
              >
                <img
                  src="/pwa-192x192.png"
                  alt="DIRA App Emblem"
                  className="w-full h-full object-cover rounded-[14px]"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </div>

            {/* User Greeting */}
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.45 }}
              className="space-y-1.5 mb-5"
            >
              <div className="text-zinc-400 text-xs sm:text-sm font-medium tracking-wide uppercase">
                Karibu Sana / Welcome
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-display">
                {user.name}
              </h2>
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-300 font-medium bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-800/40">
                <Award className="w-3 h-3 text-emerald-400" />
                <span>{roleTitle}</span>
              </div>
            </motion.div>

            {/* ========================================================== */}
            {/* THE STAR FEATURE: ...Powered by Punda wangu AI... ANIMATED */}
            {/* ========================================================== */}
            <motion.div
              id="powered-by-punda-wangu-ai-banner"
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5, ease: 'easeOut' }}
              className="relative w-full rounded-2xl p-4 bg-gradient-to-r from-emerald-950/70 via-zinc-900/90 to-emerald-950/70 border border-emerald-500/40 shadow-lg shadow-emerald-950/80 mb-6 overflow-hidden group"
            >
              {/* Shimmer sweep animation across the banner */}
              <motion.div
                animate={{
                  x: ['-100%', '200%'],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.8,
                  ease: 'easeInOut',
                  repeatDelay: 0.6,
                }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent skew-x-12 pointer-events-none"
              />

              <div className="relative flex flex-col items-center justify-center gap-1.5">
                {/* AI Neural Chip / Sparkle Badge */}
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: [0, 180, 360] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </motion.div>

                  <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/90">
                    Livestock Intelligence Engine
                  </span>

                  <motion.div
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  </motion.div>
                </div>

                {/* Animated Star Text requested by user: ...Powered by Punda wangu AI... */}
                <motion.div
                  animate={{
                    textShadow: [
                      '0 0 8px rgba(16, 185, 129, 0.4)',
                      '0 0 16px rgba(52, 211, 153, 0.8)',
                      '0 0 8px rgba(16, 185, 129, 0.4)',
                    ],
                  }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="text-base sm:text-lg font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-white to-emerald-200 font-display flex items-center gap-1"
                >
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-emerald-400 font-mono"
                  >
                    ...
                  </motion.span>
                  <span>Powered by Punda wangu AI</span>
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                    className="text-emerald-400 font-mono"
                  >
                    ...
                  </motion.span>
                </motion.div>

                {/* Subtitle description */}
                <p className="text-[11px] text-zinc-400 max-w-xs leading-tight mt-0.5">
                  Automated incident proximity allocation, welfare monitoring & anti-theft telemetry.
                </p>

                {/* Animated Live Pulse Visualizer */}
                <div className="flex items-center gap-1 mt-1.5">
                  {[40, 70, 95, 60, 85, 45, 90, 65, 35].map((height, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: [`${height * 0.25}%`, `${height * 0.75}%`, `${height * 0.25}%`],
                        opacity: [0.4, 0.9, 0.4],
                      }}
                      transition={{
                        duration: 1.2 + (i % 3) * 0.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.08,
                      }}
                      className="w-1 bg-emerald-400 rounded-full h-3"
                    />
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Action Button */}
            <motion.button
              id="dira-welcome-continue-btn"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              onClick={handleFinish}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-700/30 flex items-center justify-center gap-2 cursor-pointer transition-all border border-emerald-400/30"
            >
              <span>Ingia kwenye Mfumo (Continue)</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            {/* Countdown / Auto-progress Bar */}
            <div className="w-full mt-4 flex items-center gap-2 text-[10px] text-zinc-500">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="shrink-0 font-mono">
                {Math.max(0, Math.ceil(((100 - progress) / 100) * (durationMs / 1000)))}s
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
