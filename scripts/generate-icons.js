import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
const iconSvgPath = path.join(publicDir, 'icon.svg');
const svgBuffer = fs.readFileSync(iconSvgPath);

// Create maskable SVG with full-bleed background (no rx)
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="brickBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#991B1B" />
      <stop offset="100%" stop-color="#7F1D1D" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#brickBg)"/>
  
  <!-- Centered scaled Caritas logo inside 80% safe zone -->
  <g transform="translate(51, 45) scale(0.8)">
    <g fill="#FFFFFF" transform="translate(156, 120) scale(2)">
      <path d="M38 12C38 25 45 32 45 42H30C30 32 25 24 38 12Z" />
      <path d="M62 12C62 25 55 32 55 42H70C70 32 75 24 62 12Z" />
      <path d="M38 88C38 75 45 68 45 58H30C30 68 25 76 38 88Z" />
      <path d="M62 88C62 75 55 68 55 58H70C70 68 75 76 62 88Z" />
      <path d="M12 38C25 38 32 45 42 45V30C32 30 24 25 12 38Z" />
      <path d="M12 62C25 62 32 55 42 55V70C32 70 24 75 12 62Z" />
      <path d="M88 38C75 38 68 45 58 45V30C68 30 76 25 88 38Z" />
      <path d="M88 62C75 62 68 55 58 55V70C68 70 76 75 88 62Z" />
      <rect x="42" y="2" width="16" height="96" rx="2" />
      <rect x="2" y="42" width="96" height="16" rx="2" />
    </g>
    <text x="256" y="375" font-family="'Outfit', 'Segoe UI', sans-serif" font-weight="900" font-size="48" fill="#FFFFFF" text-anchor="middle" letter-spacing="6">DIRA</text>
    <text x="256" y="415" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="20" fill="#FECACA" text-anchor="middle" letter-spacing="4">KAA RADA!</text>
  </g>
</svg>
`;

async function generate() {
  console.log('Generating PNG icons...');

  // 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // 180x180 Apple Touch Icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Maskable 512x512 PNG
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  console.log('All PWA and Android icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
