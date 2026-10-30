import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { createVehicle, decodeVin, readPlateImage } from "@/lib/studio/server";
import { putUpload } from "@/lib/studio/uploads";

export const Route = createFileRoute("/capture/")({ component: VinStep });

function VinStep() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [stock, setStock] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function applyDecode(next: string) {
    const clean = next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    setVin(clean);
    setError("");
    if (clean.length < 17) {
      setStatus(clean.length >= 11 ? "Add the rest of the VIN to decode it." : "");
      return;
    }
    setStatus("Decoding VIN…");
    try {
      const result = await decodeVin({ data: clean });
      if (!result.ok) {
        setStatus("");
        setError(result.message);
        return;
      }
      if (result.year) setYear(String(result.year));
      if (result.make) setMake(result.make);
      if (result.model) setModel(result.model);
      if (result.color) setColor(result.color);
      if (result.stock) setStock(result.stock);
      setStatus(`Decoded ${result.year || ""} ${result.make} ${result.model}`.trim());
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "VIN decode failed.");
    }
  }

  async function onPlate(file: File | null) {
    if (!file) return;
    setError("");
    setStatus("Reading plate…");
    try {
      const dataUrl = await fileToDataUrl(file);
      setPlate(dataUrl);
      const found = await Promise.race([
        readPlate(dataUrl),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Plate read took too long. Type the VIN.")), 20000)),
      ]);
      if (!found) {
        setStatus("");
        setError("Plate is in. Couldn't read a VIN — type it below.");
        document.getElementById("vin-input")?.focus();
        return;
      }
      await applyDecode(found);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Could not read that plate.");
    }
  }

  async function save() {
    setError("");
    if (vin.length < 11) {
      setError("Type a VIN of at least 11 characters, or read it from a plate photo.");
      document.getElementById("vin-input")?.focus();
      return;
    }
    setBusy(true);
    setStatus("Opening shot list…");
    try {
      const created = await withTimeout(
        createVehicle({
          data: { vin, stock, year: Number(year) || new Date().getFullYear(), make, model, color },
        }),
        12000,
        "Opening the shot list timed out. Try again.",
      );
      const id = created?.id;
      if (!id) throw new Error("The car was not created.");
      if (plate) {
        putUpload(`${id}:vin`, plate);
        sessionStorage.setItem(`abw-plate:${id}`, plate);
      }
      await navigate({ to: "/capture/$vehicleId", params: { vehicleId: id } });
    } catch (err) {
      setStatus("");
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not open the shot list.");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <p className="font-display text-sm tracking-widest text-muted">STEP 1</p>
        <h1 className="font-display text-4xl leading-none">VIN</h1>
        <p className="mt-2 text-sm text-muted">Take a plate photo, or type the VIN. A full VIN fills year, make, and model.</p>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative block w-full overflow-hidden rounded-lg border border-dashed border-line bg-ink text-left text-primary-fg"
      >
        {plate ? (
          <img src={plate} alt="VIN plate" className="shot-frame w-full object-cover" />
        ) : (
          <div className="shot-frame flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="font-display text-3xl">Take VIN photo</span>
            <span className="text-sm text-primary-fg/80">Tap to use the camera or a file</span>
          </div>
        )}
        {plate && <span className="absolute bottom-3 left-3 rounded-lg bg-ink/80 px-3 py-1 text-sm">Replace plate</span>}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void onPlate(file);
        }}
      />

      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-primary px-4 py-3 text-sm text-primary-fg">
          {plate ? "Replace plate" : "Read plate"}
        </button>
        <button
          type="button"
          onClick={() => document.getElementById("vin-input")?.focus()}
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"
        >
          Enter manually
        </button>
      </div>

      <div className="space-y-3">
        <label className="block text-sm" htmlFor="vin-input">
          VIN
          <input
            id="vin-input"
            value={vin}
            onChange={(e) => void applyDecode(e.target.value)}
            placeholder="17 characters"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3 font-display text-2xl tracking-wide"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock" value={stock} onChange={setStock} />
          <Field label="Year" value={year} onChange={setYear} />
          <Field label="Make" value={make} onChange={setMake} />
          <Field label="Model" value={model} onChange={setModel} />
          <Field label="Color" value={color} onChange={setColor} />
        </div>
      </div>

      {status && <p className="text-sm text-muted">{status}</p>}
      {error && <p className="rounded-lg border border-primary bg-surface px-3 py-2 text-sm text-primary">{error}</p>}

      <button type="button" disabled={busy} onClick={() => void save()} className="mb-8 w-full rounded-lg bg-ink py-3 text-primary-fg disabled:opacity-40">
        {busy ? "Opening…" : "Start shot list"}
      </button>
    </div>
  );
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(message));
      },
    );
  });
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2" />
    </label>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

async function readPlate(src: string) {
  const barcode = await readBarcode(src);
  if (barcode.length >= 11) return barcode;
  const prepared = await preparePlate(src);
  const result = await readPlateImage({ data: prepared });
  return result.ok ? result.vin : "";
}

async function readBarcode(src: string) {
  try {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector) return "";
    const img = new Image();
    img.src = src;
    await img.decode();
    const detector = new Detector({ formats: ["code_128", "code_39", "qr_code", "pdf417", "ean_13"] });
    const codes = await detector.detect(img);
    return (codes[0]?.rawValue ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    return "";
  }
}

async function preparePlate(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const fitted = fitImage(img, 1400);
  return [
    renderPlate(fitted, { x: 0, y: 0, w: 1, h: 1 }),
    renderPlate(fitted, { x: 0.05, y: 0.18, w: 0.9, h: 0.34 }),
    renderPlate(fitted, { x: 0.08, y: 0.32, w: 0.88, h: 0.36 }),
  ];
}

function fitImage(img: HTMLImageElement, max: number) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function renderPlate(source: HTMLImageElement | HTMLCanvasElement, crop: { x: number; y: number; w: number; h: number }) {
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  const sx = Math.round(width * crop.x);
  const sy = Math.round(height * crop.y);
  const sw = Math.max(1, Math.round(width * crop.w));
  const sh = Math.max(1, Math.round(height * crop.h));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", 0.8);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  const frame = ctx.getImageData(0, 0, sw, sh);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const gray = px[i]! * 0.3 + px[i + 1]! * 0.59 + px[i + 2]! * 0.11;
    const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128));
    px[i] = px[i + 1] = px[i + 2] = boosted;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.8);
}
