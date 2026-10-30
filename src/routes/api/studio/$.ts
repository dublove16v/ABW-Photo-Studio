import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { plateFor } from "@/lib/studio/catalog";
import { getPhoto, publicUrl, putPhoto } from "@/lib/studio/storage";

export const Route = createFileRoute("/api/studio/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  const tail = url.pathname.split("/api/studio/")[1] || "";
  if (tail.startsWith("asset")) return serveAsset(url);
  if (tail.startsWith("jobs")) return jobs(request);
  if (tail.startsWith("upload")) return upload(request);
  if (tail.startsWith("cutout")) return cutout(request);
  return Response.json({ error: "Not found" }, { status: 404 });
}

function workerOk(request: Request) {
  const secret = process.env.WORKER_SECRET || "abw-worker";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function serveAsset(url: URL) {
  const key = url.searchParams.get("key") || "";
  if (!key || key.includes("..")) return new Response("Bad key", { status: 400 });
  const bytes = await getPhoto(key);
  if (!bytes) return new Response("Missing", { status: 404 });
  const type = key.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
}

async function jobs(request: Request) {
  if (!workerOk(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sql = await getSql();
  if (request.method === "GET") {
    const rows = await sql<{
      id: string;
      shot_id: string;
      vehicle_id: string;
      content_hash: string;
      backdrop: string;
      mode: string;
      original_key: string;
    }>`select j.id, j.shot_id, j.vehicle_id, j.content_hash, j.backdrop, j.mode, a.original_key
      from photo_jobs j
      join photo_assets a on a.shot_id = j.shot_id
      where j.status = 'queued'
      order by j.created_at asc
      limit 1`;
    const job = rows[0];
    if (!job) return Response.json({ job: null });
    await sql`update photo_jobs set status = 'running', started_at = now() where id = ${job.id}`;
    const origin = new URL(request.url).origin;
    return Response.json({
      job: {
        id: job.id,
        shotId: job.shot_id,
        mode: job.mode,
        originalUrl: `${origin}${publicUrl(job.original_key)}`,
        plateUrl: `${origin}${plateFor(job.backdrop)}`,
      },
    });
  }
  const body = (await request.json()) as { id?: string; listing?: string; confidence?: number; error?: string };
  if (!body.id) return Response.json({ error: "Missing id" }, { status: 400 });
  if (body.error) {
    await sql`update photo_jobs set status = 'failed', finished_at = now() where id = ${body.id}`;
    return Response.json({ ok: false });
  }
  const rows = await sql<{ shot_id: string; vehicle_id: string; user_id: string }>`select shot_id, vehicle_id, user_id from photo_jobs where id = ${body.id}`;
  const job = rows[0];
  if (!job) return Response.json({ error: "Missing job" }, { status: 404 });
  const listingKey = `listing/${job.vehicle_id}/${job.shot_id}.webp`;
  if (body.listing) {
    await putPhoto(listingKey, Buffer.from(body.listing, "base64"), "image/webp");
    await sql`update photo_assets set listing_key = ${listingKey} where shot_id = ${job.shot_id}`;
  }
  await sql`update photo_jobs set status = 'done', finished_at = now() where id = ${body.id}`;
  await sql`update shots set status = 'ready', confidence = ${body.confidence ?? 80}, flagged = ${(body.confidence ?? 80) < 75}
    where id = ${job.shot_id}`;
  return Response.json({ ok: true, listing: publicUrl(listingKey) });
}

async function upload(request: Request) {
  if (request.method !== "POST") return new Response("Method", { status: 405 });
  const form = await request.formData();
  const shotId = String(form.get("shotId") || "");
  const vehicleId = String(form.get("vehicleId") || "");
  const file = form.get("file");
  if (!shotId || !vehicleId || !(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `originals/${vehicleId}/${shotId}.jpg`;
  const stored = await putPhoto(key, bytes, file.type || "image/jpeg");
  const sql = await getSql();
  const existing = await sql<{ content_hash: string }>`select content_hash from photo_assets where shot_id = ${shotId}`;
  if (existing[0]?.content_hash === stored.hash) return Response.json({ ok: true, skipped: true, url: stored.url });
  await sql`insert into photo_assets (shot_id, vehicle_id, user_id, content_hash, original_key, bytes)
    values (${shotId}, ${vehicleId}, ${"worker"}, ${stored.hash}, ${key}, ${stored.bytes})
    on conflict (shot_id) do update set content_hash = ${stored.hash}, original_key = ${key}, bytes = ${stored.bytes}`;
  const jobId = `job_${crypto.randomUUID()}`;
  await sql`insert into photo_jobs (id, shot_id, vehicle_id, user_id, content_hash, backdrop, mode, status)
    values (${jobId}, ${shotId}, ${vehicleId}, ${"worker"}, ${stored.hash}, ${"studio"}, ${"swap_all"}, ${"queued"})`;
  return Response.json({ ok: true, url: stored.url, jobId });
}

async function cutout(request: Request) {
  if (request.method !== "POST") return new Response("Method", { status: 405 });
  const form = await request.formData();
  const file = form.get("file");
  const plate = String(form.get("plate") || "");
  if (!(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400 });
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");
  const dir = await mkdtemp(path.join(tmpdir(), "abw-cut-"));
  const input = path.join(dir, "in.jpg");
  const output = path.join(dir, "out.jpg");
  const platePath = path.join(dir, "plate.jpg");
  try {
    await writeFile(input, Buffer.from(await file.arrayBuffer()));
    if (plate.startsWith("/fleet/")) {
      const publicPath = path.join(process.cwd(), "public", plate);
      try {
        await writeFile(platePath, await readFile(publicPath));
      } catch {
        // plate optional
      }
    }
    const args = [path.join(process.cwd(), "scripts", "cutout_one.py"), input, output];
    if (plate.startsWith("/fleet/")) args.push(platePath);
    const code = await new Promise<number>((resolve) => {
      const child = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
      child.on("close", (c) => resolve(c ?? 1));
      child.on("error", () => resolve(1));
    });
    if (code !== 0) return Response.json({ error: "Cutout failed" }, { status: 500 });
    const bytes = await readFile(output);
    return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
