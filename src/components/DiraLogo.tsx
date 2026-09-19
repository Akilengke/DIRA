import React from 'react';

interface DiraLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const DiraLogo: React.FC<DiraLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  const dimensions = {
    xs: { iconSize: 24, titleSize: 'text-xs', subSize: 'text-[9px]' },
    sm: { iconSize: 32, titleSize: 'text-sm', subSize: 'text-[10px]' },
    md: { iconSize: 40, titleSize: 'text-base', subSize: 'text-[11px]' },
    lg: { iconSize: 52, titleSize: 'text-lg', subSize: 'text-xs' },
    xl: { iconSize: 64, titleSize: 'text-xl', subSize: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <img
        src="/pwa-192x192.png"
        alt="DIRA - Donkey Incident Reporting APP"
        width={dimensions.iconSize}
        height={dimensions.iconSize}
        className="rounded-xl object-contain shadow-2xs shrink-0 border border-emerald-700/20"
        referrerPolicy="no-referrer"
      />

      {showText && (
        <div className="flex flex-col leading-none justify-center min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-tight font-display text-zinc-950 ${dimensions.titleSize}`}>
              DIRA
            </span>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase shrink-0">
              Kaa Rada!
            </span>
          </div>
          <span className={`text-zinc-500 font-semibold leading-tight mt-0.5 truncate ${dimensions.subSize}`}>
            Donkey Incident Reporting APP
          </span>
        </div>
      )}
    </div>
  );
};
