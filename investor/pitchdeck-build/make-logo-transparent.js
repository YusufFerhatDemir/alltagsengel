const sharp = require("sharp");
const fs = require("fs");

(async () => {
  const srcPath = "/sessions/eager-gracious-bardeen/mnt/alltagsengel/public/icon-512x512.png";
  const img = sharp(srcPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Pixel durchgehen: dunkler Bereich (R+G+B < 180) → transparent
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const lum = r + g + b;
    if (lum < 180) {
      // Dunkler Coal/Background → voll transparent
      data[i+3] = 0;
    } else if (lum < 240) {
      // Graue Übergänge → semi-transparent basierend auf Helligkeit
      data[i+3] = Math.round((lum - 180) / 60 * 255);
    }
    // Helle Pixel (Gold-Engel) → Alpha bleibt 255
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile("logo-mark-app.png");

  // Saved: Backup old + replace
  fs.renameSync("logo-mark.png", "logo-mark-old.png");
  fs.renameSync("logo-mark-app.png", "logo-mark.png");
  console.log("✓ logo-mark.png ersetzt durch transparent-App-Logo");
})();
