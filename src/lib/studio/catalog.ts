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

export type Region = {
  id: string;
  label: string;
  kind: "rect" | "outside";
  x: number;
  y: number;
  w: number;
  h: number;
};

const GLASS: Region[] = [
  { id: "windshield", label: "Windshield", kind: "rect", x: 0.28, y: 0.16, w: 0.46, h: 0.26 },
  { id: "sideglass", label: "Side glass", kind: "rect", x: 0.04, y: 0.14, w: 0.2, h: 0.36 },
];

const EXTERIOR: Region[] = [
  { id: "windshield", label: "Windshield", kind: "rect", x: 0.4, y: 0.3, w: 0.18, h: 0.15 },
  { id: "sideglass", label: "Side glass", kind: "rect", x: 0.56, y: 0.32, w: 0.15, h: 0.13 },
  { id: "background", label: "Background", kind: "outside", x: 0.14, y: 0.2, w: 0.74, h: 0.66 },
];

export function regionsFor(guide: Guide): Region[] {
  if (guide === "dash" || guide === "seats" || guide === "door" || guide === "cargo") return GLASS;
  if (guide === "vin" || guide === "odo" || guide === "wheel") return [];
  return EXTERIOR;
}

export function defaultRegionIds(mode: Mode, guide: Guide): string[] {
  const regions = regionsFor(guide);
  if (mode === "windows") return regions.filter((r) => r.kind === "rect").map((r) => r.id);
  if (mode === "swap_all") return regions.filter((r) => r.id === "background").map((r) => r.id);
  return [];
}

export type Media = {
  lot: string;
  studio?: string;
  outdoor?: string;
  ref?: string;
};

const CRV_EXT: Media = {
  lot: "/fleet/crv-lot.jpg",
  studio: "/fleet/crv-studio.jpg",
  outdoor: "/fleet/crv-outdoor.jpg",
  ref: "/fleet/crv-ref.jpg",
};
const SEDAN_EXT: Media = {
  lot: "/fleet/sedan-lot.jpg",
  studio: "/fleet/sedan-studio.jpg",
  outdoor: "/fleet/sedan-outdoor.jpg",
};
const TRUCK_EXT: Media = {
  lot: "/fleet/truck-lot.jpg",
  studio: "/fleet/truck-studio.jpg",
  outdoor: "/fleet/truck-outdoor.jpg",
};

export const MEDIA: Record<string, Partial<Record<ShotKey, Media>>> = {
  crv: {
    vin: { lot: "/fleet/vin.jpg" },
    front_34_l: CRV_EXT,
    dash: { lot: "/fleet/dash-lot.jpg", studio: "/fleet/dash-glass.jpg", outdoor: "/fleet/dash-glass.jpg" },
    front_seats: { lot: "/fleet/seats.jpg", studio: "/fleet/plate-outdoor.jpg", outdoor: "/fleet/plate-outdoor.jpg" },
  },
  sedan: { front_34_l: SEDAN_EXT },
  truck: { front_34_l: TRUCK_EXT },
};

export function mediaFor(catalogKey: string, shotKey: string): Media | null {
  const set = MEDIA[catalogKey];
  if (!set) return null;
  return set[shotKey as ShotKey] ?? null;
}

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

export function editedSrc(media: Media | null, backdrop: string): string | null {
  if (!media) return null;
  if (backdrop === "outdoor") return media.outdoor ?? media.studio ?? null;
  return media.studio ?? media.outdoor ?? null;
}

export type DemoCar = {
  key: string;
  vin: string;
  stock: string;
  year: number;
  make: string;
  model: string;
  color: string;
  status: string;
  backdrop: string;
  shots: Partial<Record<ShotKey, { confidence: number; flagged: boolean; mode?: Mode }>>;
};

export const DEMOS: DemoCar[] = [
  {
    key: "crv",
    vin: "5J6RW2H86KL804418",
    stock: "A4418",
    year: 2019,
    make: "Honda",
    model: "CR-V EX",
    color: "Silver",
    status: "review",
    backdrop: "studio",
    shots: {
      vin: { confidence: 99, flagged: false, mode: "keep" },
      front_34_l: { confidence: 93, flagged: false },
      dash: { confidence: 64, flagged: true, mode: "windows" },
      front_seats: { confidence: 82, flagged: false, mode: "windows" },
    },
  },
  {
    key: "sedan",
    vin: "4T1B11HK5JU612201",
    stock: "B2201",
    year: 2018,
    make: "Toyota",
    model: "Camry SE",
    color: "Navy",
    status: "review",
    backdrop: "studio",
    shots: {
      front_34_l: { confidence: 71, flagged: true },
    },
  },
  {
    key: "truck",
    vin: "1FTEW1EP5JKC31184",
    stock: "C1184",
    year: 2018,
    make: "Ford",
    model: "F-150 XLT",
    color: "White",
    status: "capture",
    backdrop: "outdoor",
    shots: {
      front_34_l: { confidence: 88, flagged: false },
    },
  },
];

export const BOOK = Object.fromEntries(DEMOS.map((d) => [d.vin, d]));

export function modeLabel(mode: Mode) {
  if (mode === "swap_all") return "Swap all";
  if (mode === "windows") return "Windows only";
  return "Keep original";
}
