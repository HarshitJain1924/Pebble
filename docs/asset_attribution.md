# Asset Attribution

Third-party asset attributions and licence obligations for assets shipped inside Pebble.

## Flaticon animated flames (habit streaks)

Five animated flame GIFs live in `assets/images/streak/` and are registered centrally in
`features/habits/utils/streakFlameAssets.ts`. They depict the five habit streak stages.

> **Attribution still outstanding.** The files are present, but the per-icon licence metadata
> (icon title, author, source URL, and free-with-attribution vs. premium tier) has **not** been
> recorded or verified. Flaticon's free tier requires attribution and the exact wording depends
> on the tier and the icon author, so the table below must be filled in — and the licence terms
> confirmed — before these assets ship in a release.

Files are **640×640, 490 KB–1.5 MB each (~4.9 MB combined)** but render at 20×20pt; see the
pending downscale note in `streakFlameAssets.ts`.

| Stage | File | Icon title | Author | Source URL | Licence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 — base flame | `assets/images/streak/flame_stage_1.gif` | _pending_ | _pending_ | _pending_ | _pending_ |
| 2 | `assets/images/streak/flame_stage_2.gif` | _pending_ | _pending_ | _pending_ | _pending_ |
| 3 | `assets/images/streak/flame_stage_3.gif` | _pending_ | _pending_ | _pending_ | _pending_ |
| 4 | `assets/images/streak/flame_stage_4.gif` | _pending_ | _pending_ | _pending_ | _pending_ |
| 5 — "Passion" milestone flame | `assets/images/streak/flame_stage_5.gif` | _pending_ | _pending_ | _pending_ | _pending_ |

Add attribution text to the in-app credits location **only if** the licence requires it.


## First-party assets

Everything else under `assets/images/` (Cairn mascot, avatars, dock, jar pebbles, app icons) is
first-party Pebble artwork and needs no external attribution.
