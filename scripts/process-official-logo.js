import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const sourceImgPath = path.resolve('src/assets/images/dira_official_logo_1788959313140.jpg');
const publicDir = path.resolve('public');

async function processIcons() {
  console.log('Reading source image from:', sourceImgPath);
  if (!fs.existsSync(sourceImgPath)) {
    throw new Error('Source image not found: ' + sourceImgPath);
  }

  // 1. Generate 512x512 standard PNG
  await sharp(sourceImgPath)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Created pwa-512x512.png');

  // 2. Generate 192x192 standard PNG
  await sharp(sourceImgPath)
    .resize(192, 192, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Created pwa-192x192.png');

  // 3. Generate 180x180 Apple Touch Icon
  await sharp(sourceImgPath)
    .resize(180, 180, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png');

  // 4. Generate maskable 512x512 with proper padding (80% safe zone inside #006837 dark green / white background)
  const paddedIcon = await sharp(sourceImgPath)
    .resize(410, 410, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: paddedIcon, gravity: 'center' }])
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Created pwa-maskable-512x512.png');

  // 5. Generate high-res transparent/clean web brand logo
  await sharp(sourceImgPath)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'dira-logo.png'));
  console.log('Created dira-logo.png');

  // 6. Favicon 64x64 PNG
  await sharp(sourceImgPath)
    .resize(64, 64, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('Created favicon.png');

  console.log('All formats generated successfully!');
}

processIcons().catch(err => {
  console.error('Error processing icons:', err);
  process.exit(1);
});
