import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Guard } from "@/components/shell";
import { SHOTS } from "@/lib/studio/catalog";
import { editedSrc, mediaFor } from "@/lib/studio/catalog";
import { getDelivery, getVehicle, listLot, markDelivered, setDelivery, type VehicleCard } from "@/lib/studio/server";

export const Route = createFileRoute("/delivery")({ component: DeliveryPage });

type FeedCar = {
  vin: string;
  stock: string;
  id: string;
  status: string;
  photos: { order: number; shot: string; url: string }[];
};

function DeliveryPage() {
  return (
    <Guard>
      <Delivery />
    </Guard>
  );
}

function Delivery() {
  const [method, setMethod] = useState("url_feed");
  const [endpoint, setEndpoint] = useState("");
  const [cars, setCars] = useState<VehicleCard[]>([]);
  const [feed, setFeed] = useState<FeedCar[] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getDelivery(), listLot()])
      .then(([settings, lot]) => {
        if (!live) return;
        setMethod(settings.method);
        setEndpoint(settings.endpoint);
        setCars(lot);
      })
      .catch(() => {
        if (live) setNote("Could not load delivery settings.");
      });
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    await setDelivery({ data: { method, endpoint } });
    setNote("Saved.");
  }

  async function build() {
    const built: FeedCar[] = [];
    for (const car of cars) {
      const detail = await getVehicle({ data: car.id });
      if (!detail) continue;
      const order = SHOTS.map((s) => s.key);
      const photos = detail.shots
        .filter((s) => s.approved)
        .sort((a, b) => order.indexOf(a.shot_key as (typeof order)[number]) - order.indexOf(b.shot_key as (typeof order)[number]))
        .map((s, i) => {
          const media = mediaFor(car.catalog_key, s.shot_key);
          const url = editedSrc(media, car.backdrop) ?? media?.lot ?? "";
          return { order: i + 1, shot: s.shot_key, url };
        });
      built.push({ vin: car.vin, stock: car.stock, id: car.id, status: car.status, photos });
    }
    setFeed(built);
  }

  async function send(id: string) {
    try {
      await markDelivered({ data: id });
      setNote("Marked delivered. A live shop would push this manifest over the saved method.");
      const lot = await listLot();
      setCars(lot);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Not sent");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm tracking-widest text-muted">VAUTO</p>
        <h1 className="font-display text-4xl leading-none">Delivery</h1>
      </div>
      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 md:grid-cols-2">
        <label className="text-sm">
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-3">
            <option value="url_feed">Photo URL feed</option>
            <option value="sftp">SFTP</option>
          </select>
        </label>
        <label className="text-sm">
          Endpoint
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-3" />
        </label>
        <button type="button" onClick={() => void save()} className="rounded-lg bg-ink px-4 py-3 text-sm text-primary-fg md:col-span-2">
          Save method
        </button>
      </div>
      <button type="button" onClick={() => void build()} className="rounded-lg bg-primary px-4 py-3 text-sm text-primary-fg">
        Build feed from approved shots
      </button>
      {note && <p className="text-sm text-muted">{note}</p>}
      {feed && (
        <div className="space-y-4">
          {feed.map((car) => (
            <article key={car.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl">
                  {car.stock} · {car.vin}
                </h2>
                <button type="button" onClick={() => void send(car.id)} className="rounded-lg border border-ink px-3 py-2 text-sm">
                  {car.status === "delivered" ? "Sent" : "Send"}
                </button>
              </div>
              {car.photos.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing approved yet.</p>
              ) : (
                <ol className="mt-2 space-y-1 text-sm">
                  {car.photos.map((p) => (
                    <li key={p.shot}>
                      {p.order}. {p.shot} — {p.url || "device upload, no public URL yet"}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
          <pre className="overflow-auto rounded-lg bg-ink p-4 text-xs text-primary-fg">{JSON.stringify({ method, endpoint, vehicles: feed }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
