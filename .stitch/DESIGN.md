# Design System Specification: Aura Premium Dark System

## 1. Overview & Creative North Star
**Creative North Star: "Aura"**

A premium, calm, and highly focused productivity app UI. The design is inspired by top-tier modern productivity suites like Linear and TickTick. It employs a clean, dark charcoal dashboard-first layout emphasizing spaciousness, elegant soft-glowing accents, and spatial layout hierarchy rather than complex structural borders.

---

## 2. Color & Surface Philosophy

We use a deep, unified dark charcoal canvas with rich, desaturated indigo surfaces that stack to create depth.

*   **Canvas Base:** Deep Charcoal (`#09090B` or `#0C0C0E`).
*   **Surface Cards:** Raised floating cards with soft gradients (`#18181B` to `#121214`).
*   **Accent Color:** Vibrant Indigo (`#6366F1`) and soft neon highlights for alerts (`#10B981` green, `#F59E0B` amber).
*   **The "No-Borders" Rule:** Avoid using 1px solid high-contrast borders. Instead, define sections via subtle differences in background surface color, negative space, and elegant 8px-16px ambient shadows.

---

## 3. Typography & Rhythm

*   **Header / Accent (Manrope):** Geometric and professional curves. Use generous spacing and bold weights for titles.
*   **Data / Body (Inter):** Highly legible, clean, desaturated typography (`#E4E4E7` for body, `#A1A1AA` for labels/subtext) to prevent eye strain.

---

## 4. Component Definitions & Screens

*   **Floating Navigation Bar:** Pill-shaped bottom bar floating gently above the base canvas with desaturated icons, transitioning to a glowing indigo accent for the active page.
*   **Today Dashboard (Screen 1):** Personal greeting, daily percentage indicator (glowing indigo circle progress ring at 72%), streak tracking banner (desaturated amber flame #F59E0B), remaining tasks, and productivity index score.
*   **My Tasks (Screen 2):** Expandable task cards showing nested subtask completion status, checklists, and clean checkboxes.
*   **Daily Habits (Screen 3):** Weekly streak calendar grids with glowing active dots (M-Th checked, Friday active), streak flame counters.
*   **Analytics & Heatmap (Screen 4):** Contribution-style 30-day productivity heatmap (desaturated charcoal to glowing indigo squares) and weekly completion bar charts.
*   **Focus Session (Screen 5):** Elegant minimalist Pomodoro timer, glowing circular progress countdown ring, session stat panels.
