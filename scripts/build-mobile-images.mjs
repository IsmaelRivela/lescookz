/**
 * Mobile bitmaps at 2× a tall phone (longest side 1688).
 * Alpha stays alpha. Desktop files are not touched.
 * Skips anything already that small (tickets, the portrait).
 */
import { readdir, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MAX = 1688;
const roots = ["media/photo", "media/ticket", "media/ui"];
const map = {};

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "m") continue;
      await walk(full, out);
    } else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

let written = 0;
let skipped = 0;
let keptAlpha = 0;

for (const folder of roots) {
  const abs = path.join(root, folder);
  const files = await walk(abs);
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const meta = await sharp(file).metadata();
    const long = Math.max(meta.width || 0, meta.height || 0);
    if (!long || long <= MAX) {
      skipped += 1;
      continue;
    }
    const destRel = `media/m/${rel.slice("media/".length).replace(/\.(jpe?g|png|webp)$/i, ".webp")}`;
    const dest = path.join(root, destRel);
    await mkdir(path.dirname(dest), { recursive: true });
    const landscape = (meta.width || 0) >= (meta.height || 0);
    await sharp(file)
      .rotate()
      .resize({
        width: landscape ? MAX : undefined,
        height: landscape ? undefined : MAX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 74, alphaQuality: 100, effort: 4 })
      .toFile(dest);
    const after = await sharp(dest).metadata();
    if (meta.hasAlpha && !after.hasAlpha) throw new Error(`lost alpha: ${rel}`);
    if (meta.hasAlpha) keptAlpha += 1;
    map[rel] = destRel;
    written += 1;
    const before = (await stat(file)).size;
    const next = (await stat(dest)).size;
    if (written <= 8 || written % 40 === 0) {
      console.log(`${rel} ${meta.width}x${meta.height} -> ${after.width}x${after.height}  ${Math.round(before / 1024)}KB -> ${Math.round(next / 1024)}KB  alpha ${Boolean(after.hasAlpha)}`);
    }
  }
}

const body = `window.COOKZ_MOBILE = ${JSON.stringify(map, null, 2)};\n`;
await writeFile(path.join(root, "js/mobile-map.js"), body);
console.log(`wrote ${written}, skipped ${skipped}, alpha kept ${keptAlpha}`);
