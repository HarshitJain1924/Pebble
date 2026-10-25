/**
 * Color composition helper.
 *
 * Pebble's workspace identity is stored as a user-chosen hex color. Surfaces
 * that want to express that identity as a restrained tint (rather than a
 * full-bleed fill) need to compose it with the active theme surface, so the
 * result stays opaque, theme-aware, and gradient-free.
 *
 * `mixHex` linearly blends two `#RGB` / `#RRGGBB` values. Any other input keeps
 * the base color untouched, so a malformed workspace color can never produce an
 * unreadable surface.
 */

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(value: string): [number, number, number] | null {
  const match = HEX_PATTERN.exec(String(value ?? "").trim());
  if (!match) return null;

  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((char) => char + char)
      .join("");
  }

  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/**
 * Blend `accent` into `base`.
 *
 * @param base   Opaque surface color (`#RRGGBB`).
 * @param accent Opaque identity color (`#RRGGBB`).
 * @param ratio  0 = base only, 1 = accent only. Clamped.
 */
export function mixHex(base: string, accent: string, ratio: number): string {
  const baseRgb = parseHex(base);
  if (!baseRgb) return base;

  const accentRgb = parseHex(accent);
  if (!accentRgb) return base;

  const amount = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;

  return toHex([
    baseRgb[0] + (accentRgb[0] - baseRgb[0]) * amount,
    baseRgb[1] + (accentRgb[1] - baseRgb[1]) * amount,
    baseRgb[2] + (accentRgb[2] - baseRgb[2]) * amount,
  ]);
}
