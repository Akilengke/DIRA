import React from 'react';

interface CaritasLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  inverted?: boolean;
}

export const CaritasLogo: React.FC<CaritasLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
  inverted = false,
}) => {
  // Brick Red: #991B1B / #B91C1C
  const brickRed = '#991B1B';
  const textColor = inverted ? '#ffffff' : '#09090B';
  const kituiColor = inverted ? '#FCA5A5' : '#991B1B';
  const crossColor = inverted ? '#ffffff' : brickRed;

  const sizeDimensions = {
    sm: { height: 28, crossSize: 24, fontSize: 13, kituiSize: 9 },
    md: { height: 38, crossSize: 32, fontSize: 17, kituiSize: 11 },
    lg: { height: 48, crossSize: 42, fontSize: 22, kituiSize: 13 },
    xl: { height: 60, crossSize: 52, fontSize: 26, kituiSize: 16 },
  }[size];

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* Caritas Flame Cross Symbol in Brick Red / White */}
      <svg
        width={sizeDimensions.crossSize}
        height={sizeDimensions.crossSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-label="Caritas Flame Cross"
      >
        {/* Top Flame Cluster */}
        <path
          d="M38 12C38 25 45 32 45 42H30C30 32 25 24 38 12Z"
          fill={crossColor}
        />
        <path
          d="M62 12C62 25 55 32 55 42H70C70 32 75 24 62 12Z"
          fill={crossColor}
        />
        <path
          d="M26 18C26 30 35 36 35 44H20C20 34 16 26 26 18Z"
          fill={crossColor}
        />
        <path
          d="M74 18C74 30 65 36 65 44H80C80 34 84 26 74 18Z"
          fill={crossColor}
        />

        {/* Bottom Flame Cluster */}
        <path
          d="M38 88C38 75 45 68 45 58H30C30 68 25 76 38 88Z"
          fill={crossColor}
        />
        <path
          d="M62 88C62 75 55 68 55 58H70C70 68 75 76 62 88Z"
          fill={crossColor}
        />
        <path
          d="M26 82C26 70 35 64 35 56H20C20 66 16 74 26 82Z"
          fill={crossColor}
        />
        <path
          d="M74 82C74 70 65 64 65 56H80C80 66 84 74 74 82Z"
          fill={crossColor}
        />

        {/* Left Flame Cluster */}
        <path
          d="M12 38C25 38 32 45 42 45V30C32 30 24 25 12 38Z"
          fill={crossColor}
        />
        <path
          d="M12 62C25 62 32 55 42 55V70C32 70 24 75 12 62Z"
          fill={crossColor}
        />

        {/* Right Flame Cluster */}
        <path
          d="M88 38C75 38 68 45 58 45V30C68 30 76 25 88 38Z"
          fill={crossColor}
        />
        <path
          d="M88 62C75 62 68 55 58 55V70C68 70 76 75 88 62Z"
          fill={crossColor}
        />

        {/* Central Latin Solid Cross */}
        <rect x="42" y="2" width="16" height="96" rx="2" fill={crossColor} />
        <rect x="2" y="42" width="96" height="16" rx="2" fill={crossColor} />
      </svg>

      {/* Typography: Caritas + KITUI */}
      <div className="flex flex-col leading-none">
        <span
          className="font-bold tracking-tight"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: `${sizeDimensions.fontSize}px`,
            color: textColor,
            letterSpacing: '-0.02em',
          }}
        >
          Caritas
        </span>
        {showSubtitle && (
          <span
            className="font-extrabold"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: `${sizeDimensions.kituiSize}px`,
              color: kituiColor,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginTop: '1px',
            }}
          >
            KITUI
          </span>
        )}
      </div>
    </div>
  );
};

