export type Mode = "swap_all" | "windows" | "keep";

export type Guide =
  | "vin"
  | "front34"
  | "front"
  | "rear"
  | "side"
  | "wheel"
  | "door"
  | "dash"
  | "seats"
  | "cargo"
  | "odo";

export type ShotKey =
  | "vin"
  | "front_34_l"
  | "front_34_r"
  | "front"
  | "rear"
  | "side_d"
  | "side_p"
  | "wheel"
  | "door"
  | "dash"
  | "front_seats"
  | "rear_seats"
  | "third"
  | "cargo"
  | "odo";

export type ShotDef = {
  key: ShotKey;
  label: string;
  group: "id" | "exterior" | "interior";
  defaultMode: Mode;
  guide: Guide;
};

export const SHOTS: ShotDef[] = [
  { key: "vin", label: "VIN plate", group: "id", defaultMode: "keep", guide: "vin" },
  { key: "front_34_l", label: "Front 3/4 left", group: "exterior", defaultMode: "swap_all", guide: "front34" },
  { key: "front_34_r", label: "Front 3/4 right", group: "exterior", defaultMode: "swap_all", guide: "front34" },
  { key: "front", label: "Front", group: "exterior", defaultMode: "swap_all", guide: "front" },
  { key: "rear", label: "Rear", group: "exterior", defaultMode: "swap_all", guide: "rear" },
  { key: "side_d", label: "Driver side", group: "exterior", defaultMode: "swap_all", guide: "side" },
  { key: "side_p", label: "Passenger side", group: "exterior", defaultMode: "swap_all", guide: "side" },
  { key: "wheel", label: "Wheel", group: "exterior", defaultMode: "swap_all", guide: "wheel" },
  { key: "door", label: "Open door", group: "interior", defaultMode: "windows", guide: "door" },
  { key: "dash", label: "Dash", group: "interior", defaultMode: "windows", guide: "dash" },
  { key: "front_seats", label: "Front seats", group: "interior", defaultMode: "windows", guide: "seats" },
  { key: "rear_seats", label: "Rear seats", group: "interior", defaultMode: "windows", guide: "seats" },
  { key: "third", label: "3rd row", group: "interior", defaultMode: "keep", guide: "seats" },
  { key: "cargo", label: "Cargo", group: "interior", defaultMode: "windows", guide: "cargo" },
  { key: "odo", label: "Odometer", group: "interior", defaultMode: "keep", guide: "odo" },
];

export const SHOT_BY_KEY = Object.fromEntries(SHOTS.map((s) => [s.key, s])) as Record<ShotKey, ShotDef>;

export const PLATES = {
  studio: "/fleet/plate-studio.jpg",
  outdoor: "/fleet/plate-outdoor.jpg",
  storefront: "/fleet/plate-storefront.jpg",
} as const;

export function plateFor(backdrop: string) {
  if (backdrop === "outdoor") return PLATES.outdoor;
  if (backdrop === "storefront") return PLATES.storefront;
  return PLATES.studio;
}

export function modeLabel(mode: Mode) {
  if (mode === "swap_all") return "Swap all";
  if (mode === "windows") return "Windows only";
  return "Keep original";
}
