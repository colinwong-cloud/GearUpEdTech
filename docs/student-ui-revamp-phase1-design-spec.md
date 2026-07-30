# GearUp Quiz — Student UI Revamp Phase 1 Design Spec

**Audience:** Coding agent implementing a minimal-diff visual revamp  
**Scope:** Student-facing screens in `src/app/page.tsx` + `src/components/student-quiz-experience.tsx`  
**Constraint:** Style/token/micro-interaction only. No API, auth, routing, or state-flow changes.

> **Critical anti-missing note:** `src/lib/anti-missing-regressions.test.ts` asserts exact class substrings (e.g. register CTA indigo classes, results CTA `bg-sky-500` / `px-8 py-3.5`). Any class string change on those guarded nodes **must** update the test in the same PR, or preserve the asserted substrings while adding adjacent classes.

---

## A) DESIGN DIRECTION SUMMARY

- **Tone:** Bright, cheerful, lightly game-like — “confident primary student,” not preschool/babyish. Target comfort for P5–P6 while remaining readable for early readers.
- **Color strategy:** Anchor on sky blue + soft green + energetic yellow; keep indigo as a *supporting* accent only where anti-missing/tests require it; use amber/gold sparingly for reward moments.
- **Surface strategy:** Replace flat `bg-white/60` panels with soft multi-stop pastel washes (`sky → mint → cream`) over the existing banana background image; keep white content cards for form readability.
- **Typography strategy:** Chinese body → `var(--font-noto-sans-tc)` (Noto Sans TC already loaded; HK-style readability without new deps). English / playful UI chrome → `var(--font-baloo2)` (already loaded). Stop relying on Comic Sans fallback stacks on login copy.
- **Icon language:** Prefer emoji anchors already in product language — ⭐ rewards/progress, 🏆 rank/leaderboard moments, 🎯 goals/題數, 📘 summary — plus existing subject icons. No new icon library.
- **Motion philosophy:** Subtle and purposeful only (≤2–3 motions per screen). Celebrate completion; never decorate idle screens with looping noise. Always honor `prefers-reduced-motion`.
- **Gamification depth:** Visual states only (avatar select ring, star/progress fill, completion badge pop). No new game loops, XP systems, or backend score changes.
- **Layout philosophy:** Keep existing information architecture and button order. Change color, radius, shadow, type, and light micro-layout only.
- **Brand first on entry:** Logo remains the hero signal on login; marketing copy stays secondary and shorter-feeling via type/color, not new copy blocks.
- **Results emotional peak:** Results is the highest-impact screen — score celebration + badge + warmer summary bubble; keep wrong-answer and CTA behaviors intact.
- **Account polish only:** Light token alignment (borders/hover/tier badge); do not redesign parent account flows.
- **Admin/tutor:** Out of Phase 1 except accidental shared token inheritance from `globals.css` (acceptable if low-risk).

---

## B) DESIGN TOKENS

Implement as CSS variables in `src/app/globals.css` under `:root` (and optionally `@theme inline` aliases). Prefer referencing tokens via Tailwind arbitrary values (`bg-[var(--gu-primary)]`) or thin utility classes (`.gu-btn-primary`) to minimize scattered hex churn.

| token name | hex | usage | accessibility note |
|---|---|---|---|
| `--gu-primary` | `#0EA5E9` | Primary CTAs, selected rings, progress fill (sky) | White text on primary ≥ 4.5:1 |
| `--gu-primary-strong` | `#0284C7` | Hover/pressed primary | Prefer for text-on-pastel links |
| `--gu-secondary` | `#34D399` | Soft green success accents, positive chips | Pair with dark text `#064E3B` for chips |
| `--gu-success` | `#059669` | Correct answers, paid tier positive | ✅ on white |
| `--gu-warning` | `#F59E0B` | Energetic yellow/amber alerts, remaining-balance hints | Dark text only (`#78350F`); never yellow-on-white for small text |
| `--gu-reward` | `#FBBF24` | Stars, completion badge, reward moments | Decorative; accompanying text must be dark |
| `--gu-accent-play` | `#38BDF8` | Option/hover playfulness (lighter sky) | Large areas only |
| `--gu-danger` | `#DC2626` | Errors, wrong-answer markers | Keep existing red semantics |
| `--gu-text` | `#0F172A` | Primary body text (slate-900) | Base text on white/pastel |
| `--gu-text-muted` | `#475569` | Subtitles, helper text | ≥ 4.5:1 on white; avoid on yellow fills |
| `--gu-bg` | `#F0F9FF` | Page wash fallback (sky-50) | Behind cards |
| `--gu-bg-wash` | `linear-gradient(160deg,#E0F2FE 0%,#ECFDF5 45%,#FEF9C3 100%)` | Student screen backdrop overlay | Keep translucency so banana `bk.png` still reads |
| `--gu-surface` | `#FFFFFF` | Forms, tables, cards | |
| `--gu-border` | `#BAE6FD` | Default cheerful border (sky-200) | Replace cold gray-100 where safe |
| `--gu-border-strong` | `#7DD3FC` | Focus / selected | Focus ring visible on mobile |
| `--gu-indigo-legacy` | `#4F46E5` / `#EEF2FF` | **Only** where anti-missing asserts indigo register CTA | Do not “fix” these until test updated |
| `--gu-radius-sm` | `0.75rem` (`12px`) | Inputs, small chips | |
| `--gu-radius-md` | `1rem` (`16px`) | Buttons, list rows | Matches current `rounded-xl` |
| `--gu-radius-lg` | `1.25rem` (`20px`) | Cards / panels (`rounded-2xl`) | |
| `--gu-radius-xl` | `1.6rem` | Quiz question bubble (already used) | Keep |
| `--gu-shadow-sm` | `0 1px 2px rgb(14 165 233 / 0.08)` | Inputs | Soft colored shadow, not heavy gray |
| `--gu-shadow-md` | `0 8px 20px -8px rgb(14 165 233 / 0.25)` | Cards / list buttons | |
| `--gu-shadow-pop` | `0 10px 0 #7DD3FC` | Playful “chunky” quiz chrome (optional align with existing violet pop) | Decorative |
| `--gu-space-1` | `4px` | Micro gaps | |
| `--gu-space-2` | `8px` | Icon gaps | |
| `--gu-space-3` | `12px` | Compact stacks | |
| `--gu-space-4` | `16px` | Default padding unit | |
| `--gu-space-5` | `24px` | Section gaps | |
| `--gu-space-6` | `32px` | Screen vertical rhythm | |
| `--gu-type-title` | `1.5rem / 1.3 / 700` (`text-2xl`) | Screen H1 | Chinese: Noto; +0.02em tracking optional |
| `--gu-type-subtitle` | `1rem / 1.6 / 500` | Supporting line under H1 | Muted color |
| `--gu-type-body` | `1rem / 1.7 / 400` | Forms, explanations | Min 16px on mobile |
| `--gu-type-button` | `1rem / 1.2 / 600` | Buttons | Touch-friendly |
| `--gu-type-caption` | `0.75–0.875rem / 1.5 / 500` | Helper / tier chips | Caption ≥ 12px |
| `--gu-type-score` | `2.5–3rem / 1 / 800` | Results score numeral | Baloo for numerals OK |
| `--gu-touch-min` | `44px` | Min tap height | Apply to primary list buttons |

**Font mapping (no new packages):**

| Role | CSS | Notes |
|---|---|---|
| Chinese UI | `var(--font-noto-sans-tc), "PingFang TC", "Microsoft JhengHei", sans-serif` | Already in `layout.tsx` |
| Playful EN / quiz chrome | `var(--font-baloo2), system-ui, sans-serif` | Already used in quiz experience |
| Fallback UI | Geist / system | Avoid new Comic Sans stacks |

---

## C) PAGE-BY-PAGE REDESIGN SPEC

### C1. Student login / entry — `LoginMobileScreen` (+ `RoleSelectScreen`, `StudentSelectScreen`, `SubjectSelectScreen`, `QuestionCountScreen`)

**1. Current UX pain points**
- Visual tone is cool indigo/gray corporate over a playful banana background — brand clash.
- Marketing copy uses Comic Sans fallback stack instead of loaded fonts.
- Entry cards feel flat/admin-like; little game energy before quiz starts.
- Student/subject/count selectors are generic white rows; weak “ready to play” feeling.

**2. Proposed visual changes**
- Screen root: `bg-white/60` → `bg-[color-mix(in_srgb,var(--gu-bg)_70%,transparent)]` or soft wash utility `.gu-screen` using `--gu-bg-wash` at ~55–70% opacity + backdrop blur.
- Titles: apply Noto Sans TC; bump weight; optional 🎯 / ⭐ emoji in subtitles only (not new copy paragraphs).
- Login card: `border-gray-100` → `border-[var(--gu-border)]`; shadow → `--gu-shadow-md`; inputs focus `focus:border-indigo-400` → `focus:border-[var(--gu-border-strong)]` / `focus:ring-2 focus:ring-sky-200`.
- Primary login button enabled state: shift toward sky (`bg-sky-500 hover:bg-sky-600`) for cheer — **except** register CTA (see anti-missing).
- **Register CTA:** keep asserted class substring `mb-4 w-full p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-base font-semibold text-indigo-700` OR update anti-missing test in same change. Prefer: keep substring, optionally append `shadow-sm` already present.
- Share / FAQ marketing block: warm the amber/sky gradients already present; tighten heading contrast; no structural rewrite.
- `RoleSelectScreen` / `StudentSelectScreen` / `SubjectSelectScreen` / `QuestionCountScreen`:
  - List buttons: hover border indigo → sky (`hover:border-sky-300`).
  - Avatar initials circles: keep multi-hue gradients; add `ring-2 ring-white` and selected-feeling hover scale (already `active:scale-[0.98]`).
  - Question count active badge: `from-indigo-400 to-purple-500` → `from-sky-400 to-emerald-400` (style-only).
  - Balance line: keep logic; color `text-indigo-600` → `text-sky-700` + optional ⭐ prefix in existing sentence if copy-safe.

**3. Interaction changes**
- None to validation, WeChat/WhatsApp share, PIN rules, or navigation order.
- Optional: `active:scale-[0.98]` already present — keep.
- Avatar selector (register/add-student Boy/Girl): selected state = thicker ring + `--gu-reward` star badge corner; unselected = muted border. Values remain `"Boy"` / `"Girl"`.

**4. Mobile behavior notes**
- Keep `max-w-sm` / `max-w-md`, `min-h-[100dvh]`, bottom footer safe padding (`pb-24`).
- Touch targets ≥ 44px on role/student/subject/count rows (already ~p-5/p-6 — verify, don’t shrink).
- Do not introduce horizontal scroll.

**5. No-change boundaries**
- `fetch("/api/auth/mobile-login")`, PIN regex, share tracking, WeChat SDK flow, enquiry `mailto:cs@gearupquiz.com` copy.
- Register CTA placement above login card; referral field on register.
- Screen state machine (`login_mobile` → `login_role` → …).

**6. Risk level:** **Low** (style) / **Med** if changing anti-missing-guarded class strings without updating tests.

---

### C2. Quiz in-progress — `StudentQuizExperience` + quiz shell in `page.tsx`

**1. Current UX pain points**
- Already the most game-like surface; slight purple/fuchsia bias vs Phase 1 sky/green/yellow anchors.
- Star progress is good but can feel sparse on 10–20Q; no ring alternative.
- Encouragement row uses rose/violet; readable but slightly “candy” for P6.

**2. Proposed visual changes**
- Retune gradient wash toward sky/mint/cream (reduce purple stop dominance):
  - e.g. `#E0F2FE → #FEF3C7 → #D1FAE5 → #E0F2FE` (keep similar lightness).
- Option palettes: keep A/B/C/D distinct hues; slightly desaturate pink/rose if needed for P5–P6 dignity; preserve strong contrast on labels.
- Question card: keep chunky white border + pop shadow; shift pop shadow color from violet toward sky (`#7DD3FC`) for palette consistency.
- Submit button: keep chunky pressable affordance; retune gradient from fuchsia/violet toward sky/emerald (`from-sky-400 via-sky-500 to-emerald-600`) **only if** motion/press classes preserved.
- Progress: keep `StarProgress`; optionally add a thin determinate bar under stars (`h-2 rounded-full bg-white/50` + filled `%` with `--gu-primary`) — pure presentational from `currentIndex/total`.

**3. Interaction changes**
- No change to submit gating, option select, short-answer, sound toggle behavior.
- Motion: keep existing `AnimatePresence` slide; ensure `prefers-reduced-motion: reduce` maps duration → 0 / opacity-only (add media query or Framer `useReducedMotion`).

**4. Mobile behavior notes**
- Keep sticky submit bar, `max-w-2xl`, `min-h-[calc(100dvh-3.5rem)]`.
- Stars may wrap (`flex-wrap`) — already OK; don’t switch to overflow scroll.
- Preserve `student-quiz-root` user-select none rules in `globals.css`.

**5. No-change boundaries**
- Question content rendering, image URLs, clipboard prevention, RPC submit path, sound localStorage key.
- Do not remove Framer dependency usage already present (no new deps; existing OK).

**6. Risk level:** **Low–Med** (visual regression on option readability; test on real question lengths).

---

### C3. Results page — `ResultsView` (**highest emotional impact**)

**1. Current UX pain points**
- Score block is functional traffic-light coloring but not celebratory.
- Table feels admin/report-like immediately after a game-like quiz.
- Summary banana bubble is charming but score hero lacks badge/motion.
- CTAs already sky-themed — good baseline; anti-missing locks exact classes.

**2. Proposed visual changes**
- Hero score card:
  - Add 🏆 or ⭐ title prefix: e.g. keep text `測驗完成！` and add decorative emoji in a sibling `<span aria-hidden>`.
  - For ≥80%: soft gold/emerald wash + “完成徽章” chip (`⭐ 超棒！`); 60–79%: sky/amber; &lt;60%: keep supportive tone (soft sky, not harsh red wall) while retaining red score numeral semantics for clarity.
  - Optional CSS circular progress ring behind score (SVG `stroke-dashoffset` from `percentage`) — presentational only.
- Summary block: keep “小香蕉的練習小結” + banner image layout; strengthen 📘 label affordance.
- Results table: header `bg-gray-50` → `bg-sky-50`; correct/wrong chips unchanged semantically; zebra rows softer mint/sky.
- Wrong-answer cards: keep red border language (critical UX); slightly rounder / clearer section titles only.
- CTAs: **preserve exact guarded class tokens** on the three buttons (`再做一次`, `回到主畫面`, `登出`) — see patch plan. Visual uplift via parent wrapper spacing/icons already present, not by breaking class assertions.

**3. Interaction changes**
- On mount (once): lightweight badge pop animation (`scale 0.8→1` + opacity) when `percentage >= 60`; skip if reduced motion.
- No changes to `handleReport`, restart, back-to-home (`setScreen("login_role")`), logout.

**4. Mobile behavior notes**
- Keep stacked CTA column (`flex-col sm:flex-row`).
- Banner + summary stack remains; don’t force side-by-side on narrow screens.
- Score numeral remains large (`text-4xl sm:text-5xl`).

**5. No-change boundaries**
- Strings: `錯題解析`, `你的答案（值）`, `正確答案（值）`, `再做一次`, `回到主畫面`, `登出`, report API call.
- Button class substrings asserted in anti-missing tests.
- Score calculation logic.

**6. Risk level:** **Med** (highest visibility + anti-missing class locks). Mitigate by additive markup around guarded nodes.

---

### C4. Account entry visuals — `AccountMenuScreen` (+ light `RoleSelectScreen` account entry)

**1. Current UX pain points**
- Functional but visually disconnected from brighter student path.
- Paid/free tier chip OK; upgrade CTA indigo block is fine for parent trust.

**2. Proposed visual changes**
- Apply `.gu-screen` wash + sky borders on list rows (same as role select).
- Icon circles: keep emoji; optional ring.
- Tier badge: paid stays emerald; free uses sky-gray rather than flat gray.
- Upgrade CTA: keep indigo trust color for payment (parent context) — consistency touch only.

**3. Interaction changes**
- None. Payment history entry, balance, profile, add-student handlers untouched.

**4. Mobile behavior notes**
- Keep `max-w-sm` centered stack.

**5. No-change boundaries**
- `消費紀錄` entry gated on `tierStatus.is_paid`.
- Copy: `查看付款日期、金額及付款方式`.
- `payment_history` screen routing / `/api/payment/history`.

**6. Risk level:** **Low**.

---

## D) COMPONENT-LEVEL PATCH PLAN (minimal diff)

| Component/Area | Change type | Exact intended class/theme adjustments | Estimated touched files | Estimated LOC delta | Regression risk |
|---|---|---|---|---|---|
| `:root` tokens + `.gu-screen`, `.gu-card`, reduced-motion | style-only | Add CSS variables + utility classes in `globals.css`; optional `@media (prefers-reduced-motion: reduce)` killing transitions | `globals.css` | +40–70 | Low |
| Font application on student shells | style-only | Replace Comic Sans stacks with `font-[family-name:var(--font-noto-sans-tc)]` / Baloo where playful | `page.tsx` | ~10–20 | Low |
| `LoginMobileScreen` shell/card/inputs/login btn | style-only | Wash bg; sky borders/shadows; login enabled `bg-sky-500`; **keep register CTA asserted classes** | `page.tsx` | ~25–40 | Low–Med |
| `RoleSelectScreen` / `StudentSelectScreen` / `SubjectSelectScreen` / `QuestionCountScreen` | style-only | `hover:border-sky-300`; count badge sky→emerald gradient; titles Noto | `page.tsx` | ~30–50 | Low |
| Avatar Boy/Girl buttons (Register + AddStudent) | micro-interaction | Selected: `ring-4 ring-sky-300 scale-[1.02]` + optional ⭐; unselected opacity | `page.tsx` | ~15–25 | Low |
| `StudentQuizExperience` palette + progress bar | style-only / micro-layout | Retune gradient/submit/pop shadow; add thin progress bar under stars | `student-quiz-experience.tsx` | ~20–40 | Low–Med |
| Quiz reduced motion | micro-interaction | `useReducedMotion()` → disable x-slide / scale | `student-quiz-experience.tsx` | ~10–15 | Low |
| `ResultsView` hero + ring + badge | micro-layout + micro-interaction | Additive hero badge/ring; table header sky-50; **do not alter guarded CTA class strings** | `page.tsx` | ~40–70 | Med |
| `AccountMenuScreen` | style-only | Borders/hover/tier chip token align | `page.tsx` | ~10–20 | Low |
| Anti-missing tests (only if guarded classes change) | test sync | Update exact class expectations in lockstep | `anti-missing-regressions.test.ts` | 0–15 | Med if skipped |
| `login-add-to-home-button.tsx` | style-only (optional) | Match sky border if login indigo→sky; else leave | `login-add-to-home-button.tsx` | ~5 | Low |
| `layout.tsx` fonts | none preferred | Keep Noto Sans TC + Baloo; **do not add packages**. Optional later: swap TC→HK font | — | 0 | — |

---

## E) IMPLEMENTATION FILE LIST (ordered)

Target **≤ 5–8 files**. Recommended order:

1. **`src/app/globals.css`** — Design tokens, `.gu-screen`, `.gu-card`, focus helpers, reduced-motion kills.
2. **`src/components/student-quiz-experience.tsx`** — Quiz wash, option/submit retune, progress bar, reduced-motion.
3. **`src/app/page.tsx`** — Login/role/student/subject/count, Results hero, Account light polish, avatar selected states. (Largest file; prefer search-replace on class strings inside existing screen functions only.)
4. **`src/components/login-add-to-home-button.tsx`** — Optional border/bg align with login secondary buttons.
5. **`src/lib/anti-missing-regressions.test.ts`** — Only if a guarded class substring must change; update expectations same PR.
6. **`docs/student-ui-revamp-phase1-design-spec.md`** — This spec (reference; not runtime).
7. **`src/app/layout.tsx`** — Touch only if wiring a global class on `body` (prefer not).
8. **Do not touch** API routes, admin/tutor pages, email HTML, payment pages in Phase 1.

---

## F) MOTION & GAMIFICATION SPEC (lightweight)

### Completion badge (Results)
- **When:** `ResultsView` mount AND `percentage >= 60`.
- **What:** Small badge chip near title (`⭐ 完成！` or `🏆 很棒！` for ≥80%).
- **Motion:** `transform: scale(0.85→1)` + `opacity 0→1` over 350ms, `cubic-bezier(0.34,1.56,0.64,1)` once.
- **Fallback:** If `prefers-reduced-motion: reduce`, show badge at full opacity with no scale.

### Progress ring / bar
- **Quiz:** Keep star row; add determinate bar: width = `((currentIndex+1)/total)*100%`, fill `--gu-primary`, track white/50. No animation loop; width transition 200ms OK.
- **Results (optional):** SVG circle around score using `percentage`; animate stroke once 600ms; reduced-motion → static final stroke.

### Avatar selector visual states
- **Idle:** bordered gradient button as today.
- **Selected:** `ring-4 ring-sky-300` + `border-sky-400` + tiny `⭐` absolute top-right (aria-hidden).
- **Pressed:** existing scale-down.
- **Do not** change stored values (`Boy`/`Girl`) or gender RPC mapping.

### Reduced motion fallback requirements
- Disable: option `whileHover`/`whileTap` scales, question x-slide, badge overshoot, ring stroke animation.
- Keep: instant state changes, color changes, static stars/badge visibility.
- Implement via CSS media query on utility transitions **and** Framer `useReducedMotion` where motion components exist.

---

## G) ACCESSIBILITY & READABILITY CHECKLIST

- **Contrast:** Body text `#0F172A` on white ≥ 4.5:1; muted `#475569` on white OK; never place muted text on yellow/amber fills without darkening.
- **Primary buttons:** White label on `#0EA5E9` / `#0284C7` only.
- **Error text:** Keep red-600 on white/50 backgrounds.
- **Minimum text sizes:** Body/inputs ≥ 16px mobile; captions ≥ 12px; score hero ≥ 36px.
- **Touch targets:** Primary actions ≥ 44×44px; list rows keep generous `p-5`/`p-6`.
- **Focus:** Visible `focus:ring-2 focus:ring-sky-300` on inputs/buttons; do not remove outlines without replacement.
- **Chinese density:** Line-height ≥ 1.7 for instructional/summary copy; avoid squeezing FAQ/`leading-7` blocks; do not increase font weight to Black on long Chinese paragraphs (readability drop).
- **Emoji:** Decorative only with `aria-hidden` when adjacent text already conveys meaning.
- **Quiz anti-copy:** Preserve `.student-quiz-root` select-none rules; inputs remain selectable.

---

## H) QA / REGRESSION CHECKLIST (for coding agent)

### Visual checks
- [ ] Login: logo dominant; sky/mint wash; forms readable; register CTA still clearly above form.
- [ ] Role / student / subject / count: cheerful rows; disabled count state still obvious.
- [ ] Quiz: options distinguishable A–D; question card readable; stars + bar match index; submit sticky OK on iPhone SE width.
- [ ] Results: celebration reads for high scores; supportive for low; summary + banner intact; table/wrong cards clear.
- [ ] Account: paid/free chip correct; payment history button only when paid.
- [ ] Desktop + mobile (375 / 390 / 768) screenshots of entry, quiz, results.

### Behavior checks
- [ ] Mobile + PIN validation errors unchanged.
- [ ] Register / referral / privacy modal still work.
- [ ] Start quiz → answer MC + short answer → results.
- [ ] Results: 再做一次 / 回到主畫面 / 登出 navigation unchanged.
- [ ] 反映這題目 → reported state; `/api/send-question-report` still fired.
- [ ] Sound toggle persistence.
- [ ] Share WhatsApp/WeChat + enquiry mailto intact.

### Anti-missing checks likely impacted
- [ ] Run `src/lib/anti-missing-regressions.test.ts` (full suite).
- [ ] Especially: results CTA class strings; register CTA indigo class string; payment history labels; wrong-answer labels; `cs@gearupquiz.com`.
- [ ] If class strings changed intentionally → update test expectations in same commit.

### Explicit rollback trigger conditions
- Rollback Phase 1 UI commit if any of:
  - Anti-missing or release-gate tests fail and cannot be fixed by test-string sync within same PR.
  - Login, quiz submit, or results navigation broken.
  - Payment history missing for paid users / visible for free users incorrectly.
  - Question report or quiz email path regresses.
  - Mobile quiz becomes unscrollable / submit bar covers options.
  - Contrast complaints on yellow/amber text make body unreadable.

---

## I) PHASED DELIVERY PLAN

### Phase 1 (must-have) — independently deployable
- Tokens in `globals.css`.
- Login/entry + role/student/subject/count visual cheer (sky/mint/yellow).
- Quiz palette retune + progress bar + reduced motion.
- Results celebration (badge + optional ring) **without** breaking CTA class guards.
- Account menu light polish.
- Avatar selected-state rings.
- Tests green (anti-missing + existing gates).

### Phase 2 (nice-to-have) — deployable alone after Phase 1
- Stronger avatar illustrations (still Boy/Girl values; image assets from existing storage if available).
- Results confetti-lite CSS particles (reduced-motion off).
- Align `LoginAddToHomeButton` + register secondary surfaces to tokens.
- Replace remaining indigo hovers on non-guarded parent screens.
- Optional Noto Sans **HK** font swap in `layout.tsx` (still no npm package; `next/font/google` only) after TC visual QA.

### Phase 3 (optional polish)
- Extract repeated list-row button classes into tiny local helpers (same file) — only if diffs stay readable.
- Admin/tutor consistency tokens (low priority).
- Motion audit / sound-visual sync (sparkle on correct — only if no scoring logic change).
- Design-token Tailwind `@theme` full migration.

Each phase: style-first, no API/schema changes, pass anti-missing + smoke paths before merge.

---

## Coding agent quick-start (execute Phase 1)

1. Add tokens + `.gu-screen` to `globals.css`.
2. Patch screen root wrappers in `page.tsx` student flows to `gu-screen` (class append, don’t remove `min-h-screen` / context-menu handlers).
3. Retune `student-quiz-experience.tsx` colors + bar + reduced motion.
4. Enhance `ResultsView` hero additively; leave guarded CTA `className` strings intact.
5. Avatar selected styles on Boy/Girl controls.
6. Run vitest anti-missing + manual smoke on login → quiz → results.
7. If a guarded class must change, update `anti-missing-regressions.test.ts` in the same PR and note it in the PR body.
