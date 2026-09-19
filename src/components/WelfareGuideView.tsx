import React from 'react';
import { 
  BookOpen, ShieldCheck, HeartHandshake, AlertTriangle, 
  Scale, PhoneCall, Sparkles, CheckCircle2, Skull, Download
} from 'lucide-react';
import { EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';

export const WelfareGuideView: React.FC = () => {
  return (
    <div className="space-y-4 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#991B1B] via-[#7F1D1D] to-[#991B1B] text-white p-4 sm:p-5 rounded-3xl shadow-sm border border-red-800/80 space-y-1">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-200">
          Knowledge & Rights Desk
        </span>
        <h2 className="text-base sm:text-lg font-black font-display text-white">
          Donkey Protection & Welfare Guidelines
        </h2>
        <p className="text-xs text-red-100">
          DIRA community manual for working donkey rights under Kenyan law.
        </p>
      </div>

      {/* Kenya Law & Legal Framework */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-zinc-950">
          <Scale className="w-5 h-5 text-[#991B1B]" />
          <h3 className="text-sm font-bold font-display text-zinc-950">
            Kenya Prevention of Cruelty to Animals Act (Cap 360)
          </h3>
        </div>
        <p className="text-xs text-zinc-600 leading-relaxed">
          In Kenya, working donkeys are legally protected sentient animals. It is a criminal offence punishable by fine and imprisonment to commit any of the following acts:
        </p>
        <div className="space-y-2 text-xs">
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#991B1B] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
            <span className="text-red-950">
              <strong>Illegal Bush Slaughter:</strong> Clandestine slaughter of donkeys outside licensed, inspected abattoirs is illegal and poses severe public health hazards.
            </span>
          </div>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
            <span className="text-zinc-950">
              <strong>Cruel Overloading & Unpadded Harnesses:</strong> Operating a donkey with unpadded wires, causing bleeding girth sores, or loading carts beyond reasonable capacity.
            </span>
          </div>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
            <span className="text-zinc-950">
              <strong>Trafficking Without Movement Permits:</strong> Transporting donkeys in lorries across sub-county boundaries without valid veterinary health inspection certificates.
            </span>
          </div>
        </div>
      </div>

      {/* Prevention of Donkey Theft in Kitui */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-zinc-950">
          <ShieldCheck className="w-5 h-5 text-[#991B1B]" />
          <h3 className="text-sm font-bold font-display text-zinc-950">
            How to Protect Your Donkeys From Theft (Kuzuia Wizi wa Punda)
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-zinc-700">
          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <strong className="block text-zinc-950 mb-1">🔒 Secure Boma Near House</strong>
            Construct your donkey pen within sight and earshot of your sleeping quarters with heavy padlock chains.
          </div>
          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <strong className="block text-zinc-950 mb-1">🏷️ Ear Notches & Photo Records</strong>
            Keep clear photographic identification of your donkeys, showing ear notches, forehead blaze, and hoof markings.
          </div>
          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <strong className="block text-zinc-950 mb-1">👥 Village Radar Groups</strong>
            Join village donkey welfare groups to sound whistles and alert chiefs immediately if strangers inquire about purchasing multiple donkeys.
          </div>
          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <strong className="block text-zinc-950 mb-1">📞 Fast Reporting to 0800000890</strong>
            Report within 2 hours of missing livestock to enable police roadblocks before donkeys reach transit lorries.
          </div>
        </div>
      </div>

      {/* Emergency Call Box */}
      <div className="bg-gradient-to-r from-[#991B1B] to-[#7F1D1D] text-white p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-red-800">
        <div>
          <div className="text-[10px] font-bold text-red-200 uppercase tracking-wider">
            Need Direct Assistance?
          </div>
          <div className="text-lg font-bold font-display text-white">
            DIRA Donkey Welfare Desk
          </div>
          <div className="text-xs text-red-100 font-mono">
            Toll-Free: {HOTLINE_DISPLAY}
          </div>
        </div>
        <a
          href={`tel:${EMERGENCY_HOTLINE}`}
          className="bg-white hover:bg-zinc-100 text-[#991B1B] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm self-start sm:self-auto active:scale-95 transition-all"
        >
          <PhoneCall className="w-3.5 h-3.5 fill-[#991B1B]" />
          Piga Simu Bure
        </a>
      </div>
    </div>
  );
};
