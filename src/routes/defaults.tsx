import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Guard } from "@/components/shell";
import { SHOTS, modeLabel, type Mode } from "@/lib/studio/catalog";
import { getDefaults, setDefault } from "@/lib/studio/server";

export const Route = createFileRoute("/defaults")({ component: DefaultsPage });

function DefaultsPage() {
  return (
    <Guard>
      <Defaults />
    </Guard>
  );
}

function Defaults() {
  const [modes, setModes] = useState<Record<string, Mode>>({});

  useEffect(() => {
    let live = true;
    getDefaults()
      .then((rows) => {
        if (!live) return;
        const next: Record<string, Mode> = {};
        for (const row of rows) next[row.shot_key] = row.mode as Mode;
        setModes(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function choose(shotKey: string, mode: Mode) {
    setModes((cur) => ({ ...cur, [shotKey]: mode }));
    await setDefault({ data: { shotKey, mode } });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm tracking-widest text-muted">PER SHOT TYPE</p>
        <h1 className="font-display text-4xl leading-none">Defaults</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">New cars pick these modes. A reviewer can still change one photo and re-run it.</p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {SHOTS.map((shot) => (
          <li key={shot.key} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{shot.label}</p>
              <p className="text-xs uppercase tracking-widest text-muted">{shot.group}</p>
            </div>
            <div className="flex gap-1">
              {(["swap_all", "windows", "keep"] as Mode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void choose(shot.key, mode)}
                  className={`rounded-lg px-2 py-2 text-xs ${modes[shot.key] === mode ? "bg-primary text-primary-fg" : "border border-line"}`}
                >
                  {modeLabel(mode)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
