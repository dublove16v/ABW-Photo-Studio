import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wireframe } from "@/components/wireframe";
import { SHOT_BY_KEY, mediaFor, type Guide, type ShotKey } from "@/lib/studio/catalog";
import { getVehicle, patchShot, setVehicleStatus, type ShotRow, type VehicleRow } from "@/lib/studio/server";
import { getUpload, putUpload } from "@/lib/studio/uploads";

export const Route = createFileRoute("/capture/$vehicleId")({ component: CaptureCarPage });

function CaptureCarPage() {
  const { vehicleId } = Route.useParams();
  return <CaptureCar id={vehicleId} />;
}

const STEPS = ["Cut out the car", "Studio or outdoor plate", "Contact shadow", "Glass, if this shot has it", "Color: balance, blacks, paint"];

function CaptureCar({ id }: { id: string }) {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [active, setActive] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  function reload() {
    return getVehicle({ data: id }).then((data) => {
      if (!data) {
        setError("Car not found");
        return;
      }
      setVehicle(data.vehicle);
      setShots(data.shots);
      setActive((cur) => cur || data.shots.find((s) => s.status === "empty")?.id || data.shots[0]?.id || "");
    });
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(`abw-plate:${id}`);
    if (stored) {
      putUpload(`${id}:vin`, stored);
      sessionStorage.removeItem(`abw-plate:${id}`);
      void patchShot({ data: { id: `${id}:vin`, status: "ready", confidence: 90, flagged: false } }).catch(() => undefined);
    }
    let live = true;
    getVehicle({ data: id })
      .then((data) => {
        if (!live || !data) {
          if (live) setError("Car not found");
          return;
        }
        setVehicle(data.vehicle);
        setShots(data.shots);
        setActive(data.shots.find((s) => s.status === "empty")?.id || data.shots[0]?.id || "");
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Load failed");
      });
    return () => {
      live = false;
    };
  }, [id]);

  const shot = shots.find((s) => s.id === active);
  const def = shot ? SHOT_BY_KEY[shot.shot_key as ShotKey] : undefined;
  const sample = vehicle && shot ? mediaFor(vehicle.catalog_key, shot.shot_key) : null;
  const taken = shot ? getUpload(shot.id) : null;

  async function take(file: File | null, useSample: boolean) {
    if (!shot) return;
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      putUpload(shot.id, dataUrl);
      const body = new FormData();
      body.set("shotId", shot.id);
      body.set("vehicleId", id);
      body.set("file", file, file.name || "shot.jpg");
      void fetch("/api/studio/upload", { method: "POST", body }).catch(() => undefined);
    } else if (!useSample || !sample) {
      return;
    }
    await patchShot({
      data: {
        id: shot.id,
        status: "ready",
        confidence: file ? 58 : shot.confidence < 100 ? shot.confidence : 90,
        flagged: Boolean(file),
      },
    });
    await reload();
  }

  async function process() {
    if (!vehicle) return;
    setProcessing(true);
    setStep(0);
    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 450));
    }
    await setVehicleStatus({ data: { id: vehicle.id, status: "review" } });
    await navigate({ to: "/review/$vehicleId", params: { vehicleId: vehicle.id } });
  }

  if (error) return <p className="text-sm text-primary">{error}</p>;
  if (!vehicle || !shot || !def) return <p className="text-sm text-muted">Loading shot list…</p>;

  const captured = shots.filter((s) => s.status !== "empty").length;

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        <p className="font-display text-sm tracking-widest text-muted">STEP 2</p>
        <h1 className="font-display text-3xl leading-none">
          {vehicle.year} {vehicle.make}
        </h1>
        <p className="text-sm text-muted">
          {captured}/{shots.length} captured · stock {vehicle.stock}
        </p>
        <ol className="max-h-[50vh] space-y-1 overflow-auto">
          {shots.map((s, i) => {
            const meta = SHOT_BY_KEY[s.shot_key as ShotKey];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("ring-2", "ring-primary");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("ring-2", "ring-primary");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-primary");
                    const file = e.dataTransfer.files?.[0] ?? null;
                    if (file && file.type.startsWith("image/")) {
                      setActive(s.id);
                      void take(file, false);
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${s.id === active ? "bg-ink text-primary-fg" : "bg-surface"}`}
                >
                  <span>
                    {i + 1}. {meta?.label}
                  </span>
                  <span className="text-xs">{s.status === "empty" ? "—" : "in"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
      <section className="space-y-4">
        <div
          className="relative overflow-hidden rounded-lg bg-ink text-primary-fg"
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
            if (file && file.type.startsWith("image/")) void take(file, false);
          }}
        >
          {taken || sample?.lot ? (
            <img src={taken || sample?.lot} alt="" className="shot-frame w-full object-cover opacity-80" />
          ) : (
            <div className="shot-frame w-full bg-ink" />
          )}
          <div className="absolute inset-0 text-primary-fg">
            <Wireframe guide={def.guide as Guide} />
          </div>
          <p className="absolute bottom-3 left-3 font-display text-2xl">{def.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg bg-primary px-4 py-3 text-sm text-primary-fg">
            Camera or drop
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                void take(file, false);
              }}
            />
          </label>
          {sample && (
            <button type="button" onClick={() => void take(null, true)} className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
              Use lot sample
            </button>
          )}
          <button type="button" onClick={() => void process()} className="rounded-lg bg-ink px-4 py-3 text-sm text-primary-fg">
            Process car
          </button>
          <Link to="/review/$vehicleId" params={{ vehicleId: vehicle.id }} className="rounded-lg border border-line px-4 py-3 text-sm">
            Skip to review
          </Link>
        </div>
        <p className="text-sm text-muted">Drop a photo on the frame or any shot in the list. Original stays forever.</p>
      </section>
      {processing && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-ink/80 px-4 text-primary-fg">
          <div className="w-full max-w-sm space-y-3">
            <p className="font-display text-3xl">Working</p>
            <ol className="space-y-2 text-sm">
              {STEPS.map((label, i) => (
                <li key={label} className={i <= step ? "text-primary-fg" : "text-primary-fg/50"}>
                  {i < step ? "Done" : i === step ? "Now" : "Wait"} — {label}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
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
