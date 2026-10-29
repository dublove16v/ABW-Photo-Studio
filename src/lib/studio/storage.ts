/**
 * Photo bytes live in Cloudflare R2. The database only stores keys.
 * Without R2 secrets (local preview) files land on disk under PHOTO_DIR.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PHOTO_DIR = process.env.PHOTO_DIR || "/workspace/data/photos";

export type StoredPhoto = {
  key: string;
  hash: string;
  bytes: number;
  url: string;
};

function r2Ready() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

export function photoHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export async function putPhoto(key: string, bytes: Buffer, contentType: string): Promise<StoredPhoto> {
  const hash = photoHash(bytes);
  if (r2Ready()) {
    await putR2(key, bytes, contentType);
  } else {
    const file = path.join(PHOTO_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  return { key, hash, bytes: bytes.length, url: publicUrl(key) };
}

export async function getPhoto(key: string): Promise<Buffer | null> {
  if (r2Ready()) return getR2(key);
  try {
    return await readFile(path.join(PHOTO_DIR, key));
  } catch {
    return null;
  }
}

export function publicUrl(key: string) {
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (base && r2Ready()) return `${base}/${key}`;
  return `/api/studio/asset?key=${encodeURIComponent(key)}`;
}

async function putR2(key: string, bytes: Buffer, contentType: string) {
  const url = r2Url(key);
  const res = await fetch(url, {
    method: "PUT",
    headers: await sign("PUT", url, contentType, bytes),
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`R2 put failed (${res.status})`);
}

async function getR2(key: string) {
  const url = r2Url(key);
  const res = await fetch(url, { headers: await sign("GET", url, "", Buffer.alloc(0)) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 get failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function r2Url(key: string) {
  const account = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

async function sign(method: string, url: string, contentType: string, body: Buffer) {
  const { AwsClient } = await import("aws4fetch");
  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    service: "s3",
    region: "auto",
  });
  const signed = await client.sign(url, {
    method,
    headers: contentType ? { "content-type": contentType } : {},
    body: method === "PUT" ? body : undefined,
  });
  return Object.fromEntries(signed.headers.entries());
}
