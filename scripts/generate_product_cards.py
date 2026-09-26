import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
COLORS = {
    "YELLOW": (247, 217, 76),
    "BLACK": (23, 23, 23),
    "BLUE": (52, 120, 200),
    "RED": (207, 63, 78),
    "GRAY": (144, 149, 156),
    "WHITE": (250, 250, 247),
    "GREEN": (67, 138, 89),
}


def palette(description):
    upper = description.upper()
    for name, color in COLORS.items():
        if name in upper:
            foreground = (35, 35, 35) if name in {"YELLOW", "WHITE"} else (255, 255, 255)
            return color, foreground
    return (248, 236, 239), (79, 32, 51)


def fit_lines(draw, text, font_path, max_width, max_lines=4):
    words = text.upper().split()
    size = 44
    while size >= 24:
        font = ImageFont.truetype(font_path, size)
        lines, current = [], ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        if len(lines) <= max_lines:
            return lines, font
        size -= 2
    return lines[:max_lines], ImageFont.truetype(font_path, 24)


def draw_icon(draw, description, foreground):
    upper = description.upper()
    stroke = max(8, 12)
    if "SUNGLASSES" in upper:
        draw.ellipse((125, 145, 245, 265), outline=foreground, width=stroke)
        draw.ellipse((267, 145, 387, 265), outline=foreground, width=stroke)
        draw.arc((225, 175, 285, 235), 190, 350, fill=foreground, width=stroke)
    elif "BAG" in upper:
        draw.rounded_rectangle((145, 130, 367, 340), 24, outline=foreground, width=stroke)
        draw.arc((205, 70, 307, 210), 180, 360, fill=foreground, width=stroke)
    elif any(word in upper for word in ("SHOE", "HEEL", "BOOT", "RUBBER", "SLIPPER")):
        draw.polygon([(80, 300), (180, 320), (260, 220), (310, 125), (385, 155), (370, 260), (445, 300), (420, 355), (110, 355)], outline=foreground)
        draw.line([(80, 300), (110, 355), (420, 355)], fill=foreground, width=stroke)
    elif "TIES" in upper:
        draw.polygon([(230, 80), (282, 80), (310, 145), (275, 195), (310, 365), (256, 425), (202, 365), (237, 195), (202, 145)], outline=foreground)
    elif "FLOWER" in upper:
        draw.line((256, 150, 256, 390), fill=foreground, width=stroke)
        for box in ((215, 75, 297, 157), (155, 125, 237, 207), (275, 125, 357, 207), (185, 205, 267, 287), (245, 205, 327, 287)):
            draw.ellipse(box, outline=foreground, width=stroke)
    elif "PAPERBAG" in upper:
        draw.polygon([(150, 145), (362, 145), (340, 375), (172, 375)], outline=foreground)
        draw.arc((205, 70, 307, 205), 180, 360, fill=foreground, width=stroke)
    else:
        points = [(256, 85), (292, 190), (405, 193), (315, 260), (347, 370), (256, 306), (165, 370), (197, 260), (107, 193), (220, 190)]
        draw.line(points + [points[0]], fill=foreground, width=stroke, joint="curve")


def make_card(row, output_dir):
    description = str(row.get("description") or "PRODUCT").strip()
    category = str(row.get("category") or "").upper()
    row_number = int(row["rowNumber"])
    code = str(row.get("productCode") or "product")
    upper = description.upper()
    bg, fg = palette(description)
    image = Image.new("RGB", (512, 512), bg)
    draw = ImageDraw.Draw(image)
    if "WHITE" in upper:
        draw.rounded_rectangle((8, 8, 503, 503), 24, outline=(216, 210, 204), width=7)

    plain = {"YELLOW", "BLACK", "BLUE", "RED", "GRAY", "WHITE", "GREEN", "GREEN SPECIAL"}
    is_plain = category == "PINS" and upper in plain
    is_new = category == "PINS" and re.fullmatch(r"(?:GREEN SPECIAL|YELLOW|BLACK|BLUE|RED|GRAY|WHITE|GREEN) \(NEW\)", upper)
    if is_new:
        font = ImageFont.truetype(FONT, 104)
        draw.text((256, 256), "NEW", font=font, fill=fg, anchor="mm")
    elif not is_plain:
        draw_icon(draw, description, fg)
        lines, font = fit_lines(draw, description, FONT, 440)
        y = 405 - (len(lines) - 1) * 26
        for line in lines:
            draw.text((256, y), line, font=font, fill=fg, anchor="mm")
            y += 52

    path = output_dir / f"{code}_row{row_number}_catalog.png"
    image.save(path, "PNG", optimize=True)
    return str(path)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate_product_cards.py rows.json output_dir")
    rows = json.loads(Path(sys.argv[1]).read_text())
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for row in rows:
        if row.get("existingImage"):
            manifest.append({**row, "path": "", "imageUrl": row["existingImage"]})
            continue
        manifest.append({**row, "path": make_card(row, output_dir), "imageUrl": ""})
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False))
    print(json.dumps({"generated": sum(1 for item in manifest if item["path"]), "preserved": sum(1 for item in manifest if item["imageUrl"])}))


if __name__ == "__main__":
    main()
