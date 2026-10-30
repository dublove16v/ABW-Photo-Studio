import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Guard } from "@/components/shell";
import { mediaFor } from "@/lib/studio/catalog";
import { listLot, type VehicleCard } from "@/lib/studio/server";

export const Route = createFileRoute("/")({ component: LotPage });

function LotPage() {
  return (
    <Guard>
      <Lot />
    </Guard>
  );
}

function Lot() {
  const [rows, setRows] = useState<VehicleCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listLot()
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Could not load the lot");
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1c1917]">The lot</h1>
          <p className="text-sm text-[#78716c]">Cars in review</p>
        </div>
        <Link to="/capture" className="rounded bg-[#7c3aed] px-3 py-1.5 text-sm text-white">
          New car
        </Link>
      </div>
      {error && <p className="text-sm text-primary">{error}</p>}
      {!rows && !error && <p className="text-sm text-muted">Loading cars…</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows?.map((car) => {
          const cover = mediaFor(car.catalog_key, "front_34_l")?.lot;
          return (
            <article key={car.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              {cover ? (
                <img src={cover} alt="" className="shot-frame w-full object-cover" />
              ) : (
                <div className="shot-frame flex items-center justify-center bg-bg text-sm text-muted">No hero yet</div>
              )}
              <div className="space-y-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl leading-none">
                    {car.year} {car.make} {car.model}
                  </h2>
                  <span className="text-xs tracking-wide text-muted">{car.stock}</span>
                </div>
                <p className="text-sm text-muted">
                  {car.captured}/{car.total} shots · {car.approved} approved
                  {car.flagged > 0 ? ` · ${car.flagged} flagged` : ""}
                </p>
                <p className="text-xs uppercase tracking-widest text-muted">{car.status}</p>
                <div className="flex gap-2">
                  <Link to="/review/$vehicleId" params={{ vehicleId: car.id }} className="rounded-lg bg-ink px-3 py-2 text-sm text-primary-fg">
                    Review
                  </Link>
                  <Link to="/capture/$vehicleId" params={{ vehicleId: car.id }} className="rounded-lg border border-line px-3 py-2 text-sm">
                    Capture
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
