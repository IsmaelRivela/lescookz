import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire("/Users/ismaelrivela/Desktop/IA/vamps/vamps-cookz/scripts/package.json");
const sharp = require("sharp");

const SRC = "/Users/ismaelrivela/Desktop/IA/vamps/vamps-cookz";
const OUT = "/Users/ismaelrivela/Desktop/IA/vamps/lescookz-repo";
const WEB = path.join(SRC, "figma-web");

const PHOTO_EDGE = 2560;
const JPEG = { quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true };

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function photoJpeg(src, dest, edge) {
  ensure(path.dirname(dest));
  const meta = await sharp(src).metadata();
  const long = Math.max(meta.width || 0, meta.height || 0);
  const oriented = meta.orientation && meta.orientation !== 1;
  if (!oriented && long <= edge && src.endsWith(".jpg")) {
    const encoded = await sharp(src)
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg(JPEG)
      .toBuffer();
    if (encoded.length >= fs.statSync(src).size) {
      fs.copyFileSync(src, dest);
      return "kept";
    }
    fs.writeFileSync(dest, encoded);
    return "smaller";
  }
  await sharp(src)
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .jpeg(JPEG)
    .toFile(dest);
  return oriented ? "rotated" : "resized";
}

async function webpUi(src, dest, edge) {
  ensure(path.dirname(dest));
  await sharp(src)
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 95, alphaQuality: 100, effort: 4 })
    .toFile(dest);
}

const REPLACEMENTS = [
  ["assets/venues/all/", "media/photo/"],
  ["assets/venues/kanji/", "media/kanji/"],
  ["assets/venues/", "media/photo/"],
  ["assets/figma/ui/", "media/ui/"],
  ["assets/figma/hub/passed-along.svg", "media/ui/passed-along.svg"],
  ["assets/figma/hub/cookz.png", "media/ui/cookz.webp"],
  ["assets/figma/screens/manifest-portrait.png", "media/ui/manifest-portrait.png"],
  ["assets/figma/konbini/stattrak-page.png", "media/ui/stattrak-page.png"],
  ["assets/figma/konbini/tickets.png", "media/ui/tickets.png"],
  ["assets/home-plate.png", "media/ui/home-plate.webp"],
  ["assets/fonts/", "media/font/"],
  ["assets/konbini-sequence.mp4", "media/video/konbini-sequence.mp4"],
  ["assets/metro-gran-angular.mp4", "media/video/metro-gran-angular.mp4"],
  ["assets/models/favos/", "media/model/favos/"],
  ["assets/models/cs16/", "media/model/tracker/"],
  ["/cooks-data.js", "/data/cooks-data.js"],
  ['src="/cooks-data.js"', 'src="/data/cooks-data.js"'],
];

function rewriteText(text) {
  let out = text;
  for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);
  out = out.replaceAll('indexOf("assets/")', 'indexOf("media/")');
  out = out.replaceAll('preload="auto"', 'preload="none"');
  return out;
}

function copyTreeText(fromDir, toDir) {
  ensure(toDir);
  for (const name of fs.readdirSync(fromDir)) {
    const src = path.join(fromDir, name);
    const dest = path.join(toDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyTreeText(src, dest);
    else if (/\.(js|css|html)$/.test(name)) {
      fs.writeFileSync(dest, rewriteText(fs.readFileSync(src, "utf8")));
    }
  }
}

async function main() {
  copyTreeText(path.join(WEB, "js"), path.join(OUT, "js"));
  copyTreeText(path.join(WEB, "css"), path.join(OUT, "css"));
  fs.writeFileSync(path.join(OUT, "index.html"), rewriteText(fs.readFileSync(path.join(WEB, "index.html"), "utf8")));
  ensure(path.join(OUT, "data"));
  fs.copyFileSync(path.join(SRC, "cooks-data.js"), path.join(OUT, "data/cooks-data.js"));

  fs.cpSync(path.join(WEB, "vendor"), path.join(OUT, "vendor"), { recursive: true });
  fs.cpSync(path.join(WEB, "assets/fonts"), path.join(OUT, "media/font"), { recursive: true });

  ensure(path.join(OUT, "media/ui"));
  const uiSvg = ["logo-mark.svg", "back.svg"];
  for (const name of uiSvg) {
    fs.copyFileSync(path.join(WEB, "assets/figma/ui", name), path.join(OUT, "media/ui", name));
  }
  fs.copyFileSync(
    path.join(WEB, "assets/figma/hub/passed-along.svg"),
    path.join(OUT, "media/ui/passed-along.svg"),
  );
  fs.cpSync(path.join(WEB, "assets/venues/kanji"), path.join(OUT, "media/kanji"), { recursive: true });

  await webpUi(path.join(WEB, "assets/home-plate.png"), path.join(OUT, "media/ui/home-plate.webp"), 819);
  await webpUi(path.join(WEB, "assets/figma/hub/cookz.png"), path.join(OUT, "media/ui/cookz.webp"), 2000);
  for (const [from, to] of [
    ["assets/figma/screens/manifest-portrait.png", "media/ui/manifest-portrait.png"],
    ["assets/figma/konbini/stattrak-page.png", "media/ui/stattrak-page.png"],
    ["assets/figma/konbini/tickets.png", "media/ui/tickets.png"],
  ]) {
    const dest = path.join(OUT, to);
    ensure(path.dirname(dest));
    await sharp(path.join(WEB, from)).png({ compressionLevel: 9 }).toFile(dest);
  }

  const photoRoot = path.join(WEB, "assets/venues/all");
  const stats = { kept: 0, smaller: 0, resized: 0, rotated: 0 };
  for (const venue of fs.readdirSync(photoRoot)) {
    const dir = path.join(photoRoot, venue);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!/\.jpe?g$/i.test(file)) continue;
      const how = await photoJpeg(
        path.join(dir, file),
        path.join(OUT, "media/photo", venue, file),
        PHOTO_EDGE,
      );
      stats[how] += 1;
    }
  }
  const venues = path.join(WEB, "assets/venues");
  for (const venue of fs.readdirSync(venues)) {
    if (venue === "all" || venue === "kanji") continue;
    const dir = path.join(venues, venue);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of ["hover.jpg", "lienzo.jpg"]) {
      const src = path.join(dir, name);
      if (!fs.existsSync(src)) continue;
      const edge = name === "lienzo.jpg" ? 1280 : PHOTO_EDGE;
      const how = await photoJpeg(src, path.join(OUT, "media/photo", venue, name), edge);
      stats[how] += 1;
    }
  }

  const ticketSrc = path.join(SRC, "konbini-tickets/data/konbini-tickets.json");
  const ticketJson = JSON.parse(fs.readFileSync(ticketSrc, "utf8"));
  const list = ticketJson.tickets || ticketJson;
  let tickets = 0;
  for (const row of list) {
    const raw = row.image || "";
    const base = path.basename(raw);
    if (!base.endsWith(".png")) continue;
    const src = path.join(SRC, raw);
    if (!fs.existsSync(src)) {
      console.warn("missing ticket", raw);
      continue;
    }
    const webpName = base.replace(/\.png$/, ".webp");
    const dest = path.join(OUT, "media/ticket", webpName);
    ensure(path.dirname(dest));
    const oriented = sharp(src).rotate();
    const meta = await oriented.metadata();
    await sharp(src)
      .rotate()
      .resize({
        width: Math.max(1, Math.round(meta.width / 2)),
        height: Math.max(1, Math.round(meta.height / 2)),
        fit: "fill",
      })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(dest);
    row.image = `media/ticket/${webpName}`;
    row.imageSrc = `/media/ticket/${webpName}`;
    tickets += 1;
  }
  fs.writeFileSync(path.join(OUT, "data/tickets.json"), JSON.stringify(ticketJson));
  const appPath = path.join(OUT, "js/app.js");
  let app = fs.readFileSync(appPath, "utf8");
  app = app.replace(
    'const TICKET_JSON = "/konbini-tickets/data/konbini-tickets.json";',
    'const TICKET_JSON = "/data/tickets.json";',
  );
  fs.writeFileSync(appPath, app);

  const models = path.join(WEB, "assets/models/favos");
  ensure(path.join(OUT, "media/model/favos"));
  for (const file of fs.readdirSync(models)) {
    if (file.endsWith(".glb")) fs.copyFileSync(path.join(models, file), path.join(OUT, "media/model/favos", file));
  }
  ensure(path.join(OUT, "media/model/tracker"));
  fs.copyFileSync(
    path.join(WEB, "assets/models/cs16/v_knife_inspect.mdl"),
    path.join(OUT, "media/model/tracker/v_knife_inspect.mdl"),
  );

  const leftovers = [];
  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) scan(p);
      else if (/\.(html|js|css)$/.test(name)) {
        const text = fs.readFileSync(p, "utf8");
        if (text.includes("assets/") || text.includes("konbini-tickets/")) {
          leftovers.push(path.relative(OUT, p));
        }
      }
    }
  };
  scan(OUT);
  console.log(JSON.stringify({ stats, tickets, leftovers }, null, 2));
  console.log("IMAGES_DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
