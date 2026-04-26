# Test plan: 同級排名（家長儀表板）

## 前置

1. 在 **Supabase SQL Editor** 執行 `supabase_grade_level_ranking.sql`（建立表與函數）。
2. 以具 **CRON_SECRET** 的請求手動觸發一次批次，或等每日 cron：
   ```bash
   curl -sS "https://q.hkedutech.com/api/cron-recalculate-averages" \
     -H "Authorization: Bearer <CRON_SECRET>"
   ```
   預期回應含 `"success": true`。
3. 確認表 `student_grade_rankings` 有資料列（`select count(*)`），且 `get_parent_student_grade_rank('<某 student_id>')` 回傳 `has_snapshot: true`。

## 測項

| # | 情境 | 預期 |
|---|------|------|
| 1 | 學生累積 **&lt; 100** 題 | 家長儀表板顯示「完成累積 100 題…」、**假圖表＋**「學生完成100題練習後…」**遮罩** |
| 2 | 學生 **≥ 100** 題，同級**僅 1 人**符合 | 顯示排第 1/1、紅黃綠條＋**箭咀約在中間**；說明文字有「最近 10 次…」及更新時間（若有） |
| 3 | 學生 **≥ 100** 題，多於 1 人可排名 | 句子為 **「&lt;姓名&gt; 在同級活躍用戶中排第 n 名（共 m 人）」**；箭咀位置在左（排名較後）至右（排名較前） |
| 4 | 無快照 / RPC 尚未部署 | 顯示**琥珀色**短提示「暫無同級排名…」，不崩潰 |
| 5 | 切換月份 / 科目 | 同級排程**不隨**月份變；重新載入後排名資料仍一致 |
| 6 | 切換學生（多子女） | 顯示對應學生之排名，內容有別 |

## 迴歸

- 家長清單、月曆、圖表、**ContactFooter** 等既有區塊仍正常顯示。
- 現有 `recalculate_grade_averages` 仍隨同一次 cron 執行成功。

## 通過條件

- 上表 1–3 在 staging / production 目視通過，6 迴歸無阻斷錯誤。
