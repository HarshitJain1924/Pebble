# Icon set — gut-check & proposal

**Status:** proposal only. **No icons have been changed.** This document exists so the
decision is recorded before any code is touched.

## Inventory (measured, not estimated)

| Metric | Value |
|---|---|
| `<Feather …>` JSX call sites | **526** |
| Files importing `Feather` from `@expo/vector-icons` | **101** |
| Distinct icon names (literal `name="…"`) | **97** |
| Central `Icon` wrapper component | **none** — every file imports `Feather` directly |
| Installed `@expo/vector-icons` | `15.1.1` |
| Already-installed deps that matter | `react-native-svg 15.12.1`, `expo-symbols ~1.0.8` |

Two facts that shape everything below:

1. **There is no wrapper.** A swap is not a one-file change — it is 101 files, because
   each imports the icon set directly. There is no seam to swap behind.
2. **`@expo/vector-icons` does not ship Phosphor.** `15.1.1` bundles Feather,
   MaterialIcons, MaterialCommunityIcons, Ionicons, FontAwesome5/6, AntDesign, Entypo,
   EvilIcons, Fontisto, Foundation, Octicons, SimpleLineIcons, Zocial. Phosphor would be a
   **new dependency**, not a flag flip. (`expo-symbols` — SF Symbols — is already installed
   but is iOS-only; using it would create platform divergence.)

## The 20 highest-visibility call sites

These are the icons a user sees without navigating. Frequency is app-wide occurrences.

### Tab bar — always on screen
| Icon | Where | App-wide |
|---|---|---|
| `home` | tab: Today | 1 |
| `folder` | tab: Workspaces | 1 |
| `calendar` | tab: Calendar | 13 |
| `target` | tab: Focus | 5 |

### Bottom-sheet CTA + morphing-bar states
| Icon | App-wide |
|---|---|
| `plus` (primary capture CTA) | 18 |
| `check-square` | 1 |
| `activity` | 1 |
| `list` | 2 |
| `paperclip` | 11 |
| `layers` | 2 |
| `edit-3` | 1 |
| `chevron-right` | 24 |

### Today screen (`app/(tabs)/index.tsx`, `features/today/`)
| Icon | App-wide |
|---|---|
| `x` (dismiss) | **43** — the single most-used icon in the app |
| `check` | 24 |
| `chevron-right` | 24 |
| `clock` | 16 |
| `search` | 13 |
| `bell` | 10 |
| `arrow-right` | 10 |
| `file-text` | 2 |
| `sun` / `sliders` / `play` / `feather` | 1 each |

`feather` is worth calling out separately: it is the app's own namesake glyph and its
single clearest branding opportunity, currently rendered as a generic Feather outline.

### Capture sheet (`features/capture/`)
`zap` (7) · `check` · `x` · `plus` · `alert-circle` · `mic` · `clipboard` · `link` (6) · `eye`

### Onboarding (`app/onboarding.tsx`)
`target` · `mic` · `arrow-right` · `check`

## Options

### Option A — full swap to a more distinctive set (e.g. Phosphor)
- **Cost:** 101 files, 526 call sites, a hand-built mapping table for 97 names, **plus a new
  dependency**. Mechanical, but no part of it is verifiable by the test suite: there are no
  icon snapshots, so a wrong or missing glyph is only caught by the eye.
- **Hidden risk:** Feather is a 2px-stroke hairline set on a 24px grid. Phosphor defaults to
  heavier, more filled forms. A naive 1:1 name swap changes the *perceived density* of every
  screen — icon-to-text optical balance shifts on all 526 sites at once, and those balances
  were tuned per-site. This is a redesign disguised as a find-and-replace.
- **Payoff:** genuine, but mostly on screens where icons are background furniture rather than
  the focal point.

### Option B — bespoke treatment on the hero set only, Feather everywhere else
- **Cost:** ~6–9 hand-drawn SVG glyphs (tab bar + capture CTA) in **one** component file.
  `react-native-svg` is already a dependency, so **no new package**.
- **Risk:** bounded to one file and one always-visible surface. Nothing else moves.
- **Payoff:** the tab bar is both the most-seen icon row in the app *and* the most generic —
  `home`/`folder`/`calendar`/`target` appear in essentially every React Native app. Fixing
  those 4–9 does disproportionate brand work for a tiny fraction of the risk.

### Option C — second library in the hero spots only
Not recommended. Two libraries never match on stroke weight, grid, or optical sizing at the
same render size. **One inconsistent row looks worse than one consistent family.** If the
answer is "only the hero spots", it must be bespoke SVG, not a second icon set.

## Recommendation

**Option B.** Bespoke SVG for the tab bar (4 tabs) plus the capture CTA — one file, ~6–9
glyphs, no new dependency — and leave the remaining ~515 call sites on Feather.

The argument is not that the other 515 icons are good; it is that **Feather is internally
consistent**, so as background furniture it reads as intentional. What breaks the illusion is
only where icons are scrutinised, and that is the tab bar. This gets most of the visible
brand benefit for a fraction of the risk, and it is the only option that can be visually
validated in a single sitting.

If a full swap is wanted anyway, it should be its own dedicated branch with a per-screen
visual pass, not a step inside a visual-modernization pass — the site-count is too large for
the test suite to act as the gate.

## Next step

Awaiting a decision. No code changes until then.
