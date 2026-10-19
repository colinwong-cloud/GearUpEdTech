# Developer Handoff Patch Spec — Student UI Revamp Phase 1

**Purpose:** Execute-only patch instructions for a coding agent. Style/micro-layout/micro-interaction only.  
**Companion:** `docs/student-ui-revamp-phase1-design-spec.md` (design rationale).  
**Hard rule:** Prefer additive class changes. Never change handlers, RPC calls, screen state machine, or API contracts.

---

## 1) Exact file edit order

| Step | File | Why this order |
|---|---|---|
| **1** | `src/app/globals.css` | Land tokens + reusable utilities first so later TSX can reference them. |
| **2** | `src/components/student-quiz-experience.tsx` | Isolated quiz surface; validates token/motion approach before touching mega-file. |
| **3** | `src/app/page.tsx` | Main student screens (login → selectors → results → account). Largest diff; do last among runtime UI. |
| **4** | `src/components/login-add-to-home-button.tsx` | Optional consistency only; skip if LOC budget tight. |
| **5** | `src/lib/anti-missing-regressions.test.ts` | **Only if** a guarded class substring must change. Prefer zero edits here. |
| — | **Do not edit** | Any `src/app/api/**`, `admin/**`, `tutor/**`, `layout.tsx`, email routes, payment pages. |

**Max files touched:** **4 runtime files** preferred; **5 absolute max** (adds anti-missing test only when forced).  
**Spec docs** (`docs/*`) do not count against the runtime budget.

---

## 2) Per-edit before → after (class/style intent)

### Edit 1 — `src/app/globals.css`

#### 1A. Add design tokens under `:root`

| Before | After (intent) |
|---|---|
| Only `--background: #ffffff; --foreground: #171717;` | Keep those. **Append** Phase 1 tokens: `--gu-primary:#0EA5E9`, `--gu-primary-strong:#0284C7`, `--gu-secondary:#34D399`, `--gu-success:#059669`, `--gu-warning:#F59E0B`, `--gu-reward:#FBBF24`, `--gu-text:#0F172A`, `--gu-text-muted:#475569`, `--gu-bg:#F0F9FF`, `--gu-border:#BAE6FD`, `--gu-border-strong:#7DD3FC`, `--gu-surface:#FFFFFF`, `--gu-bg-wash: linear-gradient(160deg,#E0F2FE 0%,#ECFDF5 45%,#FEF9C3 100%)`. |

#### 1B. Add utility classes (end of file)

| Before | After (intent) |
|---|---|
| No `.gu-*` utilities | Add: |
| | `.gu-screen { background-image: var(--gu-bg-wash); background-color: color-mix(in srgb, var(--gu-bg) 55%, transparent); }` — use **in addition to** existing `backdrop-blur-sm`, not as a full layout rewrite. |
| | `.gu-card { border-color: var(--gu-border); box-shadow: 0 8px 20px -8px rgb(14 165 233 / 0.25); }` |
| | `@media (prefers-reduced-motion: reduce) { .gu-motion-safe, .gu-motion-safe * { animation: none !important; transition: none !important; } }` |

**LOC budget this file:** ≤ **70** net lines.

---

### Edit 2 — `src/components/student-quiz-experience.tsx`

#### 2A. Root wash gradient

| Before | After |
|---|---|
| `linear-gradient(150deg, #ffecf2 0%, #fef3c7 18%, #dbeafe 40%, #f3e8ff 62%, #d1fae5 100%)` | `linear-gradient(150deg, #E0F2FE 0%, #FEF3C7 28%, #D1FAE5 62%, #E0F2FE 100%)` (sky → cream → mint; less purple/pink) |

#### 2B. Encouragement text colors

| Before | After |
|---|---|
| `text-rose-600/90` + inner `text-violet-800` | `text-sky-700/90` + inner `text-emerald-800` |

#### 2C. Question card

| Before | After |
|---|---|
| `from-fuchsia-50/98 via-white to-amber-50/95` + `shadow-[0_10px_0_#e9d5ff]` | `from-sky-50/98 via-white to-amber-50/95` + `shadow-[0_10px_0_#7DD3FC]` |

#### 2D. Short-answer focus border

| Before | After |
|---|---|
| filled state `border-fuchsia-300` | `border-sky-300` |

#### 2E. Sticky submit bar + button

| Before | After |
|---|---|
| bar `from-amber-50/90 to-rose-50/95` | `from-amber-50/90 to-sky-50/95` |
| enabled btn `from-fuchsia-400 via-violet-500 to-indigo-600` + `shadow-[0_4px_0_#7c3aed]` + `border-violet-700/30` | `from-sky-400 via-sky-500 to-emerald-600` + `shadow-[0_4px_0_#0284C7]` + `border-sky-700/30` |
| disabled path | **unchanged** (`bg-slate-300/90…`) |

#### 2F. Progress bar (additive micro-layout)

| Before | After |
|---|---|
| Only `<StarProgress />` inside `mb-2` wrapper | Keep stars. **Below stars**, add: track `h-2 w-full rounded-full bg-white/50 overflow-hidden`; fill `h-full rounded-full bg-sky-500 transition-[width] duration-200` with `style={{ width: \`${((currentIndex+1)/totalQuestions)*100}%\` }}`; `role="progressbar"` + `aria-valuenow/min/max`. |

#### 2G. Reduced motion (micro-interaction)

| Before | After |
|---|---|
| Always `whileHover`/`whileTap` scales; slide `x: ±28` | Import/use Framer `useReducedMotion()`. If reduced: no hover/tap motion; question transition `{ opacity: 0/1 }` only (no x). Wrap motion-prone nodes with class `gu-motion-safe` optionally. |

**Do not change:** `OPTION_STYLES` keys A–D (keep distinct hues; optional ±5% saturation only if needed), props API, sound helpers, `ENCOURAGE` copy strings, submit gating.

**LOC budget this file:** ≤ **55** net lines.

---

### Edit 3 — `src/app/page.tsx` (ordered sub-edits)

Apply **only** inside listed functions. Do not refactor extractions.

#### 3A. `LoginMobileScreen` (~L1815+)

| Target | Before | After |
|---|---|---|
| Root | `relative min-h-[100dvh] bg-white/60 backdrop-blur-sm` | `relative min-h-[100dvh] gu-screen bg-white/50 backdrop-blur-sm` |
| Marketing p1 font | `font-['Comic_Sans_MS','Chalkboard_SE','Trebuchet_MS','PingFang_TC','Microsoft_JhengHei',sans-serif]` + `text-indigo-700` | `font-[family-name:var(--font-noto-sans-tc)]` + `text-sky-800` |
| Marketing p2 font | same Comic Sans stack + `text-gray-600` | Noto stack + `text-slate-600` |
| **Register CTA** | `mb-4 w-full p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-base font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 transition-colors shadow-sm` | **NO CHANGE** to the asserted prefix `mb-4 w-full p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-base font-semibold text-indigo-700` (hover classes may stay). |
| Login card | `bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4` | `bg-white rounded-2xl shadow-lg border border-sky-100 gu-card p-6 space-y-4` |
| Inputs focus | `focus:border-indigo-400` | `focus:border-sky-400 focus:ring-2 focus:ring-sky-200` |
| Login enabled | `bg-indigo-600 text-white hover:bg-indigo-700 shadow-md` | `bg-sky-500 text-white hover:bg-sky-600 shadow-md` |
| Forgot link | `text-indigo-500 hover:text-indigo-700` | `text-sky-600 hover:text-sky-800` |
| Enquiry block | `border-indigo-100 bg-indigo-50/70` + `text-indigo-700` | `border-sky-100 bg-sky-50/70` + `text-sky-800` — **keep** exact copy `有問題或意見？歡迎電郵至` and `mailto:cs@gearupquiz.com` |

#### 3B. `RoleSelectScreen`

| Target | Before | After |
|---|---|---|
| Root | `min-h-screen bg-white/60 backdrop-blur-sm …` | append `gu-screen`; soften to `bg-white/50` |
| List row hover | `hover:border-indigo-300` | `hover:border-sky-300` |
| Student icon circle | `from-indigo-400 to-purple-500` | `from-sky-400 to-emerald-500` |
| Upgrade CTA (free) | indigo border/bg classes | **keep indigo** (parent trust / payment cue) |

#### 3C. `StudentSelectScreen` / `SubjectSelectScreen` / `QuestionCountScreen`

| Target | Before | After |
|---|---|---|
| Root | `bg-white/60` | `gu-screen bg-white/50` |
| Row hover | `hover:border-indigo-300` | `hover:border-sky-300` |
| Title | `text-2xl font-bold text-gray-900` | add `font-[family-name:var(--font-noto-sans-tc)]` |
| Count badge (enabled) | `from-indigo-400 to-purple-500` | `from-sky-400 to-emerald-500` |
| Balance line | `text-indigo-600` | `text-sky-700` |
| Avatar initial colors array | keep multi-hue | optional: swap first slot indigo/purple → sky/emerald only |

#### 3D. Avatar selectors (`RegisterScreen` + AddStudent equivalent ~Boy/Girl buttons)

| Target | Before | After |
|---|---|---|
| Selected | `border-indigo-500 bg-gradient-to-br ${a.gradient} text-white shadow-md` | `border-sky-500 ring-4 ring-sky-300 bg-gradient-to-br ${a.gradient} text-white shadow-md relative` + optional child `<span aria-hidden className="absolute -top-1 -right-1 text-sm">⭐</span>` |
| Unselected | `border-gray-200 … hover:border-indigo-300` | `border-gray-200 … hover:border-sky-300` |
| `avatars` values | `"Boy"` / `"Girl"` | **unchanged** |
| Gradients on avatar defs | `from-blue-400 to-indigo-500` / pink-rose | OK to keep or nudge blue→sky; **do not** change `value` |

#### 3E. `ResultsView` (~L2867+)

| Target | Before | After |
|---|---|---|
| Root | `min-h-screen bg-white/60 backdrop-blur-sm` | `min-h-screen gu-screen bg-white/50 backdrop-blur-sm` |
| Score hero container | ``text-center p-6 sm:p-8 rounded-2xl border-2 ${scoreBg} mb-8`` | Keep scoreBg logic. **Inside**, before `<h1>測驗完成！</h1>`, add decorative badge row (see below). Optional: wrap score numeral in relative container + SVG ring. |
| Title | `<h1 …>測驗完成！</h1>` | Keep exact text node `測驗完成！`. Add sibling `<span aria-hidden>` with 🏆/⭐ by band **outside** or inside heading without removing the Chinese string. |
| Badge (additive) | none | If `percentage >= 80`: chip `⭐ 超棒！`; elif `>= 60`: `⭐ 完成！`; else omit motion badge (optional calm `繼續加油` chip without bounce). Classes: `inline-flex … rounded-full bg-amber-100 text-amber-900 text-sm font-bold px-3 py-1 mb-2 gu-motion-safe`. Animate once via CSS `@keyframes gu-pop` or Framer; respect reduced motion. |
| Progress ring (optional additive) | none | SVG circle behind `{score} / {total}`; stroke uses percentage; `aria-hidden`. |
| Table thead | `bg-gray-50 border-b border-gray-200` | `bg-sky-50 border-b border-sky-100` |
| Summary label | `小香蕉的練習小結` | keep text; optional prefix `📘 ` in a decorative span |
| **CTA 再做一次** | must still contain substring `px-8 py-3.5` and `bg-sky-500 text-white font-semibold rounded-xl` | **NO CLASS TOKEN SURGERY** on those substrings |
| **CTA 回到主畫面** | must contain `bg-white text-sky-700 font-semibold rounded-xl border border-sky-200` | **NO CHANGE** to that substring |
| **CTA 登出** | must contain `bg-sky-50 text-sky-700 font-semibold rounded-xl border border-sky-200` | **NO CHANGE** to that substring |

#### 3F. `AccountMenuScreen`

| Target | Before | After |
|---|---|---|
| Root | `bg-white/60` | `gu-screen bg-white/50` |
| Row hover | `hover:border-indigo-300` | `hover:border-sky-300` |
| Free tier chip | `bg-gray-100 text-gray-700` | `bg-sky-50 text-slate-700` |
| Paid tier / upgrade indigo | emerald / indigo blocks | **keep** (paid semantics + upgrade trust) |
| `消費紀錄` button | entire block | **structure/copy unchanged**; hover border only |

**LOC budget `page.tsx`:** ≤ **180** net lines (prefer ≤150). No new helper files.

---

### Edit 4 — `src/components/login-add-to-home-button.tsx` (optional)

| Before | After |
|---|---|
| `border-2 border-indigo-200 bg-indigo-50/90 … text-indigo-900 … hover:bg-indigo-100` | `border-2 border-sky-200 bg-sky-50/90 … text-sky-900 … hover:bg-sky-100` |

Skip if Step 3 already at LOC budget.

**LOC budget:** ≤ **8** lines.

---

### Edit 5 — `src/lib/anti-missing-regressions.test.ts` (avoid)

| Rule | Action |
|---|---|
| Default | **Do not edit.** |
| Only if a guarded substring was inevitably changed | Update the matching `expect(…).toContain(…)` in the **same commit**. |
| Never weaken | Do not delete assertions for wrong-answer labels, payment history, mailto, referral, results CTAs. |

---

## 3) No-change guardrails per file

### `src/app/globals.css`
- Do **not** remove `user-select` rules for `body`, `.student-quiz-root`, or `.admin-console-root`.
- Do **not** change `@import "tailwindcss"` or delete `:root --background/--foreground`.
- Do **not** add npm/CSS framework imports.

### `src/components/student-quiz-experience.tsx`
- Do **not** change exported function signatures / props.
- Do **not** change sound localStorage key, `playClickSound`, option key mapping, or submit button visibility logic.
- Do **not** add dependencies (Framer already used — OK).
- Do **not** alter question content / image rendering behavior.

### `src/app/page.tsx`
- Do **not** change `AppScreen` union, screen transitions, auth/register/fetch calls, RPC names, or validation regexes.
- Do **not** move/remove register CTA from above the login card.
- Do **not** alter results actions (`onRestart`, `onBackToHome` → `login_role`, `onLogout`, `handleReport`).
- Do **not** remove strings: `錯題解析`, `你的答案（值）`, `正確答案（值）`, `再做一次`, `回到主畫面`, `登出`, `消費紀錄`, `查看付款日期、金額及付款方式`, `負責教師編號（選填）`, `有問題或意見？歡迎電郵至`, `cs@gearupquiz.com`.
- Do **not** change paid-only gating for payment history.
- Do **not** edit admin/tutor/parent-report deep screens beyond accidental shared class greps — **scope Phase 1 student path only** (login_mobile, login_role, login_student, subject/count, quiz shell, results, account menu). Leave ProfileEdit / Payment / Parent dashboard indigo CTAs alone unless a one-line hover is unavoidable (prefer leave).

### `src/components/login-add-to-home-button.tsx`
- Do **not** change install/`beforeinstallprompt` logic or tip modal copy structure.

### `src/lib/anti-missing-regressions.test.ts`
- Do **not** remove or soften assertions.

### Global forbidden
- No new npm packages.
- No API/route/schema edits.
- No IA/routing redesign.
- No Broad component extractions from `page.tsx` in Phase 1.

---

## 4) Max allowed touched files and LOC budget

| Metric | Budget |
|---|---|
| Max runtime files | **4** preferred (`globals.css`, `student-quiz-experience.tsx`, `page.tsx`, optional `login-add-to-home-button.tsx`) |
| Absolute max runtime + test | **5** (only if anti-missing must sync) |
| `globals.css` | ≤ **70** LOC net |
| `student-quiz-experience.tsx` | ≤ **55** LOC net |
| `page.tsx` | ≤ **180** LOC net (target ≤150) |
| `login-add-to-home-button.tsx` | ≤ **8** LOC net |
| `anti-missing-regressions.test.ts` | **0** preferred; ≤ **15** if forced |
| **Total net LOC** | ≤ **300** (hard cap **350**) |

If over budget: drop optional Results SVG ring, drop add-to-home polish, keep badge as static chip without animation.

---

## 5) Top 10 regression risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Anti-missing fails on register CTA class substring | Never edit the asserted indigo register class prefix; run `vitest src/lib/anti-missing-regressions.test.ts` before push. |
| 2 | Anti-missing fails on results CTA class substrings | Do not rewrite 再做一次/回到主畫面/登出 `className`s; celebrate via hero-only additive DOM. |
| 3 | Login broken / PIN validation regresses | Touch classes only; leave `PIN_RE`, `canLogin`, `onSubmit` intact; smoke login with valid/invalid PIN. |
| 4 | Quiz submit / last-question flow breaks | No prop/handler changes in `StudentQuizExperience`; smoke MC + short-answer + last question. |
| 5 | Results navigation (`login_role` / restart / logout) breaks | Do not touch `onClick={onRestart|onBackToHome|onLogout}` or `handleBackToHome`. |
| 6 | Question report path silently dies | Do not touch `handleReport` / `fetch("/api/send-question-report"`. |
| 7 | Payment history entry disappears or shows for free users | Do not alter `{tierStatus.is_paid && (…消費紀錄…)}` condition or labels. |
| 8 | Mobile quiz: sticky submit covers options / stars overflow | Keep existing padding/sticky structure; test 375px width; progress bar must be `w-full` under stars, not beside. |
| 9 | Reduced-motion users get stuck animations / vestibular issue | Gate Framer with `useReducedMotion`; CSS kill switch `.gu-motion-safe`. |
| 10 | Contrast fail on yellow/amber chips or sky-tinted text | Body text stays slate/sky-800+; amber chips use `text-amber-900`; never `text-warning` yellow on white for small copy. |

---

## 6) Final acceptance checklist for preview approval

### A. Automated
- [ ] `vitest` anti-missing suite green
- [ ] No new dependencies in `package.json`
- [ ] Diff file count ≤ 5 runtime/test files; LOC within budget
- [ ] Grep confirms guarded substrings still present in `page.tsx`:
  - [ ] `mb-4 w-full p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-base font-semibold text-indigo-700`
  - [ ] `bg-sky-500 text-white font-semibold rounded-xl`
  - [ ] `bg-white text-sky-700 font-semibold rounded-xl border border-sky-200`
  - [ ] `bg-sky-50 text-sky-700 font-semibold rounded-xl border border-sky-200`
  - [ ] `錯題解析` / `你的答案（值）` / `正確答案（值）`
  - [ ] `消費紀錄` / `查看付款日期、金額及付款方式`
  - [ ] `cs@gearupquiz.com`

### B. Preview — visual (mobile 375 + desktop 1280)
- [ ] **Login:** brighter wash; logo still hero; Noto (not Comic Sans); register CTA still indigo & above form; login button sky
- [ ] **Role / student / subject / count:** sky hovers; cheerful but not childish; disabled 題數 still clear
- [ ] **Quiz:** sky/mint wash; chunky card; stars + progress bar synced to index; options readable; submit sky/emerald
- [ ] **Results:** celebration badge for ≥60; score/summary/banner intact; table softer; wrong cards still red-clear
- [ ] **Account:** light polish only; paid/free + payment history gating correct

### C. Preview — behavior smoke
- [ ] Login success → role select
- [ ] Student → subject → count → quiz answer → results
- [ ] Results: 再做一次 / 回到主畫面 / 登出 each works
- [ ] Wrong answer: 反映這題目 → 已反映
- [ ] Free vs paid: 消費紀錄 visibility correct
- [ ] Sound toggle persists across question
- [ ] `prefers-reduced-motion: reduce` → no slide/bounce (badge static OK)

### D. Explicit preview rejection criteria (fail approval)
- Reject if any anti-missing assertion fails
- Reject if any auth/quiz/results/payment-history behavior changed
- Reject if register CTA moved or lost indigo asserted classes
- Reject if results CTAs lost guarded class tokens
- Reject if UI feels preschool (oversized pastel blobs, baby copy) or loses P5–P6 dignity
- Reject if mobile quiz cannot complete without scroll/tap bugs

### E. Approver sign-off line
- [ ] Design preview approved for merge to staging  
- Approver: _______________ Date: _______________

---

## Coding agent execution recipe (copy/paste)

```text
1. Edit globals.css — tokens + .gu-screen + .gu-card + reduced-motion
2. Edit student-quiz-experience.tsx — wash, card, submit, bar, useReducedMotion
3. Edit page.tsx ONLY in: LoginMobileScreen, RoleSelectScreen, StudentSelectScreen,
   SubjectSelectScreen, QuestionCountScreen, Register/AddStudent avatar buttons,
   ResultsView (additive hero), AccountMenuScreen
4. Optionally polish login-add-to-home-button.tsx
5. Run vitest anti-missing; fix only by reverting guarded class edits
6. Stop if total net LOC > 300 without dropping optional ring/animation
```
