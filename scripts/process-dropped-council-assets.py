#!/usr/bin/env python3
"""
Process dropped third-party assets into council-room runtime assets.

Outputs:
- webview-ui/public/assets/characters/char_0..char_5.png
- webview-ui/public/assets/furniture/** + furniture-catalog.json
- apps/pixel-agents-electron/public/assets/characters/char_0..char_5.png
- apps/pixel-agents-electron/public/assets/furniture/** + furniture-catalog.json
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from collections import deque
import hashlib
import json
import math
import re
import shutil
from typing import Dict, Iterable, List, Sequence, Tuple

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent

METRO_MODEL = ROOT / "asset-drop" / "jik-a-4" / "raw" / "MetroCity" / "CharacterModel" / "Character Model.png"
METRO_HAIRS = ROOT / "asset-drop" / "jik-a-4" / "raw" / "MetroCity" / "Hair" / "Hairs.png"
METRO_OUTFITS_DIR = ROOT / "asset-drop" / "jik-a-4" / "raw" / "MetroCity" / "Outfits"

OFFICE_FURNITURE_DIR = (
    ROOT
    / "asset-drop"
    / "jik-a-4"
    / "raw"
    / "Office-Furniture-Pixel-Art"
    / "Office-Furniture-Pixel-Art"
)

INTERIOR_FURNITURE_DIR = ROOT / "asset-drop" / "furniture-pack" / "raw" / "Interior"
INTERIOR_EXPORT_TMP_DIR = ROOT / "asset-drop" / "furniture-pack" / "processed"
PIXEL_FONT_SOURCE = ROOT / "webview-ui" / "src" / "fonts" / "FSPixelSansUnicode-Regular.ttf"

ASSET_TARGET_ROOTS = [
    ROOT / "webview-ui" / "public" / "assets",
    ROOT / "apps" / "pixel-agents-electron" / "public" / "assets",
]


FRAME_W = 32
FRAME_H = 32
OUT_FRAME_W = 16
OUT_FRAME_H = 32
OUT_COLS = 7
OUT_ROWS = 3

# MetroCity has 24 columns of animation per row. We map to Pixel Agents'
# expected 7-frame sequence for each direction.
DOWN_COLS = [0, 1, 2, 3, 4, 5, 4]
RIGHT_COLS = [6, 7, 8, 9, 10, 11, 10]
UP_COLS = [12, 13, 14, 15, 16, 17, 16]
SHEET_TILE_SIZE = 16
SHEET_ALPHA_THRESHOLD = 24
SHEET_MIN_OPAQUE_PIXELS = 8
SHEET_MAX_COMPONENT_TILES = 24
SHEET_MAX_COMPONENT_W = 6
SHEET_MAX_COMPONENT_H = 6
SHEET_MAX_EXPORTS_PER_SHEET = 120


@dataclass(frozen=True)
class FurnitureMeta:
    category: str
    is_desk: bool
    can_place_on_walls: bool
    can_place_on_surfaces: bool


@dataclass(frozen=True)
class FurnitureBuildItem:
    entry: Dict[str, object]
    source_path: Path


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "asset"


def title_from_stem(stem: str) -> str:
    return stem.replace("-", " ").replace("_", " ").strip().title()


def classify_furniture(stem: str) -> FurnitureMeta:
    lower = stem.lower()

    is_desk = "desk" in lower or "table" in lower
    wallish = lower.startswith("wall-") or lower in {
        "board",
        "mirror",
    } or any(token in lower for token in ["door", "window", "painting", "light", "clock", "graph"])
    surface_item = lower in {
        "books",
        "folders",
        "folders-2",
        "papers",
        "bin",
        "small-plant",
        "wall-note",
        "wall-note-2",
    }

    if "chair" in lower:
        category = "chairs"
    elif is_desk:
        category = "desks"
    elif any(token in lower for token in ["kitchen", "counter", "tv"]):
        category = "electronics"
    elif any(token in lower for token in ["cabinet", "bookshelf", "filing", "books", "folders"]):
        category = "storage"
    elif any(token in lower for token in ["printer", "coffee-machine", "vending", "water-dispenser"]):
        category = "electronics"
    elif wallish:
        category = "wall"
    elif any(token in lower for token in ["plant", "clock", "graph", "note", "mirror", "board"]):
        category = "decor"
    else:
        category = "misc"

    return FurnitureMeta(
        category=category,
        is_desk=is_desk,
        can_place_on_walls=wallish,
        can_place_on_surfaces=surface_item,
    )


def ensure_dirs(paths: Iterable[Path]) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def composite_frame(
    model: Image.Image,
    outfit: Image.Image,
    hairs: Image.Image,
    *,
    skin_row: int,
    hair_row: int,
    col: int,
) -> Image.Image:
    src_x = col * FRAME_W
    src_y = skin_row * FRAME_H
    base_crop = model.crop((src_x, src_y, src_x + FRAME_W, src_y + FRAME_H)).convert("RGBA")

    outfit_crop = outfit.crop((src_x, 0, src_x + FRAME_W, FRAME_H)).convert("RGBA")
    hair_y = hair_row * FRAME_H
    hair_crop = hairs.crop((src_x, hair_y, src_x + FRAME_W, hair_y + FRAME_H)).convert("RGBA")

    composite = Image.alpha_composite(base_crop, outfit_crop)
    composite = Image.alpha_composite(composite, hair_crop)

    # Keep 32px height; center-crop width to 16px expected by renderer.
    left = (FRAME_W - OUT_FRAME_W) // 2
    return composite.crop((left, 0, left + OUT_FRAME_W, OUT_FRAME_H))


def build_character_sheet(
    model: Image.Image,
    outfit: Image.Image,
    hairs: Image.Image,
    *,
    skin_row: int,
    hair_row: int,
) -> Image.Image:
    out = Image.new("RGBA", (OUT_COLS * OUT_FRAME_W, OUT_ROWS * OUT_FRAME_H), (0, 0, 0, 0))
    row_mappings = [DOWN_COLS, UP_COLS, RIGHT_COLS]

    for out_row, cols in enumerate(row_mappings):
        for out_col, src_col in enumerate(cols):
            frame = composite_frame(
                model,
                outfit,
                hairs,
                skin_row=skin_row,
                hair_row=hair_row,
                col=src_col,
            )
            out.paste(frame, (out_col * OUT_FRAME_W, out_row * OUT_FRAME_H))
    return out


def export_characters() -> None:
    if not METRO_MODEL.exists():
        raise FileNotFoundError(f"Missing model sheet: {METRO_MODEL}")
    if not METRO_HAIRS.exists():
        raise FileNotFoundError(f"Missing hair sheet: {METRO_HAIRS}")

    outfit_paths = sorted(METRO_OUTFITS_DIR.glob("Outfit*.png"))
    if len(outfit_paths) < 6:
        raise RuntimeError(f"Expected at least 6 outfits in {METRO_OUTFITS_DIR}")

    model = Image.open(METRO_MODEL).convert("RGBA")
    hairs = Image.open(METRO_HAIRS).convert("RGBA")
    outfits = [Image.open(path).convert("RGBA") for path in outfit_paths[:6]]

    for target_root in ASSET_TARGET_ROOTS:
        chars_dir = target_root / "characters"
        ensure_dirs([chars_dir])
        for idx in range(6):
            sheet = build_character_sheet(
                model,
                outfits[idx],
                hairs,
                skin_row=idx,
                hair_row=idx % 8,
            )
            sheet.save(chars_dir / f"char_{idx}.png")

    for img in outfits:
        img.close()
    model.close()
    hairs.close()


def build_entry(
    *,
    asset_id: str,
    label: str,
    meta: FurnitureMeta,
    width: int,
    height: int,
) -> Dict[str, object]:
    footprint_w = max(1, math.ceil(width / 16))
    footprint_h = max(1, math.ceil(height / 16))
    can_place_on_surfaces = meta.can_place_on_surfaces or (
        footprint_w == 1
        and footprint_h == 1
        and not meta.is_desk
        and meta.category not in {"chairs", "wall"}
    )

    return {
        "id": asset_id,
        "name": asset_id,
        "label": label,
        "category": meta.category,
        "file": f"furniture/{meta.category}/{asset_id}.png",
        "width": width,
        "height": height,
        "footprintW": footprint_w,
        "footprintH": footprint_h,
        "isDesk": meta.is_desk,
        "canPlaceOnWalls": meta.can_place_on_walls,
        "canPlaceOnSurfaces": can_place_on_surfaces,
    }


def build_office_furniture_items() -> List[FurnitureBuildItem]:
    if not OFFICE_FURNITURE_DIR.exists():
        raise FileNotFoundError(f"Missing furniture source dir: {OFFICE_FURNITURE_DIR}")

    items: List[FurnitureBuildItem] = []
    for source in sorted(OFFICE_FURNITURE_DIR.glob("*.png")):
        if source.name.lower() == "0-tileset.png":
            continue

        stem = source.stem
        asset_id = f"jik-office-{slugify(stem)}"
        meta = classify_furniture(stem)
        with Image.open(source) as image:
            width, height = image.width, image.height
        entry = build_entry(
            asset_id=asset_id,
            label=title_from_stem(stem),
            meta=meta,
            width=width,
            height=height,
        )
        items.append(FurnitureBuildItem(entry=entry, source_path=source))
    return items


def tile_has_content(alpha: Image.Image, col: int, row: int) -> bool:
    x0 = col * SHEET_TILE_SIZE
    y0 = row * SHEET_TILE_SIZE
    tile = alpha.crop((x0, y0, x0 + SHEET_TILE_SIZE, y0 + SHEET_TILE_SIZE))
    opaque = 0
    for value in tile.getdata():
        if value >= SHEET_ALPHA_THRESHOLD:
            opaque += 1
            if opaque >= SHEET_MIN_OPAQUE_PIXELS:
                return True
    return False


def component_bboxes_from_sheet(image: Image.Image) -> List[Tuple[int, int, int, int]]:
    cols = image.width // SHEET_TILE_SIZE
    rows = image.height // SHEET_TILE_SIZE
    if cols <= 0 or rows <= 0:
        return []

    alpha = image.getchannel("A")
    occupied = [[False for _ in range(cols)] for _ in range(rows)]
    for row in range(rows):
        for col in range(cols):
            occupied[row][col] = tile_has_content(alpha, col, row)

    visited = [[False for _ in range(cols)] for _ in range(rows)]
    bboxes: List[Tuple[int, int, int, int]] = []

    for start_row in range(rows):
        for start_col in range(cols):
            if not occupied[start_row][start_col] or visited[start_row][start_col]:
                continue

            queue: deque[Tuple[int, int]] = deque()
            queue.append((start_col, start_row))
            visited[start_row][start_col] = True
            component: List[Tuple[int, int]] = []

            while queue:
                col, row = queue.popleft()
                component.append((col, row))
                for d_col, d_row in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    next_col = col + d_col
                    next_row = row + d_row
                    if next_col < 0 or next_col >= cols or next_row < 0 or next_row >= rows:
                        continue
                    if visited[next_row][next_col] or not occupied[next_row][next_col]:
                        continue
                    visited[next_row][next_col] = True
                    queue.append((next_col, next_row))

            min_col = min(col for col, _ in component)
            max_col = max(col for col, _ in component)
            min_row = min(row for _, row in component)
            max_row = max(row for _, row in component)
            width_tiles = max_col - min_col + 1
            height_tiles = max_row - min_row + 1

            if (
                len(component) > SHEET_MAX_COMPONENT_TILES
                or width_tiles > SHEET_MAX_COMPONENT_W
                or height_tiles > SHEET_MAX_COMPONENT_H
            ):
                for col, row in sorted(component, key=lambda entry: (entry[1], entry[0])):
                    bboxes.append((col, row, col, row))
            else:
                bboxes.append((min_col, min_row, max_col, max_row))

    bboxes.sort(key=lambda bbox: (bbox[1], bbox[0], bbox[3], bbox[2]))
    return bboxes


def build_sheet_furniture_items() -> List[FurnitureBuildItem]:
    if not INTERIOR_FURNITURE_DIR.exists():
        return []

    if INTERIOR_EXPORT_TMP_DIR.exists():
        shutil.rmtree(INTERIOR_EXPORT_TMP_DIR)
    INTERIOR_EXPORT_TMP_DIR.mkdir(parents=True, exist_ok=True)

    items: List[FurnitureBuildItem] = []
    seen_hashes: set[str] = set()
    sheet_files = sorted(INTERIOR_FURNITURE_DIR.rglob("*-Sheet.png"))

    for sheet in sheet_files:
        pack_slug = slugify(sheet.parent.name)
        sheet_name = sheet.stem.replace("-Sheet", "")
        sheet_slug = slugify(sheet_name)
        sheet_meta = classify_furniture(f"{pack_slug}-{sheet_slug}")
        exports_for_sheet = 0

        with Image.open(sheet).convert("RGBA") as image:
            for bbox_idx, bbox in enumerate(component_bboxes_from_sheet(image), start=1):
                if exports_for_sheet >= SHEET_MAX_EXPORTS_PER_SHEET:
                    break

                min_col, min_row, max_col, max_row = bbox
                x0 = min_col * SHEET_TILE_SIZE
                y0 = min_row * SHEET_TILE_SIZE
                x1 = (max_col + 1) * SHEET_TILE_SIZE
                y1 = (max_row + 1) * SHEET_TILE_SIZE
                crop = image.crop((x0, y0, x1, y1))
                inner = crop.getbbox()
                if not inner:
                    continue
                crop = crop.crop(inner)
                if crop.width < 8 or crop.height < 8:
                    continue

                digest = hashlib.sha1(
                    f"{crop.width}x{crop.height}".encode("utf-8") + crop.tobytes()
                ).hexdigest()
                if digest in seen_hashes:
                    continue
                seen_hashes.add(digest)

                exports_for_sheet += 1
                asset_id = f"fpack-{pack_slug}-{sheet_slug}-{exports_for_sheet:03d}"
                label = f"{title_from_stem(sheet_name)} {exports_for_sheet}"
                source_path = INTERIOR_EXPORT_TMP_DIR / f"{asset_id}.png"
                crop.save(source_path)

                entry = build_entry(
                    asset_id=asset_id,
                    label=label,
                    meta=sheet_meta,
                    width=crop.width,
                    height=crop.height,
                )
                items.append(FurnitureBuildItem(entry=entry, source_path=source_path))

    return items


def build_furniture_items() -> List[FurnitureBuildItem]:
    items = build_office_furniture_items()
    items.extend(build_sheet_furniture_items())
    items.sort(key=lambda item: str(item.entry["id"]))
    return items


def export_furniture(items: Sequence[FurnitureBuildItem]) -> None:
    entries = [item.entry for item in items]
    for target_root in ASSET_TARGET_ROOTS:
        furniture_root = target_root / "furniture"
        ensure_dirs([furniture_root])

        # Reset previous imported categories to avoid stale files.
        for child in furniture_root.iterdir():
            if child.is_dir():
                shutil.rmtree(child)

        for item in items:
            entry = item.entry
            category = str(entry["category"])
            asset_id = str(entry["id"])
            category_dir = furniture_root / category
            ensure_dirs([category_dir])
            shutil.copy2(item.source_path, category_dir / f"{asset_id}.png")

        catalog = {
            "version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "totalAssets": len(entries),
            "categories": sorted({str(entry["category"]) for entry in entries}),
            "assets": list(entries),
        }
        (furniture_root / "furniture-catalog.json").write_text(
            json.dumps(catalog, indent=2),
            encoding="utf-8",
        )


def export_font() -> None:
    if not PIXEL_FONT_SOURCE.exists():
        return
    for target_root in ASSET_TARGET_ROOTS:
        font_dir = target_root / "fonts"
        ensure_dirs([font_dir])
        shutil.copy2(PIXEL_FONT_SOURCE, font_dir / PIXEL_FONT_SOURCE.name)


def main() -> None:
    print("Processing dropped council assets...")
    export_characters()
    furniture_items = build_furniture_items()
    export_furniture(furniture_items)
    export_font()
    print(f"Done. Exported {len(furniture_items)} furniture assets and 6 character sheets.")


if __name__ == "__main__":
    main()
