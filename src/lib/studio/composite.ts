import type { Mode, Region } from "@/lib/studio/catalog";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

function clamp(n: number) {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

export async function gradeImage(src: string, maxEdge = 1280): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, w, h);
  const frame = ctx.getImageData(0, 0, w, h);
  const d = frame.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    r += d[i] ?? 0;
    g += d[i + 1] ?? 0;
    b += d[i + 2] ?? 0;
    n++;
  }
  r /= n || 1;
  g /= n || 1;
  b /= n || 1;
  const avg = (r + g + b) / 3 || 1;
  const sr = avg / (r || 1);
  const sg = avg / (g || 1);
  const sb = avg / (b || 1);
  for (let i = 0; i < d.length; i += 4) {
    let R = (d[i] ?? 0) * sr;
    let G = (d[i + 1] ?? 0) * sg;
    let B = (d[i + 2] ?? 0) * sb;
    R = (R - 118) * 1.06 + 118;
    G = (G - 118) * 1.06 + 118;
    B = (B - 118) * 1.06 + 118;
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    if (y < 38) {
      R *= 0.9;
      G *= 0.9;
      B *= 0.9;
    }
    d[i] = clamp(R);
    d[i + 1] = clamp(G);
    d[i + 2] = clamp(B);
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function hitRegion(region: Region, nx: number, ny: number) {
  if (region.kind === "outside") {
    const inside = nx >= region.x && nx <= region.x + region.w && ny >= region.y && ny <= region.y + region.h;
    return !inside;
  }
  return nx >= region.x && nx <= region.x + region.w && ny >= region.y && ny <= region.y + region.h;
}

function maskOn(data: Uint8ClampedArray | null, width: number, nx: number, ny: number) {
  if (!data || width <= 0) return false;
  const height = data.length / 4 / width;
  const x = Math.min(width - 1, Math.max(0, Math.floor(nx * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(ny * height)));
  const i = (Math.floor(y) * width + x) * 4;
  return (data[i + 3] ?? 0) > 40;
}

export async function placeOnPlate(originalSrc: string, plateSrc: string): Promise<string> {
  const original = await loadImage(originalSrc);
  const plate = await loadImage(plateSrc);
  const scale = Math.min(1, 1100 / Math.max(original.width, original.height));
  const w = Math.max(1, Math.round(original.width * scale));
  const h = Math.max(1, Math.round(original.height * scale));

  const car = document.createElement("canvas");
  car.width = w;
  car.height = h;
  const cctx = car.getContext("2d");
  if (!cctx) return originalSrc;
  cctx.drawImage(original, 0, 0, w, h);
  const frame = cctx.getImageData(0, 0, w, h);
  const alpha = subjectAlpha(frame.data, w, h);
  const pixels = frame.data;
  for (let i = 0; i < alpha.length; i++) pixels[i * 4 + 3] = alpha[i] ?? 0;
  cctx.putImageData(frame, 0, 0);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return originalSrc;
  ctx.drawImage(plate, 0, 0, w, h);
  ctx.save();
  ctx.fillStyle = "rgba(20,16,14,0.35)";
  ctx.filter = "blur(16px)";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.8, w * 0.3, h * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.drawImage(car, 0, 0);
  return out.toDataURL("image/jpeg", 0.9);
}

function subjectAlpha(data: Uint8ClampedArray, w: number, h: number) {
  const bg = edgeBackground(data, w, h, 34);
  const alpha = new Uint8Array(w * h);
  const cx = w * 0.5;
  const cy = h * 0.54;
  const rx = w * 0.38;
  const ry = h * 0.3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inBody = dx * dx + dy * dy <= 1;
      alpha[y * w + x] = inBody || !bg[y * w + x] ? 255 : 0;
    }
  }
  return feather(alpha, w, h, 5);
}

function edgeBackground(data: Uint8ClampedArray, w: number, h: number, threshold: number) {
  const bg = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (seen[i]) return;
    seen[i] = 1;
    bg[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i / w) | 0;
    const next = [i - 1, i + 1, i - w, i + w];
    for (const ni of next) {
      if (ni < 0 || ni >= w * h || seen[ni]) continue;
      const nx = ni % w;
      const ny = (ni / w) | 0;
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
      seen[ni] = 1;
      if (colorGap(data, i, ni) <= threshold) {
        bg[ni] = 1;
        queue[tail++] = ni;
      }
    }
  }
  return bg;
}

function colorGap(data: Uint8ClampedArray, a: number, b: number) {
  const ia = a * 4;
  const ib = b * 4;
  return Math.abs((data[ia] ?? 0) - (data[ib] ?? 0)) + Math.abs((data[ia + 1] ?? 0) - (data[ib + 1] ?? 0)) + Math.abs((data[ia + 2] ?? 0) - (data[ib + 2] ?? 0));
}

function feather(alpha: Uint8Array, w: number, h: number, radius: number) {
  const out = new Uint8Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let oy = -radius; oy <= radius; oy++) {
        const yy = y + oy;
        if (yy < 0 || yy >= h) continue;
        for (let ox = -radius; ox <= radius; ox++) {
          const xx = x + ox;
          if (xx < 0 || xx >= w) continue;
          sum += alpha[yy * w + xx] ?? 0;
          n++;
        }
      }
      out[y * w + x] = n ? Math.round(sum / n) : 0;
    }
  }
  return out;
}

export async function composeShot(opts: {
  originalSrc: string;
  editedSrc: string | null;
  plateSrc?: string | null;
  mode: Mode;
  regions: Region[];
  selectedIds: string[];
  addMask: HTMLCanvasElement | null;
  protectMask: HTMLCanvasElement | null;
}): Promise<string> {
  const original = await loadImage(opts.originalSrc);
  const scale = Math.min(1, 1100 / Math.max(original.width, original.height));
  const w = Math.max(1, Math.round(original.width * scale));
  const h = Math.max(1, Math.round(original.height * scale));
  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const bctx = base.getContext("2d");
  if (!bctx) return opts.originalSrc;
  bctx.drawImage(original, 0, 0, w, h);
  const graded = bctx.getImageData(0, 0, w, h);

  let edited: ImageData | null = null;
  if (opts.editedSrc) {
    const img = await loadImage(opts.editedSrc);
    const layer = document.createElement("canvas");
    layer.width = w;
    layer.height = h;
    const lctx = layer.getContext("2d");
    if (lctx) {
      lctx.drawImage(img, 0, 0, w, h);
      edited = lctx.getImageData(0, 0, w, h);
    }
  }

  let plate: ImageData | null = null;
  if (opts.plateSrc) {
    const img = await loadImage(opts.plateSrc);
    const layer = document.createElement("canvas");
    layer.width = w;
    layer.height = h;
    const lctx = layer.getContext("2d");
    if (lctx) {
      lctx.drawImage(img, 0, 0, w, h);
      plate = lctx.getImageData(0, 0, w, h);
    }
  }

  const addW = opts.addMask?.width ?? 0;
  const addData = opts.addMask && addW ? opts.addMask.getContext("2d")?.getImageData(0, 0, opts.addMask.width, opts.addMask.height).data ?? null : null;
  const protectW = opts.protectMask?.width ?? 0;
  const protectData =
    opts.protectMask && protectW
      ? opts.protectMask.getContext("2d")?.getImageData(0, 0, opts.protectMask.width, opts.protectMask.height).data ?? null
      : null;

  const selected = opts.regions.filter((r) => opts.selectedIds.includes(r.id));
  const out = bctx.createImageData(w, h);
  const srcG = graded.data;
  const srcE = edited?.data;
  const srcP = plate?.data;
  const dst = out.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const ny = y / h;
      let replace = opts.mode === "swap_all";
      if (opts.mode === "windows") {
        const i = (y * w + x) * 4;
        const R = srcG[i] ?? 0;
        const G = srcG[i + 1] ?? 0;
        const B = srcG[i + 2] ?? 0;
        const max = Math.max(R, G, B);
        const min = Math.min(R, G, B);
        const sat = max === 0 ? 0 : (max - min) / max;
        const bright = (R + G + B) / 3;
        replace = ny < 0.55 && bright > 150 && sat < 0.3;
      }
      const inRegion = selected.some((r) => hitRegion(r, nx, ny));
      if (inRegion && opts.mode !== "windows") replace = true;
      const forcedAdd = maskOn(addData, addW, nx, ny);
      const forcedProtect = maskOn(protectData, protectW, nx, ny);
      if (forcedAdd) replace = true;
      if (forcedProtect) replace = false;
      if (replace && !srcE && !forcedAdd) replace = false;
      const i = (y * w + x) * 4;
      // Add pulls from the plate so frayed cutout edges can be cleaned. Protect keeps the original.
      let from = srcG;
      if (forcedAdd && srcP) from = srcP;
      else if (replace && srcE) from = srcE;
      dst[i] = from[i] ?? 0;
      dst[i + 1] = from[i + 1] ?? 0;
      dst[i + 2] = from[i + 2] ?? 0;
      dst[i + 3] = 255;
    }
  }
  bctx.putImageData(out, 0, 0);
  return base.toDataURL("image/jpeg", 0.88);
}
