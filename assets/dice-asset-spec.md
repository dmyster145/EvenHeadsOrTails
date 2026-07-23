# Dice asset spec (for the artist)

Dice mode currently ships a **d6 only**. All art is final, delivered as
sprite sheets and split into `public/dice/`. Support for more dice (d4, d8,
d10, d12, d20 with engraved runtime numerals) was prototyped and removed for
now; it lives in git history and can return if requested.

## Hard technical constraints (for any future art)

The glasses display is monochrome. At runtime every image is:

- downscaled to 144×144,
- converted to pure grayscale with a **1.6× contrast boost**,
- quantized to a **16-level gray palette**,
- alpha hard-thresholded: pixels more than ~30% transparent are deleted,
  everything else becomes fully opaque.

So all art must be PNG on a transparent background (or plain white; the
splitter removes it), authored at 288×288 or larger, grayscale-friendly,
bold contrast, hard edges.

## Current inventory (12 files in `public/dice/`)

### Pip faces: ✅ DELIVERED

`d6-1.png` … `d6-6.png`: head-on pewter pip faces, split from the provided
3×2 sheet with uniform cropping/centering (die spans 228px of the 288
canvas).

### Isometric views: ✅ DELIVERED

`d6-iso-1.png` … `d6-iso-6.png`: 3D corner views, same uniform framing.
The roll animation uses these as the mid-tumble poses (scaled up ~18% at
runtime so the cube reads the same size as the head-on face).

### Tumble frames: NOT NEEDED

Generated at runtime from the isometric views, rotated in 45° steps and
never repeating a pose or value on consecutive frames. The landing reuses
the pip face, tilted 45° and then flat, so the die settles into place.

## Delivery format

Sprite sheets work great: a 3×2 grid on a white background, one die per
cell, values 1–6 in reading order. The developer splits them with automatic
uniform framing.
