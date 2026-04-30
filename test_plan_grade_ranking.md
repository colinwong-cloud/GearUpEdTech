# Test plan: 同級排名（家長儀表板，按科目）

## 前置

1. 在 **Supabase SQL Editor** 執行 **`supabase_grade_ranking_per_subject.sql`**（加入 `student_grade_rankings.subject`、改 UNIQUE、重寫批次與 `get_parent_student_grade_rank(uuid, text)`）。**會清空現有排名列**。
2. 執行一次 **`select recalculate_student_grade_rankings();`**（或等每日 cron）。
3. 確認表有資料：`select subject, count(*) from student_grade_rankings group by subject;`
4. 確認 RPC：`select get_parent_student_grade_rank('<student_uuid>'::uuid, 'Math');` 與 `'Chinese'`、`'English'` 回傳 `has_snapshot` / `subject` 一致。

## 測項

| # | 情境 | 預期 |
|---|------|------|
| 1 | 學生在 **某科目**累積 **&lt; 100** 題 | 該科目分頁顯示「完成累積 100 題…」、假圖表遮罩；**其他科目**分頁可能已可排名（各自 100 題門檻） |
| 2 | 某科目 **≥ 100** 題，同級僅 1 人符合 | 該科目：排第 1/1、箭咀約中間；說明含「該科目」「最近 10 次」 |
| 3 | 某科目 **≥ 100** 題，多人可排名 | 句子「排第 n 名（共 m 人）」；箭咀隨名次 |
| 4 | 無快照 / 尚未跑批次 | `has_snapshot: false`，琥珀色提示 |
| 5 | 切換科目分頁（數學 / 中文 / 英文） | **排名區塊隨科目變**（與下方列表、趨勢圖同一科目） |
| 6 | 切換學生（多子女） | 顯示對應學生該科目之排名 |

## 迴歸

- 家長清單、月曆、圖表、ContactFooter 正常。
- `recalculate_grade_averages` 仍隨同一次 cron 成功。

## 通過條件

- 上表 1–3、5 在目標環境目視通過；迴歸無阻斷錯誤。
