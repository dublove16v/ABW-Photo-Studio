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
    arr = np.asarray(image).astype(np.float32)
    means = arr.reshape(-1, 3).mean(axis=0)
    scale = means.mean() / np.maximum(means, 1)
    arr = np.clip(arr * scale, 0, 255)
    out = Image.fromarray(arr.astype(np.uint8))
    out = ImageEnhance.Contrast(out).enhance(1.06)
    return out
