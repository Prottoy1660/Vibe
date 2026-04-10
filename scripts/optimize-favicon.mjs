/**
 * Trims empty/transparent space around the logo, then scales it to fill a 512×512
 * canvas so browser tab icons (16–32px) stay readable.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '../public/favicon.png');

const buf = await sharp(out)
  .trim({ threshold: 5 })
  .resize(512, 512, { fit: 'cover', position: 'centre' })
  .png({ compressionLevel: 9 })
  .toBuffer();

await sharp(buf).toFile(out);
console.log('Wrote', out, `(${buf.length} bytes)`);

const publicDir = join(__dirname, '../public');
await sharp(buf).resize(32, 32).png().toFile(join(publicDir, 'favicon-32.png'));
await sharp(buf).resize(16, 16).png().toFile(join(publicDir, 'favicon-16.png'));
console.log('Wrote favicon-32.png, favicon-16.png');

const touch = join(publicDir, 'apple-touch-icon.png');
await sharp(buf)
  .resize(180, 180, { fit: 'cover', position: 'centre' })
  .png({ compressionLevel: 9 })
  .toFile(touch);
console.log('Wrote', touch);
