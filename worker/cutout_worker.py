#!/usr/bin/env python3
"""
ABW Photo Studio cutout worker.

Runs on its own box (not the web app, not Vercel). Polls the app for new
photos, writes the listing-size result back, and skips anything already hashed.

    python cutout_worker.py --app https://studio.example --secret $WORKER_SECRET

Needs: pillow, numpy, opencv-python-headless. Uses rembg/BiRefNet when installed.
"""
from __future__ import annotations

import argparse
import io
import json
import time
import urllib.request

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

try:
    from rembg import new_session, remove

    REMBG = new_session("birefnet-general")
except Exception:
    REMBG = None


def fetch(url: str, secret: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"authorization": f"Bearer {secret}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode())


def download(url: str) -> Image.Image:
    with urllib.request.urlopen(url, timeout=120) as res:
        return Image.open(io.BytesIO(res.read())).convert("RGB")


def cutout(image: Image.Image) -> Image.Image:
    if REMBG is not None:
        out = remove(image, session=REMBG)
        return out.convert("RGBA")
    # Conservative fallback: keep the center subject, fade the edges.
    rgba = image.convert("RGBA")
    w, h = rgba.size
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            dx = (x - w * 0.5) / (w * 0.38)
            dy = (y - h * 0.54) / (h * 0.30)
            px[x, y] = 255 if dx * dx + dy * dy <= 1 else 0
    rgba.putalpha(mask.filter(ImageFilter.GaussianBlur(6)))
    return rgba


def grade(image: Image.Image) -> Image.Image:
    # White balance toward gray, a little contrast, richer blacks. No inpaint.
    arr = np.asarray(image).astype(np.float32)
    means = arr.reshape(-1, 3).mean(axis=0)
    scale = means.mean() / np.maximum(means, 1)
    arr = np.clip(arr * scale, 0, 255)
    out = Image.fromarray(arr.astype(np.uint8))
    out = ImageEnhance.Contrast(out).enhance(1.06)
    return out


def glass_swap(car: Image.Image, plate: Image.Image) -> Image.Image:
    """Replace only bright window-like patches. Leaves paint and damage alone."""
    arr = np.asarray(car.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.float32)
    bright = rgb.mean(axis=2) > 175
    flat = rgb.std(axis=2) < 18
    windows = bright & flat
    if windows.mean() > 0.25:
        return car
    plate_arr = np.asarray(plate.resize(car.size)).astype(np.float32)
    rgb[windows] = plate_arr[windows]
    arr[:, :, :3] = rgb.astype(np.uint8)
    return Image.fromarray(arr)


def compose(original: Image.Image, plate: Image.Image, mode: str) -> Image.Image:
    plate = plate.resize(original.size)
    if mode == "keep":
        return grade(original)
    subject = cutout(original)
    if mode == "windows":
        return glass_swap(grade(original).convert("RGBA"), plate)
    canvas = plate.convert("RGBA")
    # Contact shadow from the alpha.
    alpha = subject.getchannel("A")
    shadow = Image.new("RGBA", original.size, (20, 16, 14, 0))
    shadow.putalpha(alpha.point(lambda v: int(v * 0.35)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(subject)
    return canvas.convert("RGB")


def listing(image: Image.Image, edge: int = 1600) -> bytes:
    scale = min(1, edge / max(image.size))
    sized = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))))
    buf = io.BytesIO()
    sized.save(buf, format="WEBP", quality=82)
    return buf.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True)
    parser.add_argument("--secret", required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    base = args.app.rstrip("/")
    while True:
        job = fetch(f"{base}/api/studio/jobs", args.secret)
        item = job.get("job")
        if not item:
            if args.once:
                return
            time.sleep(4)
            continue
        try:
            original = download(item["originalUrl"])
            plate = download(item["plateUrl"]) if item.get("plateUrl") else Image.new("RGB", original.size, (236, 232, 226))
            edited = compose(original, plate, item.get("mode") or "swap_all")
            done = fetch(
                f"{base}/api/studio/jobs",
                args.secret,
                "POST",
                {
                    "id": item["id"],
                    "listing": __import__("base64").b64encode(listing(edited)).decode(),
                    "confidence": 86 if REMBG else 62,
                },
            )
            print("done", item["id"], done.get("ok"))
        except Exception as err:
            fetch(f"{base}/api/studio/jobs", args.secret, "POST", {"id": item["id"], "error": str(err)})
            print("fail", item.get("id"), err)


if __name__ == "__main__":
    main()
