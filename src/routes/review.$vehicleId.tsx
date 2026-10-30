import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ReviewStage } from "@/components/review-stage";
import { Guard } from "@/components/shell";
import { SHOT_BY_KEY, type Mode, type ShotKey } from "@/lib/studio/catalog";
import { approveAll, getVehicle, patchShot, setBackdrop, type ShotRow, type VehicleRow } from "@/lib/studio/server";

export const Route = createFileRoute("/review/$vehicleId")({ component: ReviewPage });

function ReviewPage() {
  const { vehicleId } = Route.useParams();
  return (
    <Guard>
      <Review id={vehicleId} />
    </Guard>
  );
}

function pickShot(shots: ShotRow[], current = "") {
  if (current && shots.some((s) => s.id === current)) return current;
  return (
    shots.find((s) => s.shot_key === "front_34_l" && s.status !== "empty")?.id ||
    shots.find((s) => s.status !== "empty")?.id ||
    shots[0]?.id ||
    ""
  );
}

function Review({ id }: { id: string }) {
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [active, setActive] = useState("");
  const [error, setError] = useState("");

  function load() {
    return getVehicle({ data: id }).then((data) => {
      if (!data) {
        setError("Car not found");
        return;
      }
      setVehicle(data.vehicle);
      setShots(data.shots);
      setActive((cur) => pickShot(data.shots, cur));
    });
  }

  useEffect(() => {
    let live = true;
    getVehicle({ data: id })
      .then((data) => {
        if (!live) return;
        if (!data) {
          setError("Car not found");
          return;
        }
        setVehicle(data.vehicle);
        setShots(data.shots);
        setActive(pickShot(data.shots));
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Load failed");
      });
    return () => {
      live = false;
    };
  }, [id]);

  const shot = shots.find((s) => s.id === active);

  async function changeMode(mode: Mode) {
    if (!shot) return;
    await patchShot({ data: { id: shot.id, mode } });
    await load();
  }

  async function approve() {
    if (!shot) return;
    await patchShot({ data: { id: shot.id, approved: true, status: "approved", flagged: false } });
    await load();
  }

  async function approveEverything() {
    await approveAll({ data: id });
    await load();
  }

  async function backdrop(next: "studio" | "outdoor" | "storefront") {
    await setBackdrop({ data: { id, backdrop: next } });
    await load();
  }

  if (error) return <p className="text-sm text-primary">{error}</p>;
  if (!vehicle || !shot) return <p className="text-sm text-muted">Opening the gallery…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm tracking-widest text-muted">{vehicle.stock}</p>
          <h1 className="font-display text-4xl leading-none">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void backdrop("studio")} className={`rounded-lg px-3 py-2 text-sm ${vehicle.backdrop === "studio" ? "bg-ink text-primary-fg" : "border border-line bg-surface"}`}>
            Light studio
          </button>
          <button type="button" onClick={() => void backdrop("outdoor")} className={`rounded-lg px-3 py-2 text-sm ${vehicle.backdrop === "outdoor" ? "bg-ink text-primary-fg" : "border border-line bg-surface"}`}>
            Outdoor
          </button>
          <button type="button" onClick={() => void backdrop("storefront")} className={`rounded-lg px-3 py-2 text-sm ${vehicle.backdrop === "storefront" ? "bg-ink text-primary-fg" : "border border-line bg-surface"}`}>
            Storefront
          </button>
          <button type="button" onClick={() => void approveEverything()} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg">
            Approve all
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {shots.map((s) => {
          const meta = SHOT_BY_KEY[s.shot_key as ShotKey];
          return (
            <button
              key={s.id}
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
                  void (async () => {
                    const dataUrl = await fileToDataUrl(file);
                    const { putUpload } = await import("@/lib/studio/uploads");
                    putUpload(s.id, dataUrl);
                    const body = new FormData();
                    body.set("shotId", s.id);
                    body.set("vehicleId", vehicle.id);
                    body.set("file", file, file.name || "shot.jpg");
                    void fetch("/api/studio/upload", { method: "POST", body }).catch(() => undefined);
                    await patchShot({ data: { id: s.id, status: "ready", confidence: 58, flagged: true } });
                    setShots((cur) => cur.map((row) => (row.id === s.id ? { ...row, status: "ready", confidence: 58, flagged: true } : row)));
                  })();
                }
              }}
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-xs ${s.id === active ? "bg-ink text-primary-fg" : "border border-line bg-surface"}`}
            >
              <span className="block">{meta?.label}</span>
              <span className={`block ${s.id === active ? "text-primary-fg" : "text-muted"}`}>
                {s.status === "empty" ? "empty" : s.approved ? "approved" : s.flagged ? "flagged" : s.mode}
              </span>
            </button>
          );
        })}
      </div>
      <ReviewStage
        key={shot.id + vehicle.backdrop}
        vehicle={vehicle}
        shot={shot}
        onMode={(mode) => void changeMode(mode)}
        onApprove={() => void approve()}
        onReplace={async (file) => {
          const dataUrl = await fileToDataUrl(file);
          const { putUpload } = await import("@/lib/studio/uploads");
          putUpload(shot.id, dataUrl);
          const body = new FormData();
          body.set("shotId", shot.id);
          body.set("vehicleId", vehicle.id);
          body.set("file", file, file.name || "shot.jpg");
          void fetch("/api/studio/upload", { method: "POST", body }).catch(() => undefined);
          await patchShot({ data: { id: shot.id, status: "ready", confidence: 58, flagged: true } });
          setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, status: "ready", confidence: 58, flagged: true } : s)));
        }}
      />
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
