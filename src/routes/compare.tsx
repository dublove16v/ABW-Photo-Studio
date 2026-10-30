import { createFileRoute } from "@tanstack/react-router";
import { Guard } from "@/components/shell";

export const Route = createFileRoute("/compare")({ component: ComparePage });

const PAIRS = [
  { name: "2019 Honda CR-V", stock: "A4418", original: "/fleet/crv-lot.jpg", vendor: "/fleet/crv-ref.jpg", abw: "/fleet/crv-studio.jpg" },
  { name: "2018 Toyota Camry", stock: "B2201", original: "/fleet/sedan-lot.jpg", vendor: "", abw: "/fleet/sedan-studio.jpg" },
  { name: "2018 Ford F-150", stock: "C1184", original: "/fleet/truck-lot.jpg", vendor: "", abw: "/fleet/truck-outdoor.jpg" },
];

function ComparePage() {
  return (
    <Guard>
      <div className="space-y-5">
        <div>
          <p className="font-display text-sm tracking-widest text-muted">TEST MODE</p>
          <h1 className="font-display text-4xl leading-none">Vendor vs ABW</h1>
        </div>
        <div className="space-y-6">
          {PAIRS.map((car) => (
            <article key={car.stock} className="space-y-2">
              <h2 className="font-display text-2xl">{car.name} <span className="text-muted">{car.stock}</span></h2>
              <div className="grid gap-3 md:grid-cols-3">
                <Pane label="Original" src={car.original} />
                {car.vendor ? <Pane label="Vendor export" src={car.vendor} /> : <Empty label="Vendor export" />}
                <Pane label="ABW" src={car.abw} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </Guard>
  );
}

function Pane({ label, src }: { label: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface">
      <figcaption className="px-3 py-2 text-xs tracking-wide text-muted">{label}</figcaption>
      <img src={src} alt={label} className="shot-frame w-full object-cover" />
    </figure>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-dashed border-line bg-surface">
      <figcaption className="px-3 py-2 text-xs tracking-wide text-muted">{label}</figcaption>
      <div className="shot-frame grid place-items-center px-4 text-center text-sm text-muted">No vendor file for this stock</div>
    </figure>
  );
}
