import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEMOS, SHOTS, type Mode, type ShotKey } from "@/lib/studio/catalog";

export type VehicleRow = {
  id: string;
  catalog_key: string;
  vin: string;
  stock: string;
  year: number;
  make: string;
  model: string;
  color: string;
  status: string;
  backdrop: string;
  created_at: string;
};

export type ShotRow = {
  id: string;
  vehicle_id: string;
  shot_key: string;
  sort_order: number;
  mode: string;
  status: string;
  confidence: number;
  flagged: boolean;
  approved: boolean;
};

function flag(value: boolean | number | string | null) {
  return value === true || value === 1 || value === "t" || value === "true";
}

export type VehicleCard = VehicleRow & {
  captured: number;
  approved: number;
  flagged: number;
  total: number;
};

async function ensureSeed(userId: string) {
  const sql = await getSql();
  for (const shot of SHOTS) {
    await sql`insert into shot_defaults (user_id, shot_key, mode)
      values (${userId}, ${shot.key}, ${shot.defaultMode})
      on conflict (user_id, shot_key) do nothing`;
  }
  const existing = await sql<{ n: number }>`select count(*)::int as n from vehicles where user_id = ${userId}`;
  if ((existing[0]?.n ?? 0) > 0) return;

  for (const demo of DEMOS) {
    const id = `${userId}:${demo.key}`;
    await sql`insert into vehicles
      (id, user_id, catalog_key, vin, stock, year, make, model, color, status, backdrop)
      values (${id}, ${userId}, ${demo.key}, ${demo.vin}, ${demo.stock}, ${demo.year}, ${demo.make}, ${demo.model}, ${demo.color}, ${demo.status}, ${demo.backdrop})
      on conflict (id) do nothing`;
    for (let i = 0; i < SHOTS.length; i++) {
      const def = SHOTS[i]!;
      const filled = demo.shots[def.key as ShotKey];
      const mode = filled?.mode ?? def.defaultMode;
      const status = filled ? "ready" : "empty";
      const confidence = filled?.confidence ?? 100;
      const flagged = filled?.flagged ?? false;
      await sql`insert into shots
        (id, vehicle_id, user_id, shot_key, sort_order, mode, status, confidence, flagged, approved)
        values (${`${id}:${def.key}`}, ${id}, ${userId}, ${def.key}, ${i}, ${mode}, ${status}, ${confidence}, ${flagged}, false)
        on conflict (vehicle_id, shot_key) do nothing`;
    }
  }
  await sql`insert into delivery_settings (user_id, method, endpoint)
    values (${userId}, ${"url_feed"}, ${"https://feeds.example/vauto/abw"})
    on conflict (user_id) do nothing`;
}

export const listLot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<VehicleCard[]> => {
    await ensureSeed(context.userId);
    const sql = await getSql();
    const vehicles = await sql<VehicleRow>`select id, catalog_key, vin, stock, year, make, model, color, status, backdrop, created_at::text as created_at
      from vehicles where user_id = ${context.userId} order by created_at asc`;
    const shots = await sql<{ vehicle_id: string; status: string; approved: boolean; flagged: boolean }>`
      select vehicle_id, status, approved, flagged from shots where user_id = ${context.userId}`;
    return vehicles.map((v) => {
      const mine = shots.filter((s) => s.vehicle_id === v.id);
      return {
        ...v,
        total: mine.length,
        captured: mine.filter((s) => s.status !== "empty").length,
        approved: mine.filter((s) => flag(s.approved)).length,
        flagged: mine.filter((s) => flag(s.flagged) && !flag(s.approved)).length,
      };
    });
  });

export const getVehicle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }): Promise<{ vehicle: VehicleRow; shots: ShotRow[] } | null> => {
    await ensureSeed(context.userId);
    const sql = await getSql();
    const vehicles = await sql<VehicleRow>`select id, catalog_key, vin, stock, year, make, model, color, status, backdrop, created_at::text as created_at
      from vehicles where id = ${id} and user_id = ${context.userId}`;
    const vehicle = vehicles[0];
    if (!vehicle) return null;
    const shots = await sql<ShotRow>`select id, vehicle_id, shot_key, sort_order, mode, status, confidence, flagged, approved
      from shots where vehicle_id = ${id} and user_id = ${context.userId} order by sort_order asc`;
    return {
      vehicle,
      shots: shots.map((s) => ({ ...s, flagged: flag(s.flagged), approved: flag(s.approved), confidence: Number(s.confidence), sort_order: Number(s.sort_order) })),
    };
  });

export const readPlateImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((images: string[]) => images.filter((src) => src.startsWith("data:image/")).slice(0, 4))
  .handler(async ({ data: images }) => {
    if (images.length === 0) return { ok: false as const, vin: "", message: "No plate image." };
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const texts: string[] = [];
      for (const image of images) {
        const { data } = await worker.recognize(image);
        texts.push(data.text ?? "");
        const labeled = vinAfterLabel(data.text ?? "");
        if (labeled) return { ok: true as const, vin: labeled };
      }
      const vin = pickVin(texts.join("\n"));
      if (vin) return { ok: true as const, vin };
      return { ok: false as const, vin: "", message: "Couldn't read a VIN from that plate. Type it in." };
    } catch {
      return { ok: false as const, vin: "", message: "Plate reader failed. Type the VIN." };
    } finally {
      await worker.terminate();
    }
  });

function vinAfterLabel(text: string) {
  const flat = text.toUpperCase().replace(/[^A-Z0-9]/g, " ");
  const labeled = flat.match(/VIN\s*([A-HJ-NPR-Z0-9]{11,17})/);
  const raw = labeled?.[1] ?? "";
  return raw.length === 17 ? raw : "";
}

function pickVin(text: string) {
  const labeled = vinAfterLabel(text);
  if (labeled) return labeled;
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const windows: string[] = [];
  for (let i = 0; i + 17 <= cleaned.length; i++) {
    const slice = cleaned.slice(i, i + 17);
    if (/[A-HJ-NPR-Z0-9]{17}/.test(slice) && /[A-Z]/.test(slice) && /\d/.test(slice)) windows.push(slice);
  }
  return windows.find(validVin) ?? "";
}

function validVin(vin: string) {
  const map = "0123456789.ABCDEFGH..JKLMN.P.R..STUVWXYZ";
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = map.indexOf(vin[i]!);
    if (value < 0) return false;
    sum += value * weights[i]!;
  }
  const check = sum % 11;
  return vin[8] === (check === 10 ? "X" : String(check));
}

export const decodeVin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((vin: string) => vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))
  .handler(async ({ data: vin }) => {
    if (vin.length < 11) return { ok: false as const, vin, message: "VIN is too short." };
    const known = DEMOS.find((d) => d.vin === vin);
    if (known) {
      return {
        ok: true as const,
        vin,
        year: known.year,
        make: known.make,
        model: known.model,
        trim: "",
        color: known.color,
        stock: known.stock,
      };
    }
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
      if (!res.ok) return { ok: false as const, vin, message: "VIN decode is unavailable." };
      const body = (await res.json()) as { Results?: Array<Record<string, string>> };
      const row = body.Results?.[0];
      const make = titleCase(row?.Make ?? "");
      const model = titleCase(row?.Model ?? "");
      const year = Number(row?.ModelYear) || 0;
      if (!make && !model) return { ok: false as const, vin, message: "That VIN did not decode." };
      return {
        ok: true as const,
        vin,
        year,
        make,
        model: [model, titleCase(row?.Trim ?? "")].filter(Boolean).join(" "),
        trim: titleCase(row?.Trim ?? ""),
        color: "",
        stock: "",
      };
    } catch {
      return { ok: false as const, vin, message: "VIN decode failed." };
    }
  });

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const createVehicle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { vin: string; stock: string; year: number; make: string; model: string; color: string }) => ({
    vin: input.vin.trim().toUpperCase(),
    stock: input.stock.trim().toUpperCase(),
    year: Number(input.year) || new Date().getFullYear(),
    make: input.make.trim(),
    model: input.model.trim(),
    color: input.color.trim(),
  }))
  .handler(async ({ context, data }) => {
    if (data.vin.length < 11) {
      throw new Error("Enter a VIN of at least 11 characters.");
    }
    const make = data.make || "Unknown";
    const model = data.model || "Vehicle";
    await ensureSeed(context.userId);
    const sql = await getSql();
    const id = `v_${crypto.randomUUID()}`;
    await sql`insert into vehicles (id, user_id, catalog_key, vin, stock, year, make, model, color, status, backdrop)
      values (${id}, ${context.userId}, ${""}, ${data.vin}, ${data.stock || "NEW"}, ${data.year}, ${make}, ${model}, ${data.color}, ${"capture"}, ${"studio"})`;
    const defaults = await sql<{ shot_key: string; mode: string }>`select shot_key, mode from shot_defaults where user_id = ${context.userId}`;
    const modeFor = new Map(defaults.map((d) => [d.shot_key, d.mode]));
    const values = SHOTS.map((def, i) => ({
      id: `${id}:${def.key}`,
      key: def.key,
      order: i,
      mode: modeFor.get(def.key) ?? def.defaultMode,
    }));
    for (const shot of values) {
      await sql`insert into shots (id, vehicle_id, user_id, shot_key, sort_order, mode, status, confidence, flagged, approved)
        values (${shot.id}, ${id}, ${context.userId}, ${shot.key}, ${shot.order}, ${shot.mode}, ${"empty"}, 100, false, false)`;
    }
    return { id };
  });

export const patchShot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; mode?: Mode; approved?: boolean; flagged?: boolean; status?: string; confidence?: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<ShotRow>`select id, vehicle_id, shot_key, sort_order, mode, status, confidence, flagged, approved
      from shots where id = ${data.id} and user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) throw new Error("Shot not found");
    const mode = data.mode ?? row.mode;
    const approved = data.approved ?? row.approved;
    const flagged = data.flagged ?? row.flagged;
    const status = data.status ?? (approved ? "approved" : row.status);
    const confidence = data.confidence ?? row.confidence;
    await sql`update shots set mode = ${mode}, approved = ${approved}, flagged = ${flagged}, status = ${status}, confidence = ${confidence}
      where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const setBackdrop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; backdrop: "studio" | "outdoor" | "storefront" }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update vehicles set backdrop = ${data.backdrop} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const setVehicleStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update vehicles set status = ${data.status} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const approveAll = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`update shots set approved = true, status = 'approved'
      where vehicle_id = ${id} and user_id = ${context.userId} and status <> 'empty'`;
    await sql`update vehicles set status = 'approved' where id = ${id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const markDelivered = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const ready = await sql<{ n: number }>`select count(*)::int as n from shots
      where vehicle_id = ${id} and user_id = ${context.userId} and approved = true`;
    if ((ready[0]?.n ?? 0) === 0) throw new Error("Approve at least one photo first.");
    await sql`update vehicles set status = 'delivered' where id = ${id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const getDefaults = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureSeed(context.userId);
    const sql = await getSql();
    return sql<{ shot_key: string; mode: string }>`select shot_key, mode from shot_defaults where user_id = ${context.userId}`;
  });

export const setDefault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { shotKey: string; mode: Mode }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`insert into shot_defaults (user_id, shot_key, mode) values (${context.userId}, ${data.shotKey}, ${data.mode})
      on conflict (user_id, shot_key) do update set mode = ${data.mode}`;
    return { ok: true };
  });

export const getDelivery = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureSeed(context.userId);
    const sql = await getSql();
    const rows = await sql<{ method: string; endpoint: string }>`select method, endpoint from delivery_settings where user_id = ${context.userId}`;
    return rows[0] ?? { method: "url_feed", endpoint: "" };
  });

export const setDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { method: string; endpoint: string }) => input)
  .handler(async ({ context, data }) => {
    const method = data.method === "sftp" ? "sftp" : "url_feed";
    const sql = await getSql();
    await sql`insert into delivery_settings (user_id, method, endpoint) values (${context.userId}, ${method}, ${data.endpoint})
      on conflict (user_id) do update set method = ${method}, endpoint = ${data.endpoint}`;
    return { ok: true };
  });
