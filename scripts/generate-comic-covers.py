"""Generate deterministic square comic-style covers from the real paper images.

This is an offline authoring utility. It never overwrites source images and it is
not required by the production website at runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


SIZE = 960
PAPER_DATA_PATTERN = re.compile(r'\bimg\s*:\s*(["\'])(.*?)\1')


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def slug_for(path: Path) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-")
    return f"{slug}-comic.webp"


def comicize(image: Image.Image) -> Image.Image:
    rgb = ImageOps.exif_transpose(image).convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.08)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    quantized = ImageOps.posterize(rgb, 5)

    edge_source = rgb.filter(ImageFilter.SMOOTH).filter(ImageFilter.FIND_EDGES).convert("L")
    edge_source = ImageOps.autocontrast(edge_source, cutoff=2)
    ink = ImageOps.invert(edge_source).point(lambda value: 255 if value > 196 else max(72, value))
    ink_rgb = Image.merge("RGB", (ink, ink, ink))
    outlined = ImageChops.multiply(quantized, ink_rgb)
    return Image.blend(quantized, outlined, 0.28)


def make_cover(source: Path) -> Image.Image:
    with Image.open(source) as original:
        processed = comicize(original)

    backdrop = ImageOps.fit(processed, (SIZE, SIZE), method=Image.Resampling.LANCZOS)
    backdrop = backdrop.filter(ImageFilter.GaussianBlur(24))
    backdrop = ImageEnhance.Color(backdrop).enhance(0.72)
    cream = Image.new("RGB", (SIZE, SIZE), "#f6f1e7")
    canvas = Image.blend(backdrop, cream, 0.42).convert("RGBA")

    inset = 56
    frame_size = SIZE - inset * 2
    contained = ImageOps.contain(processed, (frame_size, frame_size), method=Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (frame_size, frame_size), (255, 253, 248, 238))
    image_x = (frame_size - contained.width) // 2
    image_y = (frame_size - contained.height) // 2
    frame.alpha_composite(contained.convert("RGBA"), (image_x, image_y))

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (inset + 12, inset + 18, SIZE - inset + 12, SIZE - inset + 18),
        radius=24,
        fill=(23, 34, 44, 64),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(frame, (inset, inset))

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (inset, inset, SIZE - inset, SIZE - inset),
        radius=18,
        outline=(23, 34, 44, 88),
        width=3,
    )
    draw.line((inset, SIZE - inset - 10, SIZE - inset, SIZE - inset - 10), fill=(223, 111, 63, 190), width=8)
    return canvas.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    data_path = repo / "papers-data.js"
    output_dir = repo / "files" / "research-records" / "comic"
    output_dir.mkdir(parents=True, exist_ok=True)

    paper_source = data_path.read_text(encoding="utf-8")
    image_paths = [value for _, value in PAPER_DATA_PATTERN.findall(paper_source)]
    unique_images = list(dict.fromkeys(image_paths))
    source_hashes = {value: sha256(repo / value) for value in unique_images}
    results = []

    for relative in unique_images:
        source = repo / relative
        destination = output_dir / slug_for(source)
        if destination.exists() and not args.force:
            raise FileExistsError(f"Refusing to overwrite {destination}; use --force for deterministic regeneration")
        cover = make_cover(source)
        cover.save(destination, "WEBP", quality=88, method=6)
        with Image.open(destination) as verification:
            if verification.size != (SIZE, SIZE):
                raise RuntimeError(f"Unexpected cover size for {destination}: {verification.size}")
        results.append({
            "source": relative,
            "source_sha256": source_hashes[relative],
            "output": destination.relative_to(repo).as_posix(),
            "output_sha256": sha256(destination),
            "width": SIZE,
            "height": SIZE,
            "bytes": destination.stat().st_size,
        })

    unchanged = all(sha256(repo / relative) == digest for relative, digest in source_hashes.items())
    if not unchanged:
        raise RuntimeError("A source paper image changed during cover generation")

    print(json.dumps({"method": "Pillow posterization + edge overlay + contained square layout", "source_images_unchanged": unchanged, "covers": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
