import { useEffect, useRef, useState } from "react";
import { composeShot, placeOnPlate } from "@/lib/studio/composite";
import {
  defaultRegionIds,
  editedSrc,
  mediaFor,
  modeLabel,
  plateFor,
  regionsFor,
  SHOT_BY_KEY,
  type Mode,
  type ShotKey,
} from "@/lib/studio/catalog";
import type { ShotRow, VehicleRow } from "@/lib/studio/server";
import { getUpload } from "@/lib/studio/uploads";

export function ReviewStage({
  vehicle,
  shot,
  onMode,
  onApprove,
  onReplace,
}: {
  vehicle: VehicleRow;
  shot: ShotRow;
  onMode: (mode: Mode) => void;
  onApprove: () => void;
  onReplace?: (file: File) => void;
}) {
  const def = SHOT_BY_KEY[shot.shot_key as ShotKey];
  const media = mediaFor(vehicle.catalog_key, shot.shot_key);
  const upload = getUpload(shot.id);
  const original = upload ?? media?.lot ?? "";
  const processed = editedSrc(media, vehicle.backdrop);
  const plate = plateFor(vehicle.backdrop);
  const regions = def ? regionsFor(def.guide) : [];
  const [selected, setSelected] = useState<string[]>(() => (def ? defaultRegionIds(shot.mode as Mode, def.guide) : []));
  const [tool, setTool] = useState<"tap" | "add" | "protect">("tap");
  const [brush, setBrush] = useState(28);
  const [opacity, setOpacity] = useState(0.55);
  const [shape, setShape] = useState<"round" | "square" | "soft">("round");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [panning, setPanning] = useState(false);
  const addRef = useRef<HTMLCanvasElement>(null);
  const protectRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const space = useRef(false);
  const panStart = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const history = useRef<{ add: ImageData | null; protect: ImageData | null }[]>([]);

  useEffect(() => {
    setResult(null);
    setSelected(def ? defaultRegionIds(shot.mode as Mode, def.guide) : []);
    for (const canvas of [addRef.current, protectRef.current]) {
      if (!canvas) continue;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [shot.id, shot.mode, vehicle.backdrop, def]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        space.current = true;
        setPanning(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        const prev = history.current.pop();
        if (!prev) return;
        for (const [canvas, data] of [
          [addRef.current, prev.add],
          [protectRef.current, prev.protect],
        ] as const) {
          if (!canvas || !data) continue;
          canvas.getContext("2d")?.putImageData(data, 0, 0);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space.current = false;
        setPanning(false);
        panStart.current = null;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function snapshot() {
    const snap = {
      add: addRef.current?.getContext("2d")?.getImageData(0, 0, addRef.current.width, addRef.current.height) ?? null,
      protect: protectRef.current?.getContext("2d")?.getImageData(0, 0, protectRef.current.width, protectRef.current.height) ?? null,
    };
    history.current.push(snap);
    if (history.current.length > 20) history.current.shift();
  }

  useEffect(() => {
    const fit = () => {
      const host = addRef.current?.parentElement;
      if (!host) return;
      const w = Math.max(1, Math.round(host.clientWidth));
      const h = Math.max(1, Math.round(host.clientHeight));
      for (const canvas of [addRef.current, protectRef.current]) {
        if (!canvas) continue;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [shot.id]);

  function paint(e: React.PointerEvent, down: boolean) {
    if (tool === "tap") return;
    const canvas = tool === "add" ? addRef.current : protectRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const alpha = Math.max(0.05, Math.min(1, opacity));
    const color = tool === "add" ? `rgba(196,23,42,${alpha})` : `rgba(26,18,20,${alpha})`;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = brush;
    if (shape === "square") {
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
    } else {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    if (down) {
      snapshot();
      drawing.current = true;
      if (shape === "soft") {
        const r = brush / 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === "square") {
        ctx.fillRect(x - brush / 2, y - brush / 2, brush, brush);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (drawing.current) {
      if (shape === "soft") {
        const r = brush / 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  }

  function tap(e: React.PointerEvent) {
    if (tool !== "tap") return;
    const host = e.currentTarget as HTMLElement;
    const rect = host.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const hit = regions.find((r) => {
      if (r.kind === "outside") {
        const inside = nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h;
        return !inside;
      }
      return nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h;
    });
    if (!hit) return;
    setSelected((cur) => (cur.includes(hit.id) ? cur.filter((id) => id !== hit.id) : [...cur, hit.id]));
  }

  async function build(add: HTMLCanvasElement | null, protect: HTMLCanvasElement | null) {
    if (!original) return original;
    const hasBrush = Boolean(add || protect);
    if (shot.mode === "keep" && !hasBrush) return original;
    if (processed && shot.mode !== "windows") {
      return composeShot({
        originalSrc: original,
        editedSrc: processed,
        plateSrc: plate,
        mode: shot.mode as Mode,
        regions,
        selectedIds: selected,
        addMask: add,
        protectMask: protect,
      });
    }
    if (shot.mode === "windows") {
      return composeShot({
        originalSrc: original,
        editedSrc: plate,
        plateSrc: plate,
        mode: "windows",
        regions: [],
        selectedIds: [],
        addMask: add,
        protectMask: protect,
      });
    }
    // Real cutout via the server (rembg). Falls back to the local plate only if the call fails.
    try {
      const blob = await fetch(original).then((r) => r.blob());
      const body = new FormData();
      body.append("file", blob, "shot.jpg");
      body.append("plate", plate);
      const res = await fetch("/api/studio/cutout", { method: "POST", body });
      if (res.ok) {
        const cut = await res.blob();
        const url = URL.createObjectURL(cut);
        return composeShot({
          originalSrc: original,
          editedSrc: url,
          plateSrc: plate,
          mode: "swap_all",
          regions,
          selectedIds: selected,
          addMask: add,
          protectMask: protect,
        });
      }
    } catch {
      // fall through
    }
    const plated = await placeOnPlate(original, plate);
    return composeShot({
      originalSrc: original,
      editedSrc: plated,
      plateSrc: plate,
      mode: "swap_all",
      regions,
      selectedIds: selected,
      addMask: add,
      protectMask: protect,
    });
  }

  useEffect(() => {
    let live = true;
    if (!original || shot.mode === "keep") {
      setResult(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    void build(null, null)
      .then((url) => {
        if (live) setResult(url);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Cutout failed");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
    // Build once per shot/backdrop/mode. Re-run applies the brush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id, shot.mode, vehicle.backdrop, original, processed, plate]);

  async function rerun() {
    if (!original) return;
    setBusy(true);
    setError("");
    try {
      const url = await build(addRef.current, protectRef.current);
      setResult(url);
      // Clear the brush so the result is visible
      for (const canvas of [addRef.current, protectRef.current]) {
        if (!canvas) continue;
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setBusy(false);
    }
  }

  const editedView = result ?? processed ?? original;
  const low = shot.flagged || shot.confidence < 75;

  return (
    <div className="space-y-4">
      {low && (
        <p className="rounded-lg border border-primary bg-surface px-3 py-2 text-sm text-primary">
          Low confidence ({shot.confidence}). Check the cutout or glass before approving. Damage is left alone.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <figure className="overflow-hidden rounded-lg border border-line bg-surface">
          <figcaption className="border-b border-line px-3 py-2 text-xs tracking-wide text-muted">ORIGINAL</figcaption>
          {original ? (
            <img src={original} alt="Original" className="shot-frame w-full object-cover" />
          ) : (
            <div className="flex shot-frame items-center justify-center text-sm text-muted">No original yet</div>
          )}
        </figure>
        <figure className="overflow-hidden rounded-lg border border-line bg-surface">
          <figcaption className="flex items-center justify-between border-b border-line px-3 py-2 text-xs tracking-wide text-muted">
            <span>
              EDITED · {modeLabel(shot.mode as Mode)}
              {busy ? " · cutting out" : result ? " · on plate" : ""}
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded border border-line px-2 py-0.5">
                −
              </button>
              <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="rounded border border-line px-2 py-0.5">
                +
              </button>
              <button type="button" onClick={() => setZoom(1)} className="rounded border border-line px-2 py-0.5">
                Fit
              </button>
            </span>
          </figcaption>
          <div
            ref={frameRef}
            className="shot-frame relative overflow-auto bg-bg"
            style={{ cursor: panning ? "grab" : undefined }}
            onWheel={(e) => {
              e.preventDefault();
              setZoom((z) => Math.max(0.5, Math.min(4, +(z + (e.deltaY < 0 ? 0.15 : -0.15)).toFixed(2))));
            }}
            onPointerDown={(e) => {
              if (!space.current) return;
              e.preventDefault();
              panStart.current = { x: e.clientX, y: e.clientY, sl: frameRef.current?.scrollLeft ?? 0, st: frameRef.current?.scrollTop ?? 0 };
            }}
            onPointerMove={(e) => {
              if (!panStart.current || !frameRef.current) return;
              frameRef.current.scrollLeft = panStart.current.sl - (e.clientX - panStart.current.x);
              frameRef.current.scrollTop = panStart.current.st - (e.clientY - panStart.current.y);
            }}
            onPointerUp={() => {
              panStart.current = null;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("ring-4", "ring-primary");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("ring-4", "ring-primary");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("ring-4", "ring-primary");
              const file = e.dataTransfer.files?.[0] ?? null;
              if (file && file.type.startsWith("image/") && onReplace) onReplace(file);
            }}
          >
            <div className="relative origin-top-left" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
              {editedView ? (
                <img src={editedView} alt="Edited" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted">Nothing to composite</div>
              )}
              {tool === "tap" &&
                regions
                  .filter((r) => r.kind === "rect")
                  .map((r) => (
                    <span
                      key={r.id}
                      className={`pointer-events-none absolute border-2 ${selected.includes(r.id) ? "border-primary" : "border-line"}`}
                      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                    />
                  ))}
              <canvas
                ref={addRef}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ cursor: panning ? "grab" : tool === "tap" ? "pointer" : "crosshair" }}
                onPointerDown={(e) => {
                  if (space.current) return;
                  if (tool === "tap") tap(e);
                  else paint(e, true);
                }}
                onPointerMove={(e) => {
                  if (space.current) return;
                  if (tool !== "tap") paint(e, false);
                }}
                onPointerUp={() => {
                  drawing.current = false;
                }}
                onPointerLeave={() => {
                  drawing.current = false;
                }}
              />
              <canvas ref={protectRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
          </div>
        </figure>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["swap_all", "windows", "keep"] as Mode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onMode(mode)}
            className={`rounded-lg px-3 py-2 text-sm ${shot.mode === mode ? "bg-primary text-primary-fg" : "border border-line bg-surface"}`}
          >
            {modeLabel(mode)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["tap", "Tap select"],
            ["add", "Brush add"],
            ["protect", "Brush protect"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            className={`rounded-lg px-3 py-2 text-sm ${tool === id ? "bg-ink text-primary-fg" : "border border-line bg-surface"}`}
          >
            {label}
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm text-muted">
          Size
          <input
            type="range"
            min={8}
            max={72}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
            className="w-28"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Opacity
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="w-28"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Shape
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value as "round" | "square" | "soft")}
            className="rounded border border-line bg-surface px-2 py-1 text-sm"
          >
            <option value="round">Round</option>
            <option value="square">Square</option>
            <option value="soft">Soft</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            snapshot();
            for (const canvas of [addRef.current, protectRef.current]) {
              if (!canvas) continue;
              canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
            }
          }}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          Clear brush
        </button>
        <button type="button" onClick={() => void rerun()} disabled={busy || !original} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-fg disabled:opacity-50">
          {busy ? "Re-running…" : "Re-run this photo"}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={shot.status === "empty"}
          className="rounded-lg border border-ink bg-surface px-4 py-2 text-sm disabled:opacity-40"
        >
          {shot.approved ? "Approved" : "Approve"}
        </button>
      </div>
      {tool === "tap" && selected.length > 0 && (
        <p className="text-sm text-muted">Selected: {selected.join(", ")}. Add forces a swap. Protect keeps the original pixel.</p>
      )}
      {tool !== "tap" && (
        <p className="text-sm text-muted">
          {tool === "add" ? "Brush add: paint areas to force a swap." : "Brush protect: paint areas to keep the original."} Hold space to pan. Scroll to zoom. Ctrl+Z undoes a stroke.
        </p>
      )}
      {error && <p className="text-sm text-primary">{error}</p>}
    </div>
  );
}
