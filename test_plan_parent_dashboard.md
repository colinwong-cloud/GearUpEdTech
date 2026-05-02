# Test Plan: Parent Dashboard Data Display

## Context

This test plan validates the parent dashboard at https://q.hkedutech.com for correct display of practice results, charts, and question balance deduction.

**Test Account:**
- Mobile: `91917838`
- Students: `Loklok` and `Heihei`
- The account already exists in Supabase

**Tech Stack:**
- Frontend: Next.js deployed on Vercel
- Backend: Supabase (PostgreSQL) with RPC functions
- All database writes go through SECURITY DEFINER RPC functions

**Environment Variables Required:**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key

---

## Part 1: Insert Test Data

Use the Supabase JS client to insert test quiz sessions and answers. All inserts must go through RPC functions (direct table inserts will be blocked by RLS).

### Step 1.1: Find Student IDs

```javascript
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.rpc('login_by_mobile', { p_mobile_number: '91917838' });
// data.students is an array — find the IDs for Loklok and Heihei
// Save these IDs for subsequent steps
```

Record the student IDs as `LOKLOK_ID` and `HEIHEI_ID`.

### Step 1.2: Check Current Balance

```javascript
const { data: lokBal } = await sb.rpc('get_student_balance', { p_student_id: LOKLOK_ID, p_subject: '數學' });
const { data: heiBal } = await sb.rpc('get_student_balance', { p_student_id: HEIHEI_ID, p_subject: '數學' });
```

Record opening balances as `LOKLOK_OPENING_BAL` and `HEIHEI_OPENING_BAL`.

### Step 1.3: Insert 8 Practice Sessions for Loklok

Create 8 sessions spread across different dates and times this month, with varying scores to test the color scheme. Each session has 10 questions.

For each session below, execute these steps:
1. Create a quiz session via RPC
2. Fetch 10 random questions from the questions table (filtered by grade_level matching Loklok's grade)
3. Insert answers via RPC with the specified correct/incorrect pattern
4. Update the session score via RPC
5. Deduct balance via RPC

**Session data for Loklok (10 questions each):**

| Session # | Target Score | Correct Rate | Expected Bar Color |
|-----------|-------------|--------------|-------------------|
| 1 | 9/10 | 90% | Green (≥80%) |
| 2 | 8/10 | 80% | Green (≥80%) |
| 3 | 7/10 | 70% | Amber (≥60%) |
| 4 | 6/10 | 60% | Amber (≥60%) |
| 5 | 5/10 | 50% | Red (<60%) |
| 6 | 3/10 | 30% | Red (<60%) |
| 7 | 10/10 | 100% | Green (≥80%) |
| 8 | 4/10 | 40% | Red (<60%) |

**Implementation for each session:**

```javascript
// 1. Create session
const { data: session } = await sb.rpc('create_quiz_session', {
  p_student_id: LOKLOK_ID,
  p_subject: '數學'
});
const sessionId = session.id;

// 2. Fetch 10 questions (use student's grade_level)
const { data: questions } = await sb.from('questions')
  .select('id, correct_answer')
  .eq('grade_level', LOKLOK_GRADE)  // e.g. 'P5'
  .limit(10);

// 3. Submit answers — first N correct, rest incorrect
const targetScore = 9; // varies per session
for (let i = 0; i < questions.length; i++) {
  const isCorrect = i < targetScore;
  await sb.rpc('submit_answer', {
    p_session_id: sessionId,
    p_question_id: questions[i].id,
    p_student_answer: isCorrect ? questions[i].correct_answer : 'X',
    p_is_correct: isCorrect,
    p_question_order: i + 1
  });
}

// 4. Update session
await sb.rpc('update_quiz_session', {
  p_session_id: sessionId,
  p_questions_attempted: 10,
  p_score: targetScore,
  p_time_spent_seconds: Math.floor(Math.random() * 120) + 30
});

// 5. Deduct balance (need balance ID first)
const { data: bal } = await sb.rpc('get_student_balance', {
  p_student_id: LOKLOK_ID,
  p_subject: '數學'
});
if (bal) {
  await sb.rpc('deduct_student_balance', {
    p_balance_id: bal.id,
    p_amount: 10,
    p_session_id: sessionId
  });
}
```

### Step 1.4: Insert 4 Practice Sessions for Heihei

| Session # | Target Score | Correct Rate | Expected Bar Color |
|-----------|-------------|--------------|-------------------|
| 1 | 2/10 | 20% | Red (<60%) |
| 2 | 6/10 | 60% | Amber (≥60%) |
| 3 | 9/10 | 90% | Green (≥80%) |
| 4 | 7/10 | 70% | Amber (≥60%) |

Use the same implementation pattern as Step 1.3 but with `HEIHEI_ID` and Heihei's grade level.

### Step 1.5: Insert 2 Same-Day Sessions for Loklok

Create 2 additional sessions for Loklok to verify same-day multiple bar display:

| Session # | Target Score | Note |
|-----------|-------------|------|
| 9 | 8/10 | Same day as session 10 |
| 10 | 3/10 | Same day as session 9 |

These two sessions should be created in rapid succession (no delay) so they share the same date.

---

## Part 2: Validate Parent Dashboard Display

### Step 2.1: Verify Balance Deduction

After all data insertion, check balances:

```javascript
const { data: lokBalAfter } = await sb.rpc('get_student_balance', { p_student_id: LOKLOK_ID, p_subject: '數學' });
const { data: heiBalAfter } = await sb.rpc('get_student_balance', { p_student_id: HEIHEI_ID, p_subject: '數學' });
```

**Expected results:**
- Loklok: `LOKLOK_OPENING_BAL - 100` (10 sessions × 10 questions)
- Heihei: `HEIHEI_OPENING_BAL - 40` (4 sessions × 10 questions)

### Step 2.2: Verify Chart Data via RPC

```javascript
const { data: lokChart } = await sb.rpc('get_student_chart_data', { p_student_id: LOKLOK_ID });
const { data: heiChart } = await sb.rpc('get_student_chart_data', { p_student_id: HEIHEI_ID });
```

**Validate for Loklok (`lokChart`):**
- `lokChart.sessions` should contain at least 10 entries (8 + 2 same-day)
- Each session should have `correct_pct` matching the expected rates:
  - 90%, 80%, 70%, 60%, 50%, 30%, 100%, 40%, 80%, 30%
- `lokChart.type_sessions` should have entries grouped by question_type

**Validate for Heihei (`heiChart`):**
- `heiChart.sessions` should contain at least 4 entries
- Correct rates: 20%, 60%, 90%, 70%

### Step 2.3: Verify Balance Transaction History

```javascript
const now = new Date();
const { data: lokTx } = await sb.rpc('get_balance_transactions', {
  p_student_id: LOKLOK_ID,
  p_subject: '數學',
  p_year: now.getFullYear(),
  p_month: now.getMonth() + 1
});
```

**Validate:**
- `lokTx.transactions` should include 10 entries with `change_amount: -10` and `description: '完成練習扣除'`
- `lokTx.current_balance` should equal `LOKLOK_OPENING_BAL - 100`
- Each transaction should have a valid `session_id`

### Step 2.4: Verify Monthly Session List

```javascript
const { data: lokSessions } = await sb.rpc('get_parent_sessions', {
  p_student_id: LOKLOK_ID,
  p_subject: '數學',
  p_year: now.getFullYear(),
  p_month: now.getMonth() + 1
});
```

**Validate:**
- Should return at least 10 session summaries
- Each should have `questions_attempted: 10`
- Scores should match: 9, 8, 7, 6, 5, 3, 10, 4, 8, 3

---

## Part 3: Visual Validation Checklist

These items should be checked by visiting https://q.hkedutech.com and logging in with mobile `91917838`:

1. **Login** — Enter mobile `91917838` + password. Select 家長 role.
2. **Student selector** — Should show both Loklok and Heihei (since there are 2 students).
3. **Select Loklok** — Dashboard should load.

### Chart Validation (Loklok):
- [ ] Overall chart shows 10 bars (including the pre-existing sessions)
- [ ] Bar colors: green bars for 90%, 80%, 100%, 80% sessions; amber for 70%, 60%; red for 50%, 30%, 40%, 30%
- [ ] Hovering each bar shows correct date/time and percentage
- [ ] The two same-day bars appear next to each other with the same date label on x-axis
- [ ] Remark text visible: "如同一天多於一次練習，則會有多個棒型以同一日標示。"
- [ ] If grade averages are calculated, amber dashed reference line appears

### Balance Validation (Loklok):
- [ ] Balance card at top shows correct remaining balance
- [ ] Expandable "題目餘額變動記錄" section shows all deductions
- [ ] Each transaction shows date, "完成練習扣除", -10, and running balance

### Session Grid Validation (Loklok):
- [ ] Session cards show in 3-column grid
- [ ] Each card shows date, score (e.g., 9/10), and percentage
- [ ] Clicking a card and pressing "查看詳情" shows the session detail
- [ ] Session detail shows the compact answer table and wrong answer analysis

### Switch to Heihei:
- [ ] Go back and select Heihei
- [ ] Chart shows 4 bars with correct colors (red, amber, green, amber)
- [ ] Balance reflects Heihei's deductions
- [ ] Session cards show 4 entries

---

## Part 4: Cleanup (Optional)

If test data needs to be removed after validation, use the admin console at https://q.hkedutech.com/admin (login: colinwong / qweasd). **Do NOT delete the parent account** — only note that test sessions exist for future reference.

---

## Summary of Expected Outcomes

| Check | Expected |
|-------|----------|
| Loklok sessions created | 10 |
| Heihei sessions created | 4 |
| Loklok balance deducted | -100 |
| Heihei balance deducted | -40 |
| Chart bar colors correct | Green ≥80%, Amber ≥60%, Red <60% |
| Same-day bars distinct | Each bar has own tooltip data |
| Balance transactions logged | 10 for Loklok, 4 for Heihei |
| Student selector appears | Yes (2 students) |
