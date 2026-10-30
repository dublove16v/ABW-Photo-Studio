#!/usr/bin/env python3
"""Cut one exterior shot onto a plate. Reads paths from argv, writes a JPEG."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from rembg import new_session, remove

_SESSION = None


def session():
    global _SESSION
    if _SESSION is None:
        _SESSION = new_session("u2net")
    return _SESSION


def studio_plate(w: int, h: int) -> Image.Image:
    arr = np.full((h, w, 3), 242, dtype=np.uint8)
    floor = int(h * 0.62)
    for y in range(floor, h):
        t = (y - floor) / max(1, h - floor)
        arr[y, :] = int(242 - 28 * t)
    return Image.fromarray(arr).convert("RGBA")


def cutout(src: Path, plate: Path | None, dest: Path) -> None:
    orig = Image.open(src).convert("RGB")
    orig.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
    w, h = orig.size
    cut = remove(orig, session=session())
    if plate and plate.exists():
        bg = Image.open(plate).convert("RGBA").resize((w, h), Image.Resampling.LANCZOS)
    else:
        bg = studio_plate(w, h)
    alpha = cut.split()[-1]
    shadow = alpha.filter(ImageFilter.GaussianBlur(radius=14))
    shadow = ImageEnhance.Brightness(shadow).enhance(0.4)
    offset = Image.new("L", shadow.size, 0)
    offset.paste(shadow, (0, 8))
    black = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    black.putalpha(offset)
    final = Image.alpha_composite(Image.alpha_composite(bg, black), cut).convert("RGB")
    final = ImageEnhance.Contrast(final).enhance(1.06)
    dest.parent.mkdir(parents=True, exist_ok=True)
    final.save(dest, quality=90)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: cutout_one.py input.jpg output.jpg [plate.jpg]", file=sys.stderr)
        sys.exit(2)
    cutout(Path(sys.argv[1]), Path(sys.argv[3]) if len(sys.argv) > 3 else None, Path(sys.argv[2]))
