/**
 * pebble/no-raw-hex-colors
 *
 * Fails on raw hex color literals (`#fff`, `#FFFFFF`, `#FFFFFFcc`, ...) anywhere
 * in application code, so colors can only enter the app through the two token
 * modules: `shared/constants/theme.ts` (Palette / Colors) and
 * `shared/constants/categoryColors.ts` (semantic maps + hooks).
 *
 * It catches every place a color can hide:
 *   - `StyleSheet.create({ backgroundColor: "#fff" })`
 *   - inline style props: `style={{ color: "#fff" }}`
 *   - JSX attributes:      `<Feather color="#fff" />`
 *   - constants/vars:      `const RED = "#f00"`
 *   - no-substitution template literals: `` `#fff` ``
 *
 * Named CSS keywords (`transparent`, `red`) and `rgba()/hsl()` strings are not
 * colors-by-literal and remain allowed.
 */

const STRICT_HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const ANY_HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

const MESSAGE =
  "Raw hex color literal \"{{value}}\" is not allowed. Use a token instead: " +
  "`Colors[scheme].*` / `Palette.*` from @/shared/constants/theme, or a semantic " +
  "map/hook from @/shared/constants/categoryColors (e.g. `getCategoryColors(isDark)`, " +
  "`PriorityColors.high`, `ResourceKindColors.link`).";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw hex color literals outside the central color token modules.",
    },
    schema: [
      {
        type: "object",
        properties: {
          /** Exact literals that are exempt (compared case-insensitively). */
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawHex: MESSAGE,
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allow = new Set(
      (options.allow || []).map((value) => String(value).toLowerCase()),
    );

    function check(node, rawValue) {
      if (typeof rawValue !== "string") return;
      const value = rawValue.trim();
      if (!ANY_HEX.test(value)) return;
      // Only flag values that are *entirely* a color literal, so prose such as
      // "the #1FFF trade" in a sentence is never reported.
      if (!STRICT_HEX.test(value)) return;
      if (allow.has(value.toLowerCase())) return;
      context.report({ node, messageId: "rawHex", data: { value } });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
