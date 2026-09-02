import React from 'react';
import { 
  X, PhoneCall, ShieldAlert, HeartHandshake, 
  AlertOctagon, CheckCircle2, Clock, MapPin, Building, ShieldCheck
} from 'lucide-react';
import { EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';

interface EmergencyHotlineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmergencyHotlineModal: React.FC<EmergencyHotlineModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-200">
        {/* Modal Top Banner in Brick Red */}
        <div className="bg-gradient-to-r from-[#991B1B] via-[#7F1D1D] to-[#991B1B] text-white p-5 flex items-center justify-between border-b border-red-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 text-white flex items-center justify-center border border-white/20">
              <PhoneCall className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-200">
                Caritas Kitui 24/7 Response
              </span>
              <h3 className="text-base font-bold font-display text-white">
                Donkey Welfare Call Centre
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 text-zinc-900 max-h-[75vh] overflow-y-auto">
          {/* Main Dial Action Card */}
          <div className="bg-gradient-to-br from-[#991B1B] via-[#7F1D1D] to-[#450A0A] text-white p-5 rounded-2xl text-center space-y-3 shadow-md border border-red-800">
            <span className="inline-block px-3 py-1 bg-white/20 text-white border border-white/30 text-xs font-bold rounded-full">
              Toll-Free (Simu ya Bure Bila Malipo)
            </span>
            <div className="text-3xl font-extrabold font-display tracking-tight text-white">
              {HOTLINE_DISPLAY}
            </div>
            <p className="text-xs text-red-100 max-w-xs mx-auto">
              Operated 24 hours daily by Caritas Kitui Donkey Welfare emergency operators.
            </p>
            <a
              id="call-hotline-dial-btn"
              href={`tel:${EMERGENCY_HOTLINE}`}
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 bg-white hover:bg-zinc-100 text-[#991B1B] font-extrabold text-sm rounded-xl shadow-md active:scale-95 transition-all"
            >
              <PhoneCall className="w-4 h-4 fill-[#991B1B]" />
              <span>Piga {HOTLINE_DISPLAY} Sasa</span>
            </a>
          </div>

          {/* Emergency Triage Checklist */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#991B1B]" />
              What to Do in a Donkey Crisis:
            </h4>
            <div className="space-y-2 text-xs text-zinc-700">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                <AlertOctagon className="w-4 h-4 text-[#991B1B] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-red-950 block">1. If Witnessing Bush Slaughter in Progress:</strong>
                  Do NOT confront gangs directly. Move to a safe distance and call <strong className="text-[#991B1B]">{HOTLINE_DISPLAY}</strong> immediately.
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-900 block">2. Record Precise Landmark & Vehicle Details:</strong>
                  Note vehicle plate numbers, lorry make/color, direction of transit (e.g. towards Kibwezi or Machakos), and nearest village landmark.
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#991B1B] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-900 block">3. In Case of Stolen Donkeys:</strong>
                  Have ear notches, color, gender, and brand markings ready to give the hotline operator for instant radio broadcast to livestock checkpoints.
                </div>
              </div>
            </div>
          </div>

          {/* Inter-Agency Dispatch Network */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 text-xs space-y-2">
            <span className="font-bold text-zinc-800 uppercase tracking-wider block text-[11px]">
              Partner Response Units in Kitui
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-600 text-[11px]">
              <div>• Caritas Kitui Rapid Welfare Desk</div>
              <div>• National Police Anti-Stock Theft (ASTU)</div>
              <div>• Sub-County Veterinary Officers</div>
              <div>• Area Chiefs & Village Peace Committees</div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-100 border-t border-zinc-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-950 text-white text-xs font-bold rounded-xl transition-colors"
          >
            Funga (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
