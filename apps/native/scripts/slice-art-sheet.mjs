// Cuts a generated sprite sheet into one transparent PNG per object, ready
// for build-art.mjs (see assets/art/CATALOG.md):
//   node scripts/slice-art-sheet.mjs <sheet.png> <names.txt> <cols> <rows> <out-dir>
// names.txt lists one art name per line in reading order (anything after a
// "|" is ignored, so the prompt list can double as the names file).
// Objects are found as connected opaque regions over the whole sheet — so a
// piece that spills past its grid cell stays whole — and filed into a cell by
// their centre. Background-removal debris (faint alpha, specks) is dropped.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    // Not a direct dependency: use the copy the Expo toolchain installs.
    const store = path.join(root, "..", "..", "node_modules", ".pnpm");
    const dir = readdirSync(store).find((name) => name.startsWith("sharp@"));
    if (!dir) throw new Error("sharp is not installed (pnpm add -D sharp)");
    return require(path.join(store, dir, "node_modules", "sharp"));
  }
}

const sharp = loadSharp();
const [sheet, namesFile, colsArg, rowsArg, outDir] = process.argv.slice(2);
if (!outDir) {
  throw new Error(
    "usage: node scripts/slice-art-sheet.mjs <sheet.png> <names.txt> <cols> <rows> <out-dir>",
  );
}
const cols = Number(colsArg);
const rows = Number(rowsArg);
const names = readFileSync(namesFile, "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split("|")[0].trim());
mkdirSync(outDir, { recursive: true });

// Below this alpha a pixel is halo, not object.
const ALPHA_MIN = 48;
// Parts smaller than this share of a cell are specks.
const SPECK = 0.004;
// Within a cell, parts under this share of the largest are stray fragments.
const FRAGMENT = 0.04;

const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const minPart = ((W * H) / (cols * rows)) * SPECK;

// Label connected opaque regions (4-neighbour flood fill).
const label = new Int32Array(W * H).fill(-1);
const parts = [];
for (let p = 0; p < W * H; p++) {
  if (label[p] !== -1 || data[p * 4 + 3] < ALPHA_MIN) continue;
  const part = { id: parts.length, n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: 0, y1: 0 };
  const stack = [p];
  label[p] = part.id;
  while (stack.length) {
    const q = stack.pop();
    const x = q % W;
    const y = (q / W) | 0;
    part.n++;
    part.sx += x;
    part.sy += y;
    part.x0 = Math.min(part.x0, x);
    part.y0 = Math.min(part.y0, y);
    part.x1 = Math.max(part.x1, x);
    part.y1 = Math.max(part.y1, y);
    for (const r of [q + 1, q - 1, q + W, q - W]) {
      if (r < 0 || r >= W * H || Math.abs((r % W) - x) > 1) continue;
      if (label[r] === -1 && data[r * 4 + 3] >= ALPHA_MIN) {
        label[r] = part.id;
        stack.push(r);
      }
    }
  }
  parts.push(part);
}

const cells = names.map(() => []);
for (const part of parts) {
  if (part.n < minPart) continue;
  const cx = part.sx / part.n;
  const cy = part.sy / part.n;
  const cell = Math.floor(cy / (H / rows)) * cols + Math.floor(cx / (W / cols));
  cells[cell]?.push(part);
}

for (const [index, list] of cells.entries()) {
  if (!list.length) {
    console.log(`${names[index]}  MISSING`);
    continue;
  }
  const biggest = Math.max(...list.map((part) => part.n));
  const keep = list.filter((part) => part.n >= biggest * FRAGMENT);
  const ids = new Set(keep.map((part) => part.id));
  const x0 = Math.min(...keep.map((part) => part.x0));
  const y0 = Math.min(...keep.map((part) => part.y0));
  const w = Math.max(...keep.map((part) => part.x1)) - x0 + 1;
  const h = Math.max(...keep.map((part) => part.y1)) - y0 + 1;
  const pixels = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y0 + y) * W + x0 + x;
      if (ids.has(label[s])) data.copy(pixels, (y * w + x) * 4, s * 4, s * 4 + 4);
    }
  }
  await sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(path.join(outDir, `${names[index]}.png`));
  console.log(`${names[index]}  ${w}x${h}`);
}
