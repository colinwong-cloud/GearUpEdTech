"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessKpiSection } from "./business-kpi";
import {
  buildPaidTransactionsCsv,
  getCurrentHktMonthKey,
  type PaidTransactionAuditRow,
} from "@/lib/admin-paid-summary";

type AdminConsoleAction =
  | "search_parent"
  | "add_quota"
  | "delete_parent"
  | "get_settings"
  | "set_setting"
  | "set_email_notification"
  | "search_questions"
  | "update_question"
  | "parent_students_practice_summary"
  | "grade_level_practice_frequency_summary"
  | "discount_code_list"
  | "discount_code_create"
  | "discount_code_update"
  | "discount_code_delete"
  | "discount_code_usage_summary"
  | "tutor_referral_code_create"
  | "tutor_referral_code_summary"
  | "tutor_referral_code_usage_details"
  | "tutor_referral_password_reset"
  | "payment_status_enquiry"
  | "payment_recurring_monitor_summary"
  | "payment_monthly_paid_summary"
  | "payment_cancel_future_payment"
  | "payment_refund_last_preview"
  | "payment_refund_last_confirm";

async function adminConsoleRequest<T>(
  action: AdminConsoleAction,
  payload?: Record<string, unknown>,
  sessionToken?: string
): Promise<T> {
  const res = await fetch("/api/admin/console", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    ...(sessionToken
      ? {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      : {}),
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) {
    throw new Error(body.error || "操作失敗");
  }
  return body.data as T;
}

type Tab =
  | "quota"
  | "delete"
  | "email"
  | "questions"
  | "business"
  | "discount_codes"
  | "tutor_referral_codes"
  | "payment_status"
  | "student_practice_summary";

interface StudentInfo {
  student: { id: string; student_name: string; grade_level: string };
  balances: { id: string; subject: string; remaining_questions: number }[];
}

interface ParentInfo {
  parent: { id: string; mobile_number: string; email: string | null; parent_name: string | null };
  students: StudentInfo[];
}

interface QuestionResult {
  id: string;
  subject: string;
  question_type: string;
  paper_rank: string;
  grade_level: string;
  content: string;
  opt_a: string | null;
  opt_b: string | null;
  opt_c: string | null;
  opt_d: string | null;
  correct_answer: string;
  explanation: string | null;
  image_url: string | null;
}

interface DiscountCodeRecord {
  id: string;
  code: string;
  discount_percent: number;
  salesperson: string;
  is_active: boolean;
  created_at: string;
}

interface DiscountCodeUsageSummaryRow {
  usage_month: string;
  salesperson: string;
  usage_count: number;
  paid_count: number;
  gross_amount_hkd: number;
  final_amount_hkd: number;
  discount_amount_hkd: number;
}

interface DiscountCodeUsageRawRecord {
  id: string;
  usage_date: string;
  usage_month: string;
  created_at: string;
  paid_at: string | null;
  discount_code: string;
  salesperson: string | null;
  discount_percent: number;
  amount_hkd: number;
  final_amount_hkd: number;
  discount_amount_hkd: number;
  status: string;
  mobile_number: string;
  merchant_order_id: string;
  payment_method: string | null;
}

interface TutorReferralCodeSummaryRow {
  id: string;
  code: string;
  tutor_name: string;
  tutor_mobile: string | null;
  tutor_email: string | null;
  usage_limit: number;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

interface TutorReferralUsageDetailRow {
  id: string;
  used_at: string;
  mobile_number: string;
  parent_id: string | null;
  parent_status: "free" | "paid";
}

interface PaymentStatusMonthRow {
  month: string;
  amount_hkd: number;
  paid_count: number;
}

interface PaymentStatusEnquiryResult {
  found: boolean;
  parent?: {
    id: string;
    mobile_number: string;
    parent_name: string | null;
    tier: "free" | "paid";
    is_paid: boolean;
    paid_started_at: string | null;
    paid_until: string | null;
  };
  payment?: {
    current_payment_start_date: string | null;
    current_payment_end_date: string | null;
    payment_method: string | null;
    is_recurring: boolean;
    recurring_status: string | null;
    billed_last_12_months_total_hkd: number;
    billed_last_12_months_by_month: PaymentStatusMonthRow[];
    latest_paid_order?: {
      id: string;
      paid_at: string | null;
      amount_hkd: number;
      payment_method: string | null;
    } | null;
    latest_refund?: {
      status: string | null;
      amount_hkd: number;
      created_at: string | null;
      airwallex_refund_id: string | null;
    } | null;
  } | null;
}

interface PaymentCancelFutureResult {
  ok: boolean;
  consent_disabled: boolean;
  consent_status: string | null;
  recurring_status: string;
  message: string;
}

interface PaymentRefundPreviewResult {
  found: boolean;
  eligible?: boolean;
  reason?: string | null;
  parent?: {
    id: string;
    mobile_number: string;
    parent_name: string | null;
  };
  order?: {
    id: string;
    paid_at: string | null;
    amount_hkd: number;
    currency: string;
    payment_method: string | null;
  };
  existing_refund?: {
    id: string;
    status: string | null;
    amount_hkd: number;
    created_at: string | null;
    airwallex_refund_id: string | null;
  } | null;
}

interface PaymentRefundConfirmResult {
  ok: boolean;
  refund_id: string | null;
  refund_status: string;
  refund_amount_hkd: number;
  parent_tier: "free" | "paid";
  recurring_status: string;
}

interface PaymentMonthlyPaidParentRow {
  parent_id: string;
  mobile_number: string;
  parent_name: string | null;
  paid_started_at: string | null;
  monthly_paid_count: number;
  monthly_paid_amount_hkd: number;
  latest_paid_at: string | null;
  latest_payment_method: string | null;
}

interface PaymentMonthlyPaidSummaryResult {
  month: string;
  totals: {
    new_paid_parents: number;
    new_paid_parents_amount_hkd: number;
    paid_transactions: number;
    paid_amount_hkd: number;
  };
  parents: PaymentMonthlyPaidParentRow[];
  records: PaidTransactionAuditRow[];
}

interface PaymentRecurringMonitorUserRow {
  parent_id: string;
  mobile_number: string;
  parent_name: string | null;
  paid_until: string | null;
  current_payment_status: string;
  recurring_method_type: string | null;
  recurring_linkage_ready: boolean;
  next_payment_date: string | null;
  this_month_payment_success: boolean;
  this_month_payment_status: "success" | "failed" | "no_attempt";
  this_month_last_attempt_at: string | null;
}

interface PaymentRecurringMonitorResult {
  month: string;
  totals: {
    currently_paid_users: number;
    this_month_success: number;
    this_month_failed: number;
  };
  users: PaymentRecurringMonitorUserRow[];
}

interface ParentStudentPracticeStudentRow {
  id: string;
  student_name: string;
  grade_level: string;
  gender: string | null;
  gender_label: string | null;
  school_id: string | null;
  school_name: string | null;
  school_district: string | null;
}

interface ParentStudentPracticeSummaryRow {
  student_id: string;
  practice_date: string;
  subject: string;
  sessions_count: number;
  questions_attempted: number;
  correct_count: number;
  correct_rate: number;
}

interface ParentStudentsPracticeSummaryResult {
  found: boolean;
  month: string;
  parent?: {
    id: string;
    mobile_number: string;
    parent_name: string | null;
    email: string | null;
  };
  students: ParentStudentPracticeStudentRow[];
  summary_rows: ParentStudentPracticeSummaryRow[];
}

interface GradeLevelPracticeFrequencyRow {
  grade_level: string;
  unique_students_started_practice: number;
  avg_questions_completed_per_session: number;
  avg_time_used_seconds_per_session: number;
  sessions_count: number;
}

interface GradeLevelPracticeFrequencyResult {
  month: string;
  subject: "all" | "Math" | "Chinese" | "English";
  rows: GradeLevelPracticeFrequencyRow[];
}

type GradeSummarySubject = "all" | "Math" | "Chinese" | "English";

const GRADE_SUMMARY_SUBJECT_OPTIONS: Array<{ value: GradeSummarySubject; label: string }> = [
  { value: "all", label: "all subject" },
  { value: "Chinese", label: "Chinese" },
  { value: "English", label: "English" },
  { value: "Math", label: "Math" },
];

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("business");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ authenticated?: boolean; token?: string }>;
      })
      .then((data) => {
        if (!active) return;
        if (data?.authenticated) {
          setLoggedIn(true);
          if (data.token) setSessionToken(data.token);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ user: loginId.trim(), pass: loginPass }),
      });
      const data = (await res.json()) as { error?: string; token?: string };
      if (!res.ok) {
        setLoginError(data.error || "帳號或密碼錯誤");
        return;
      }
      const sessionRes = await fetch("/api/admin/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!sessionRes.ok) {
        setLoginError("登入狀態建立失敗，請重試。");
        return;
      }
      const sessionData = (await sessionRes.json()) as {
        authenticated?: boolean;
        token?: string;
      };
      if (!sessionData.authenticated) {
        setLoginError("登入狀態建立失敗，請重試。");
        return;
      }
      setSessionToken(sessionData.token || data.token || "");
      setLoggedIn(true);
    } catch {
      setLoginError("登入失敗，請重試。");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // no-op
    }
    setLoggedIn(false);
    setSessionToken("");
    setLoginPass("");
  };

  if (!loggedIn) {
    return (
      <div className="admin-console-root min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">管理員控制台</h1>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
            <input
              type="text"
              value={loginId}
              onChange={(e) => { setLoginId(e.target.value); setLoginError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="帳號"
              className="w-full p-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400"
            />
            <input
              type="password"
              value={loginPass}
              onChange={(e) => { setLoginPass(e.target.value); setLoginError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="密碼"
              className="w-full p-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400"
            />
            {loginError && <p className="text-sm text-red-500">{loginError}</p>}
            <button
              onClick={handleLogin}
              disabled={!loginId.trim() || !loginPass || loginLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginLoading ? "登入中..." : "登入"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "business", label: "業務概覽" },
    { key: "quota", label: "題目配額" },
    { key: "student_practice_summary", label: "學生練習摘要" },
    { key: "payment_status", label: "付款狀態查詢" },
    { key: "delete", label: "刪除帳戶" },
    { key: "email", label: "電郵通知" },
    { key: "questions", label: "題目管理" },
    { key: "discount_codes", label: "折扣碼維護" },
    { key: "tutor_referral_codes", label: "教師編號維護" },
  ];

  return (
    <div className="admin-console-root min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">管理員控制台</span>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500">登出</button>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                tab === t.key ? "bg-indigo-600 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "business" && <BusinessKpiSection sessionToken={sessionToken} />}
        {tab === "quota" && <QuotaSection sessionToken={sessionToken} />}
        {tab === "student_practice_summary" && <StudentPracticeSummarySection sessionToken={sessionToken} />}
        {tab === "payment_status" && <PaymentStatusSection sessionToken={sessionToken} />}
        {tab === "delete" && <DeleteSection sessionToken={sessionToken} />}
        {tab === "email" && <EmailSection sessionToken={sessionToken} />}
        {tab === "questions" && <QuestionsSection sessionToken={sessionToken} />}
        {tab === "discount_codes" && <DiscountCodeSection sessionToken={sessionToken} />}
        {tab === "tutor_referral_codes" && <TutorReferralCodeSection sessionToken={sessionToken} />}
      </div>
    </div>
  );
}

function QuotaSection({ sessionToken }: { sessionToken: string }) {
  const [searchType, setSearchType] = useState<"mobile" | "student_id">("mobile");
  const [searchVal, setSearchVal] = useState("");
  const [parentInfo, setParentInfo] = useState<ParentInfo | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchVal.trim()) return;
    setLoading(true);
    setMsg("");
    setParentInfo(null);
    try {
      if (searchType === "mobile") {
        const data = await adminConsoleRequest<ParentInfo | null>("search_parent", {
          p_mobile: searchVal.trim(),
        }, sessionToken);
        if (!data) { setMsg("找不到此電話號碼"); return; }
        setParentInfo(data);
      } else {
        setMsg("請使用電話號碼搜尋，找到後可對學生操作");
      }
    } catch { setMsg("搜尋失敗"); }
    finally { setLoading(false); }
  };

  const handleAddQuota = async (studentId: string) => {
    const amount = parseInt(addAmount);
    if (!amount || amount <= 0) { setMsg("請輸入有效數量"); return; }
    setLoading(true);
    try {
      const result = await adminConsoleRequest<{ remaining_questions: number }>(
        "add_quota",
        {
          p_student_id: studentId,
          p_subject: "Math",
          p_amount: amount,
        },
        sessionToken
      );
      setMsg(`成功增加 ${amount} 題，新餘額：${result.remaining_questions}`);
      setAddAmount("");
      await handleSearch();
    } catch { setMsg("增加失敗"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">增加題目配額</h2>
      <div className="flex gap-2">
        <select value={searchType} onChange={(e) => setSearchType(e.target.value as "mobile" | "student_id")}
          className="p-2 rounded-lg border border-gray-200 text-sm bg-white">
          <option value="mobile">電話號碼</option>
          <option value="student_id">學生 ID</option>
        </select>
        <input value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={searchType === "mobile" ? "輸入電話號碼" : "輸入學生 UUID"}
          className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400" />
        <button onClick={handleSearch} disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          搜尋
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.includes("成功") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>}

      {parentInfo && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-sm text-gray-500">家長：{parentInfo.parent.mobile_number} {parentInfo.parent.parent_name && `(${parentInfo.parent.parent_name})`}</p>
          {parentInfo.students.map((si) => (
            <div key={si.student.id} className="border border-gray-100 rounded-lg p-3">
              <p className="text-sm font-semibold">{si.student.student_name} ({si.student.grade_level})</p>
              <p className="text-xs text-gray-400 mb-2">ID: {si.student.id}</p>
              {si.balances.map((b) => (
                <p key={b.id} className="text-sm">
                  {b.subject}：<span className="font-bold text-indigo-600">{b.remaining_questions}</span> 題
                </p>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={addAmount} onChange={(e) => setAddAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="增加數量" className="w-24 p-2 rounded-lg border border-gray-200 text-sm outline-none" />
                <button onClick={() => handleAddQuota(si.student.id)} disabled={loading}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  增加
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteSection({ sessionToken }: { sessionToken: string }) {
  const [mobile, setMobile] = useState("");
  const [parentInfo, setParentInfo] = useState<ParentInfo | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSearch = async () => {
    if (!mobile.trim()) return;
    setLoading(true);
    setMsg("");
    setParentInfo(null);
    setConfirmDelete(false);
    try {
      const data = await adminConsoleRequest<ParentInfo | null>("search_parent", {
        p_mobile: mobile.trim(),
      }, sessionToken);
      if (!data) { setMsg("找不到此電話號碼"); return; }
      setParentInfo(data);
    } catch { setMsg("搜尋失敗"); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!mobile.trim()) return;
    setLoading(true);
    try {
      const result = await adminConsoleRequest<{ deleted: boolean; students_deleted?: number }>(
        "delete_parent",
        { p_mobile: mobile.trim() },
        sessionToken
      );
      if (result.deleted) {
        setMsg(`已刪除家長及 ${result.students_deleted || 0} 個學生的所有記錄`);
        setParentInfo(null);
        setConfirmDelete(false);
      } else {
        setMsg("刪除失敗");
      }
    } catch { setMsg("刪除失敗"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">刪除帳戶</h2>
      <div className="flex gap-2">
        <input value={mobile} onChange={(e) => setMobile(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="輸入家長電話號碼"
          className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400" />
        <button onClick={handleSearch} disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          搜尋
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.includes("已刪除") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>}

      {parentInfo && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-sm">家長：<strong>{parentInfo.parent.mobile_number}</strong> {parentInfo.parent.email && `(${parentInfo.parent.email})`}</p>
          {parentInfo.students.map((si) => (
            <p key={si.student.id} className="text-sm text-gray-600">
              學生：{si.student.student_name} ({si.student.grade_level})
            </p>
          ))}
          <div className="border-t border-gray-100 pt-3 mt-3">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                刪除此帳戶及所有相關記錄
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-red-600 font-semibold">確定要刪除嗎？此操作無法恢復！</p>
                <div className="flex gap-2">
                  <button onClick={handleDelete} disabled={loading}
                    className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-50">
                    確認刪除
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300">
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailSection({ sessionToken }: { sessionToken: string }) {
  const [globalEnabled, setGlobalEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [, setPerEmailEnabled] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (globalEnabled !== null) return;
    adminConsoleRequest<Record<string, string>>("get_settings", undefined, sessionToken)
      .then((s) => {
        if (!active) return;
        setGlobalEnabled(s.email_notifications_enabled !== "false");
      })
      .catch(() => {
        if (!active) return;
        setMsg("設定載入失敗");
      });
    return () => {
      active = false;
    };
  }, [globalEnabled, sessionToken]);

  const toggleGlobal = async () => {
    if (globalEnabled === null) return;
    setLoading(true);
    const newVal = !globalEnabled;
    try {
      await adminConsoleRequest<null>("set_setting", {
        p_key: "email_notifications_enabled",
        p_value: newVal ? "true" : "false",
      }, sessionToken);
      setGlobalEnabled(newVal);
      setMsg(`全局電郵通知已${newVal ? "開啟" : "關閉"}`);
    } catch { setMsg("設定失敗"); }
    finally { setLoading(false); }
  };

  const handleEmailToggle = async (enabled: boolean) => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const result = await adminConsoleRequest<{ updated: number }>(
        "set_email_notification",
        {
          p_email: email.trim(),
          p_enabled: enabled,
        },
        sessionToken
      );
      if (result.updated > 0) {
        setPerEmailEnabled(enabled);
        setMsg(`${email.trim()} 的通知已${enabled ? "開啟" : "關閉"}`);
      } else {
        setMsg("找不到此電郵地址");
      }
    } catch { setMsg("設定失敗"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">電郵通知設定</h2>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">全局設定</h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            練習完成電郵通知：
            <span className={`font-bold ml-1 ${globalEnabled ? "text-emerald-600" : "text-red-500"}`}>
              {globalEnabled ? "已開啟" : "已關閉"}
            </span>
          </p>
          <button onClick={toggleGlobal} disabled={loading || globalEnabled === null}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
              globalEnabled ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
            }`}>
            {globalEnabled ? "關閉" : "開啟"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">按電郵地址設定</h3>
        <div className="flex gap-2 mb-3">
          <input value={email} onChange={(e) => { setEmail(e.target.value); setPerEmailEnabled(null); }}
            placeholder="輸入電郵地址"
            className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400" />
        </div>
        {email.trim() && (
          <div className="flex gap-2">
            <button onClick={() => handleEmailToggle(true)} disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
              開啟通知
            </button>
            <button onClick={() => handleEmailToggle(false)} disabled={loading}
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
              關閉通知
            </button>
          </div>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.includes("失敗") || msg.includes("找不到") ? "text-red-500" : "text-emerald-600"}`}>{msg}</p>}
    </div>
  );
}

function QuestionsSection({ sessionToken }: { sessionToken: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [editing, setEditing] = useState<QuestionResult | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setMsg("");
    setEditing(null);
    try {
      const data = await adminConsoleRequest<QuestionResult[]>("search_questions", {
        p_query: query.trim(),
      }, sessionToken);
      setResults(data || []);
      if (!data || data.length === 0) setMsg("找不到相關題目");
    } catch { setMsg("搜尋失敗"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!editing) return;
    setLoading(true);
    try {
      await adminConsoleRequest<null>("update_question", {
        p_id: editing.id,
        p_content: editing.content,
        p_opt_a: editing.opt_a,
        p_opt_b: editing.opt_b,
        p_opt_c: editing.opt_c,
        p_opt_d: editing.opt_d,
        p_correct_answer: editing.correct_answer,
        p_explanation: editing.explanation,
      }, sessionToken);
      setMsg("題目已更新");
      setResults(results.map((r) => (r.id === editing.id ? editing : r)));
      setEditing(null);
    } catch { setMsg("更新失敗"); }
    finally { setLoading(false); }
  };

  const field = (label: string, key: keyof QuestionResult, multiline = false) => {
    if (!editing) return null;
    const val = (editing[key] as string) || "";
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
        {multiline ? (
          <textarea value={val} onChange={(e) => setEditing({ ...editing, [key]: e.target.value || null })}
            rows={3} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 resize-y" />
        ) : (
          <input value={val} onChange={(e) => setEditing({ ...editing, [key]: e.target.value || null })}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">題目管理</h2>
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="輸入題目 ID 或關鍵字搜尋"
          className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400" />
        <button onClick={handleSearch} disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          搜尋
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.includes("已更新") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>}

      {editing ? (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-indigo-700">編輯題目</h3>
            <p className="text-xs text-gray-400">{editing.id}</p>
          </div>
          {field("題目內容", "content", true)}
          <div className="grid grid-cols-2 gap-3">
            {field("選項 A", "opt_a")}
            {field("選項 B", "opt_b")}
            {field("選項 C", "opt_c")}
            {field("選項 D", "opt_d")}
          </div>
          {field("正確答案", "correct_answer")}
          {field("解釋", "explanation", true)}
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              儲存
            </button>
            <button onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300">
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((q) => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">{q.id} · {q.subject} · {q.question_type} · {q.grade_level}</p>
                  <p className="text-sm text-gray-800">{q.content}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
                {q.opt_a && <p>A: {q.opt_a}</p>}
                {q.opt_b && <p>B: {q.opt_b}</p>}
                {q.opt_c && <p>C: {q.opt_c}</p>}
                {q.opt_d && <p>D: {q.opt_d}</p>}
              </div>
              <p className="mt-1 text-xs"><span className="text-emerald-600 font-semibold">正確：{q.correct_answer}</span></p>
              {q.explanation && <p className="mt-1 text-xs text-gray-500">解釋：{q.explanation}</p>}
              <button onClick={() => setEditing({ ...q })}
                className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition-all">
                修改
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDateTimeDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-HK", { hour12: false });
}

function formatHkdAmount(value: number): string {
  return Number(value || 0).toFixed(2);
}

function formatRecurringStatusLabel(status: string | null | undefined): string {
  const token = String(status || "").trim().toLowerCase();
  if (token === "active") return "啟用中";
  if (token === "paused") return "暫停";
  if (token === "cancelled") return "已取消";
  if (token === "failed") return "失敗";
  if (token === "no_profile") return "未設定自動續費";
  return token || "—";
}

function formatMonthPaymentStatusLabel(
  status: PaymentRecurringMonitorUserRow["this_month_payment_status"]
): string {
  if (status === "success") return "成功";
  if (status === "failed") return "失敗";
  return "尚未嘗試";
}

function StudentPracticeSummarySection({ sessionToken }: { sessionToken: string }) {
  const [mobile, setMobile] = useState("");
  const [month, setMonth] = useState(() => getCurrentHktMonthKey());
  const [gradeSummarySubject, setGradeSummarySubject] = useState<GradeSummarySubject>("all");
  const [gradeSummaryMonth, setGradeSummaryMonth] = useState(() => getCurrentHktMonthKey());
  const [loading, setLoading] = useState(false);
  const [gradeSummaryLoading, setGradeSummaryLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [gradeSummaryMsg, setGradeSummaryMsg] = useState("");
  const [result, setResult] = useState<ParentStudentsPracticeSummaryResult | null>(null);
  const [gradeSummaryResult, setGradeSummaryResult] = useState<GradeLevelPracticeFrequencyResult | null>(
    null
  );

  const summaryRowsByStudent = useMemo(() => {
    if (!result) return new Map<string, ParentStudentPracticeSummaryRow[]>();
    const grouped = new Map<string, ParentStudentPracticeSummaryRow[]>();
    for (const row of result.summary_rows ?? []) {
      const list = grouped.get(row.student_id) ?? [];
      list.push(row);
      grouped.set(row.student_id, list);
    }
    return grouped;
  }, [result]);

  const handleSearch = useCallback(async () => {
    if (!mobile.trim()) {
      setMsg("請輸入家長電話號碼");
      setResult(null);
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setMsg("月份格式必須為 YYYY-MM");
      setResult(null);
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const data = await adminConsoleRequest<ParentStudentsPracticeSummaryResult>(
        "parent_students_practice_summary",
        {
          mobile_number: mobile.trim(),
          month,
        },
        sessionToken
      );
      if (!data?.found) {
        setMsg("找不到此電話號碼");
        setResult(null);
        return;
      }
      setResult(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "載入學生練習摘要失敗");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [mobile, month, sessionToken]);

  const loadGradeSummary = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(gradeSummaryMonth)) {
      setGradeSummaryMsg("月份格式必須為 YYYY-MM");
      setGradeSummaryResult(null);
      return;
    }
    setGradeSummaryLoading(true);
    setGradeSummaryMsg("");
    try {
      const data = await adminConsoleRequest<GradeLevelPracticeFrequencyResult>(
        "grade_level_practice_frequency_summary",
        { month: gradeSummaryMonth, subject: gradeSummarySubject },
        sessionToken
      );
      setGradeSummaryResult(data);
    } catch (err) {
      setGradeSummaryMsg(err instanceof Error ? err.message : "載入年級練習頻率摘要失敗");
      setGradeSummaryResult(null);
    } finally {
      setGradeSummaryLoading(false);
    }
  }, [gradeSummaryMonth, gradeSummarySubject, sessionToken]);

  useEffect(() => {
    void loadGradeSummary();
  }, [loadGradeSummary]);

  const formatAvgMinutes = useCallback((seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    return (safeSeconds / 60).toFixed(2);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">家長學生練習摘要</h2>
      <p className="text-sm text-gray-500">
        依家長電話號碼顯示所有已註冊學生資料，並按學生分組查看所選月份每日各科練習正確率摘要。
      </p>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-gray-800">平台練習頻率摘要（按年級）</h3>
          <div className="flex items-center gap-2">
            <select
              value={gradeSummarySubject}
              onChange={(e) => setGradeSummarySubject(e.target.value as GradeSummarySubject)}
              className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white"
            >
              {GRADE_SUMMARY_SUBJECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={gradeSummaryMonth}
              onChange={(e) => setGradeSummaryMonth(e.target.value)}
              className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => void loadGradeSummary()}
              disabled={gradeSummaryLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {gradeSummaryLoading ? "載入中..." : "查詢"}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          指標：① 啟動練習學生數（當月有開始練習）② 每節平均完成題數 ③ 每節平均完成時間。
        </p>
        {gradeSummaryMsg && (
          <p
            className={`text-sm ${
              gradeSummaryMsg.includes("失敗") || gradeSummaryMsg.includes("格式")
                ? "text-red-500"
                : "text-emerald-600"
            }`}
          >
            {gradeSummaryMsg}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">年級</th>
                <th className="py-2 pr-3">啟動練習學生數</th>
                <th className="py-2 pr-3">每節平均完成題數</th>
                <th className="py-2 pr-3">每節平均完成時間（分鐘）</th>
                <th className="py-2 pr-3">練習節數</th>
              </tr>
            </thead>
            <tbody>
              {(gradeSummaryResult?.rows ?? []).map((row) => (
                <tr key={row.grade_level} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-semibold text-gray-800">{row.grade_level}</td>
                  <td className="py-2 pr-3">{row.unique_students_started_practice}</td>
                  <td className="py-2 pr-3">{row.avg_questions_completed_per_session.toFixed(2)}</td>
                  <td className="py-2 pr-3">{formatAvgMinutes(row.avg_time_used_seconds_per_session)}</td>
                  <td className="py-2 pr-3">{row.sessions_count}</td>
                </tr>
              ))}
              {(gradeSummaryResult?.rows?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-400">
                    {gradeSummaryLoading
                      ? "載入中..."
                      : `此科目/月份（${gradeSummaryResult?.subject || gradeSummarySubject} / ${
                          gradeSummaryResult?.month || gradeSummaryMonth
                        }）沒有練習紀錄`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={mobile}
          onChange={(e) => {
            setMobile(e.target.value);
            setMsg("");
          }}
          onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
          placeholder="輸入家長電話號碼"
          className="flex-1 min-w-[220px] p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
        />
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => void handleSearch()}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "載入中..." : "查詢"}
        </button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.includes("失敗") || msg.includes("找不到") ? "text-red-500" : "text-emerald-600"}`}>
          {msg}
        </p>
      )}

      {result?.found && result.parent && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2 text-sm">
            <p className="text-gray-500">
              家長：<span className="font-semibold text-gray-800">{result.parent.mobile_number}</span>
              {result.parent.parent_name ? ` (${result.parent.parent_name})` : ""}
            </p>
            <p className="text-gray-500">
              電郵：<span className="font-semibold text-gray-800">{result.parent.email || "—"}</span>
            </p>
            <p className="text-gray-500">
              查詢月份：<span className="font-semibold text-gray-800">{result.month}</span>
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">學生資料</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">學生姓名</th>
                    <th className="py-2 pr-3">年級</th>
                    <th className="py-2 pr-3">性別</th>
                    <th className="py-2 pr-3">學校</th>
                    <th className="py-2 pr-3">學校地區</th>
                  </tr>
                </thead>
                <tbody>
                  {result.students.map((student) => (
                    <tr key={student.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-semibold text-gray-800">{student.student_name || "—"}</td>
                      <td className="py-2 pr-3">{student.grade_level || "—"}</td>
                      <td className="py-2 pr-3">{student.gender_label || student.gender || "—"}</td>
                      <td className="py-2 pr-3">{student.school_name || "—"}</td>
                      <td className="py-2 pr-3">{student.school_district || "—"}</td>
                    </tr>
                  ))}
                  {result.students.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-400">
                        此家長目前沒有學生資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {result.students.map((student) => {
            const rows = summaryRowsByStudent.get(student.id) ?? [];
            return (
              <div key={`summary-${student.id}`} className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-1">
                  {student.student_name || "未命名學生"}（{student.grade_level || "—"}）
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  每日按科目加權正確率（正確題數 / 作答題數）
                </p>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-3">日期</th>
                        <th className="py-2 pr-3">科目</th>
                        <th className="py-2 pr-3">練習節數</th>
                        <th className="py-2 pr-3">作答題數</th>
                        <th className="py-2 pr-3">答對題數</th>
                        <th className="py-2 pr-3">正確率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.student_id}-${row.practice_date}-${row.subject}`} className="border-b border-gray-100">
                          <td className="py-2 pr-3">{row.practice_date}</td>
                          <td className="py-2 pr-3">{row.subject}</td>
                          <td className="py-2 pr-3">{row.sessions_count}</td>
                          <td className="py-2 pr-3">{row.questions_attempted}</td>
                          <td className="py-2 pr-3">{row.correct_count}</td>
                          <td className="py-2 pr-3 font-semibold text-indigo-700">{row.correct_rate.toFixed(2)}%</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-gray-400">
                            此學生於 {result.month} 沒有練習紀錄
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaymentStatusSection({ sessionToken }: { sessionToken: string }) {
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [refundPreviewLoading, setRefundPreviewLoading] = useState(false);
  const [refundConfirmLoading, setRefundConfirmLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [result, setResult] = useState<PaymentStatusEnquiryResult | null>(null);
  const [refundPreview, setRefundPreview] = useState<PaymentRefundPreviewResult | null>(null);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [summaryMonth, setSummaryMonth] = useState(() => getCurrentHktMonthKey());
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState("");
  const [monthlySummary, setMonthlySummary] = useState<PaymentMonthlyPaidSummaryResult | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorMsg, setMonitorMsg] = useState("");
  const [recurringMonitor, setRecurringMonitor] = useState<PaymentRecurringMonitorResult | null>(null);

  const loadMonthlyPaidSummary = useCallback(
    async (month: string) => {
      setSummaryLoading(true);
      setSummaryMsg("");
      try {
        const data = await adminConsoleRequest<PaymentMonthlyPaidSummaryResult>(
          "payment_monthly_paid_summary",
          { month },
          sessionToken
        );
        setMonthlySummary(data);
      } catch (err) {
        setSummaryMsg(err instanceof Error ? err.message : "月費摘要載入失敗");
      } finally {
        setSummaryLoading(false);
      }
    },
    [sessionToken]
  );

  const loadRecurringMonitor = useCallback(
    async (month: string) => {
      setMonitorLoading(true);
      setMonitorMsg("");
      try {
        const data = await adminConsoleRequest<PaymentRecurringMonitorResult>(
          "payment_recurring_monitor_summary",
          { month },
          sessionToken
        );
        setRecurringMonitor(data);
      } catch (err) {
        setMonitorMsg(err instanceof Error ? err.message : "續費監察儀表板載入失敗");
      } finally {
        setMonitorLoading(false);
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    void loadMonthlyPaidSummary(summaryMonth);
    void loadRecurringMonitor(summaryMonth);
  }, [loadMonthlyPaidSummary, loadRecurringMonitor, summaryMonth]);

  const handleSearch = async () => {
    if (!mobile.trim()) {
      setMsg("請輸入電話號碼");
      setResult(null);
      return;
    }
    setLoading(true);
    setMsg("");
    setActionMsg("");
    setResult(null);
    setRefundPreview(null);
    setShowRefundConfirm(false);
    setRefundReason("");
    try {
      const data = await adminConsoleRequest<PaymentStatusEnquiryResult>(
        "payment_status_enquiry",
        { mobile_number: mobile.trim() },
        sessionToken
      );
      if (!data?.found) {
        setMsg("找不到此電話號碼");
        return;
      }
      setResult(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelFuturePayment = async () => {
    if (!result?.parent?.mobile_number) return;
    const confirmed = window.confirm(
      `確定要取消 ${result.parent.mobile_number} 的未來續費嗎？此操作會停止之後自動扣款。`
    );
    if (!confirmed) return;

    setCancelLoading(true);
    setActionMsg("");
    try {
      const data = await adminConsoleRequest<PaymentCancelFutureResult>(
        "payment_cancel_future_payment",
        { mobile_number: result.parent.mobile_number },
        sessionToken
      );
      setActionMsg(data.message || "已取消未來續費");
      await handleSearch();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "取消續費失敗");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleOpenRefundConfirm = async () => {
    if (!result?.parent?.mobile_number) return;
    setRefundPreviewLoading(true);
    setActionMsg("");
    setShowRefundConfirm(false);
    setRefundPreview(null);
    setRefundReason("");
    try {
      const preview = await adminConsoleRequest<PaymentRefundPreviewResult>(
        "payment_refund_last_preview",
        { mobile_number: result.parent.mobile_number },
        sessionToken
      );
      setRefundPreview(preview);
      setShowRefundConfirm(true);
      if (!preview.eligible) {
        setActionMsg(preview.reason || "此家長目前沒有可退款的最近付款。");
      }
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "載入退款確認資料失敗");
    } finally {
      setRefundPreviewLoading(false);
    }
  };

  const handleConfirmRefund = async () => {
    const orderId = refundPreview?.order?.id;
    const mobileNumber = result?.parent?.mobile_number;
    if (!orderId || !mobileNumber) return;
    if (!refundReason.trim()) {
      setActionMsg("請先輸入退款原因");
      return;
    }

    const confirmed = window.confirm(
      `確認退款？\n家長：${mobileNumber}\n金額：HKD ${formatHkdAmount(
        refundPreview.order?.amount_hkd || 0
      )}\n原因：${refundReason.trim()}`
    );
    if (!confirmed) return;

    setRefundConfirmLoading(true);
    setActionMsg("");
    try {
      const data = await adminConsoleRequest<PaymentRefundConfirmResult>(
        "payment_refund_last_confirm",
        {
          mobile_number: mobileNumber,
          order_id: orderId,
          reason: refundReason.trim(),
        },
        sessionToken
      );
      setActionMsg(
        `退款已提交（${data.refund_status}）。已降級為免費用戶並停止續費。退款編號：${data.refund_id || "—"}`
      );
      setShowRefundConfirm(false);
      setRefundPreview(null);
      setRefundReason("");
      await handleSearch();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "退款操作失敗");
    } finally {
      setRefundConfirmLoading(false);
    }
  };

  const paymentRows = result?.payment?.billed_last_12_months_by_month ?? [];
  const latestRefundStatus = result?.payment?.latest_refund?.status || null;

  const handleExportMonthlyPaidCsv = () => {
    if (!monthlySummary || monthlySummary.records.length === 0) {
      setSummaryMsg("目前沒有可匯出的付款記錄");
      return;
    }
    const csv = buildPaidTransactionsCsv(monthlySummary.records);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paid-transactions-${monthlySummary.month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">付款狀態查詢</h2>
      <p className="text-sm text-gray-500">
        輸入家長電話號碼，可查詢免費／月費狀態；月費家長會顯示付款資料及最近 12 個月帳單金額。
      </p>

      <div className="flex gap-2">
        <input
          value={mobile}
          onChange={(e) => {
            setMobile(e.target.value);
            setMsg("");
          }}
          onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
          placeholder="輸入家長電話號碼"
          className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => void handleSearch()}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "查詢中..." : "查詢"}
        </button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.includes("失敗") || msg.includes("找不到") ? "text-red-500" : "text-emerald-600"}`}>
          {msg}
        </p>
      )}
      {actionMsg && (
        <p
          className={`text-sm ${
            actionMsg.includes("失敗") || actionMsg.includes("錯誤") ? "text-red-500" : "text-emerald-600"
          }`}
        >
          {actionMsg}
        </p>
      )}

      {result?.found && result.parent && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">
              家長：{result.parent.mobile_number}
              {result.parent.parent_name ? ` (${result.parent.parent_name})` : ""}
            </p>
            <p className="text-sm">
              目前狀態：
              <span className={`ml-1 font-bold ${result.parent.is_paid ? "text-emerald-600" : "text-gray-600"}`}>
                {result.parent.is_paid ? "月費用戶" : "免費用戶"}
              </span>
            </p>
          </div>

          {result.parent.is_paid && result.payment && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleCancelFuturePayment()}
                  disabled={cancelLoading || refundConfirmLoading || refundPreviewLoading}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {cancelLoading ? "取消中..." : "取消未來付款"}
                </button>
                <button
                  onClick={() => void handleOpenRefundConfirm()}
                  disabled={refundPreviewLoading || refundConfirmLoading || cancelLoading}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {refundPreviewLoading ? "載入中..." : "退款最後一筆"}
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">當前付款期開始</p>
                  <p className="font-semibold text-gray-800">
                    {formatDateTimeDisplay(result.payment.current_payment_start_date)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">當前付款期結束</p>
                  <p className="font-semibold text-gray-800">
                    {formatDateTimeDisplay(result.payment.current_payment_end_date)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">付款方式</p>
                  <p className="font-semibold text-gray-800">
                    {result.payment.payment_method || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">是否自動續費</p>
                  <p className="font-semibold text-gray-800">
                    {result.payment.is_recurring ? "是" : "否"}
                    {result.payment.recurring_status
                      ? `（${result.payment.recurring_status}）`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">最近一筆付款</p>
                  <p className="font-semibold text-gray-800">
                    {result.payment.latest_paid_order
                      ? `HKD ${formatHkdAmount(result.payment.latest_paid_order.amount_hkd)} · ${formatDateTimeDisplay(result.payment.latest_paid_order.paid_at)}`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">最近一筆退款狀態</p>
                  <p className="font-semibold text-gray-800">
                    {latestRefundStatus || "沒有退款紀錄"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                <p className="text-xs text-indigo-700 mb-1">最近 12 個月已入帳總額（HKD）</p>
                <p className="text-lg font-bold text-indigo-700">
                  ${formatHkdAmount(result.payment.billed_last_12_months_total_hkd)}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-3">月份</th>
                      <th className="py-2 pr-3">已入帳金額 (HKD)</th>
                      <th className="py-2 pr-3">付款次數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map((row) => (
                      <tr key={row.month} className="border-b border-gray-100">
                        <td className="py-2 pr-3">{row.month}</td>
                        <td className="py-2 pr-3 font-mono">{formatHkdAmount(row.amount_hkd)}</td>
                        <td className="py-2 pr-3">{row.paid_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showRefundConfirm && refundPreview && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="text-sm font-bold text-red-700">退款確認</p>
                  {refundPreview.order ? (
                    <>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm text-gray-700">
                        <p>家長：{refundPreview.parent?.mobile_number || result.parent.mobile_number}</p>
                        <p>付款時間：{formatDateTimeDisplay(refundPreview.order.paid_at)}</p>
                        <p>付款方式：{refundPreview.order.payment_method || "—"}</p>
                        <p>
                          退款金額：<span className="font-semibold">HKD {formatHkdAmount(refundPreview.order.amount_hkd)}</span>
                        </p>
                      </div>
                      {refundPreview.existing_refund && (
                        <p className="text-xs text-red-600">
                          最近退款紀錄：{refundPreview.existing_refund.status || "—"}（
                          {formatDateTimeDisplay(refundPreview.existing_refund.created_at)}）
                        </p>
                      )}
                      <textarea
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="請輸入退款原因（必填）"
                        rows={3}
                        className="w-full p-2 rounded-lg border border-red-200 text-sm outline-none focus:border-red-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleConfirmRefund()}
                          disabled={!refundPreview.eligible || refundConfirmLoading}
                          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                        >
                          {refundConfirmLoading ? "退款處理中..." : "確認退款（最後一筆）"}
                        </button>
                        <button
                          onClick={() => {
                            setShowRefundConfirm(false);
                            setRefundPreview(null);
                            setRefundReason("");
                          }}
                          disabled={refundConfirmLoading}
                          className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300 disabled:opacity-50"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-red-600">
                      {refundPreview.reason || "目前沒有可退款的最近付款。"}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800">月費續費監察儀表板</h3>
            <p className="text-xs text-gray-500">
              顯示目前有效月費家長總數、目前付款狀態、下次扣款日期，以及所選月份續費是否成功。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
              className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => void loadRecurringMonitor(summaryMonth)}
              disabled={monitorLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {monitorLoading ? "載入中..." : "重新整理"}
            </button>
          </div>
        </div>

        {monitorMsg && <p className="text-sm text-red-500">{monitorMsg}</p>}

        {recurringMonitor && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">目前有效月費家長</p>
                <p className="font-semibold text-indigo-700">{recurringMonitor.totals.currently_paid_users}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">所選月份續費成功</p>
                <p className="font-semibold text-emerald-700">{recurringMonitor.totals.this_month_success}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">所選月份續費失敗</p>
                <p className="font-semibold text-red-700">{recurringMonitor.totals.this_month_failed}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">家長電話</th>
                    <th className="py-2 pr-3">家長姓名</th>
                    <th className="py-2 pr-3">目前付款狀態</th>
                    <th className="py-2 pr-3">自動續費設定</th>
                    <th className="py-2 pr-3">方式</th>
                    <th className="py-2 pr-3">下次付款日期</th>
                    <th className="py-2 pr-3">本月付款是否成功</th>
                    <th className="py-2 pr-3">本月付款狀態</th>
                    <th className="py-2 pr-3">本月最近嘗試時間</th>
                    <th className="py-2 pr-3">月費有效至</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringMonitor.users.map((row) => (
                    <tr key={row.parent_id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono">{row.mobile_number}</td>
                      <td className="py-2 pr-3">{row.parent_name || "—"}</td>
                      <td className="py-2 pr-3">{formatRecurringStatusLabel(row.current_payment_status)}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.recurring_linkage_ready
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.recurring_linkage_ready ? "已啟用" : "未完整"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{row.recurring_method_type || "—"}</td>
                      <td className="py-2 pr-3">{formatDateTimeDisplay(row.next_payment_date)}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.this_month_payment_success
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {row.this_month_payment_success ? "是" : "否"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{formatMonthPaymentStatusLabel(row.this_month_payment_status)}</td>
                      <td className="py-2 pr-3">{formatDateTimeDisplay(row.this_month_last_attempt_at)}</td>
                      <td className="py-2 pr-3">{formatDateTimeDisplay(row.paid_until)}</td>
                    </tr>
                  ))}
                  {recurringMonitor.users.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-4 text-center text-gray-400">
                        目前沒有有效月費家長資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800">月費家長月度明細</h3>
            <p className="text-xs text-gray-500">
              顯示所選月份「成為月費」家長數及該月份付款明細，並可下載付款審計 CSV。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
              className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => void loadMonthlyPaidSummary(summaryMonth)}
              disabled={summaryLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {summaryLoading ? "載入中..." : "重新整理"}
            </button>
            <button
              onClick={handleExportMonthlyPaidCsv}
              disabled={summaryLoading || !monthlySummary || monthlySummary.records.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              下載 CSV
            </button>
          </div>
        </div>

        {summaryMsg && <p className="text-sm text-red-500">{summaryMsg}</p>}

        {monthlySummary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">選定月份</p>
                <p className="font-semibold text-gray-800">{monthlySummary.month}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">新增月費家長</p>
                <p className="font-semibold text-indigo-700">{monthlySummary.totals.new_paid_parents}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">月費交易總筆數</p>
                <p className="font-semibold text-indigo-700">{monthlySummary.totals.paid_transactions}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">月費已入帳總額 (HKD)</p>
                <p className="font-semibold text-indigo-700">{formatHkdAmount(monthlySummary.totals.paid_amount_hkd)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">家長電話</th>
                    <th className="py-2 pr-3">家長姓名</th>
                    <th className="py-2 pr-3">成為月費時間</th>
                    <th className="py-2 pr-3">本月付款次數</th>
                    <th className="py-2 pr-3">本月付款金額 (HKD)</th>
                    <th className="py-2 pr-3">最近付款方式</th>
                    <th className="py-2 pr-3">最近付款時間</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.parents.map((row) => (
                    <tr key={row.parent_id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono">{row.mobile_number}</td>
                      <td className="py-2 pr-3">{row.parent_name || "—"}</td>
                      <td className="py-2 pr-3">{formatDateTimeDisplay(row.paid_started_at)}</td>
                      <td className="py-2 pr-3">{row.monthly_paid_count}</td>
                      <td className="py-2 pr-3 font-mono">{formatHkdAmount(row.monthly_paid_amount_hkd)}</td>
                      <td className="py-2 pr-3">{row.latest_payment_method || "—"}</td>
                      <td className="py-2 pr-3">{formatDateTimeDisplay(row.latest_paid_at)}</td>
                    </tr>
                  ))}
                  {monthlySummary.parents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-gray-400">
                        此月份沒有新增月費家長
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function toLocalDateTimeInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeCodeInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
}

function normalizeReferralCodeInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

function buildCsv(rows: DiscountCodeUsageRawRecord[]): string {
  const headers = [
    "id",
    "usage_date",
    "usage_month",
    "created_at",
    "paid_at",
    "discount_code",
    "salesperson",
    "discount_percent",
    "amount_hkd",
    "final_amount_hkd",
    "discount_amount_hkd",
    "status",
    "mobile_number",
    "merchant_order_id",
    "payment_method",
  ];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const body = rows.map((row) =>
    [
      row.id,
      row.usage_date,
      row.usage_month,
      row.created_at,
      row.paid_at,
      row.discount_code,
      row.salesperson,
      row.discount_percent,
      row.amount_hkd,
      row.final_amount_hkd,
      row.discount_amount_hkd,
      row.status,
      row.mobile_number,
      row.merchant_order_id,
      row.payment_method,
    ]
      .map(escape)
      .join(",")
  );
  return [headers.join(","), ...body].join("\n");
}

function buildReferralUsageCsv(rows: TutorReferralUsageDetailRow[]): string {
  const headers = ["used_at", "mobile_number", "parent_status"];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const body = rows.map((row) => [row.used_at, row.mobile_number, row.parent_status].map(escape).join(","));
  return [headers.join(","), ...body].join("\n");
}

function buildReferralUsagePrintHtml({
  code,
  tutorName,
  tutorMobile,
  tutorEmail,
  rows,
}: {
  code: string;
  tutorName: string;
  tutorMobile?: string | null;
  tutorEmail?: string | null;
  rows: TutorReferralUsageDetailRow[];
}): string {
  const esc = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const rowHtml =
    rows.length === 0
      ? `<tr><td colspan="3" style="padding:8px;border:1px solid #ddd;text-align:center;color:#666;">沒有資料</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr><td style="padding:8px;border:1px solid #ddd;">${esc(
                row.used_at ? new Date(row.used_at).toLocaleString("zh-HK") : "-"
              )}</td><td style="padding:8px;border:1px solid #ddd;">${esc(
                row.mobile_number
              )}</td><td style="padding:8px;border:1px solid #ddd;">${esc(row.parent_status)}</td></tr>`
          )
          .join("");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>教師編號使用紀錄 ${esc(code)}</title>
  </head>
  <body style="font-family:Arial, 'PingFang TC', 'Microsoft JhengHei', sans-serif; padding:24px;">
    <h2 style="margin:0 0 8px;">教師編號使用紀錄</h2>
    <p style="margin:0 0 16px;">教師編號：<strong>${esc(code)}</strong> ｜ 教師：<strong>${esc(
    tutorName || "-"
  )}</strong> ｜ 教師手機：<strong>${esc(tutorMobile || "-")}</strong> ｜ 教師電郵：<strong>${esc(
    tutorEmail || "-"
  )}</strong></p>
    <table style="border-collapse:collapse; width:100%; font-size:13px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f8fafc;">使用日期</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f8fafc;">電話號碼</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f8fafc;">家長狀態</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </body>
</html>`;
}

function DiscountCodeSection({ sessionToken }: { sessionToken: string }) {
  const [search, setSearch] = useState("");
  const [codes, setCodes] = useState<DiscountCodeRecord[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formPercent, setFormPercent] = useState("");
  const [formSalesperson, setFormSalesperson] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formCreatedAt, setFormCreatedAt] = useState("");

  const [monthFilter, setMonthFilter] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [salespersonOptions, setSalespersonOptions] = useState<string[]>([]);
  const [summaryRows, setSummaryRows] = useState<DiscountCodeUsageSummaryRow[]>([]);
  const [rawRows, setRawRows] = useState<DiscountCodeUsageRawRecord[]>([]);

  const resetForm = () => {
    setEditingId(null);
    setFormCode("");
    setFormPercent("");
    setFormSalesperson("");
    setFormActive(true);
    setFormCreatedAt("");
  };

  const loadCodes = async (q = search) => {
    setCodesLoading(true);
    setMsg("");
    try {
      const data = await adminConsoleRequest<DiscountCodeRecord[]>(
        "discount_code_list",
        { q: q.trim() },
        sessionToken
      );
      setCodes(data || []);
    } catch {
      setMsg("折扣碼列表載入失敗");
    } finally {
      setCodesLoading(false);
    }
  };

  const loadUsage = async () => {
    setUsageLoading(true);
    setMsg("");
    try {
      const data = await adminConsoleRequest<{
        summary: DiscountCodeUsageSummaryRow[];
        records: DiscountCodeUsageRawRecord[];
        salespersons: string[];
      }>(
        "discount_code_usage_summary",
        {
          month: monthFilter || null,
          salesperson: salespersonFilter || null,
        },
        sessionToken
      );
      setSummaryRows(data.summary || []);
      setRawRows(data.records || []);
      setSalespersonOptions(data.salespersons || []);
    } catch {
      setMsg("折扣碼使用紀錄載入失敗");
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    loadCodes("");
    loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  const handleEdit = (row: DiscountCodeRecord) => {
    setEditingId(row.id);
    setFormCode(row.code);
    setFormPercent(String(row.discount_percent));
    setFormSalesperson(row.salesperson);
    setFormActive(Boolean(row.is_active));
    setFormCreatedAt(toLocalDateTimeInputValue(row.created_at));
    setMsg("");
  };

  const handleSave = async () => {
    const payload = {
      code: normalizeCodeInput(formCode),
      discount_percent: Number(formPercent),
      salesperson: formSalesperson.trim(),
      is_active: formActive,
      created_at: formCreatedAt ? new Date(formCreatedAt).toISOString() : null,
    };

    if (!/^[A-Za-z0-9]{6}$/.test(payload.code)) {
      setMsg("折扣碼必須為 6 位英數字");
      return;
    }
    if (!Number.isFinite(payload.discount_percent) || payload.discount_percent < 0 || payload.discount_percent > 100) {
      setMsg("折扣百分比必須介乎 0 至 100");
      return;
    }
    if (!payload.salesperson) {
      setMsg("請輸入業務員名稱");
      return;
    }

    setSaveLoading(true);
    setMsg("");
    try {
      if (editingId) {
        await adminConsoleRequest("discount_code_update", { id: editingId, ...payload }, sessionToken);
        setMsg("折扣碼已更新");
      } else {
        await adminConsoleRequest("discount_code_create", payload, sessionToken);
        setMsg("折扣碼已新增");
      }
      resetForm();
      await Promise.all([loadCodes(), loadUsage()]);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確定要刪除此折扣碼？")) return;
    setDeletingId(id);
    setMsg("");
    try {
      await adminConsoleRequest("discount_code_delete", { id }, sessionToken);
      setMsg("折扣碼已刪除");
      if (editingId === id) resetForm();
      await Promise.all([loadCodes(), loadUsage()]);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setDeletingId(null);
    }
  };

  const exportCsv = () => {
    if (rawRows.length === 0) {
      setMsg("目前沒有可匯出的使用紀錄");
      return;
    }
    const csv = buildCsv(rawRows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `discount-code-usage-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">折扣碼維護</h2>

      {msg && (
        <p className={`text-sm ${msg.includes("失敗") || msg.includes("錯誤") ? "text-red-500" : "text-emerald-600"}`}>
          {msg}
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">{editingId ? "修改折扣碼" : "新增折扣碼"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">折扣碼（6位英數字）</label>
            <input
              value={formCode}
              onChange={(e) => setFormCode(normalizeCodeInput(e.target.value))}
              placeholder="例如 ASD516"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">折扣百分比 (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={formPercent}
              onChange={(e) => setFormPercent(e.target.value)}
              placeholder="例如 50"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">業務員</label>
            <input
              value={formSalesperson}
              onChange={(e) => setFormSalesperson(e.target.value)}
              placeholder="例如 Colin Wong"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">建立時間</label>
            <input
              type="datetime-local"
              value={formCreatedAt}
              onChange={(e) => setFormCreatedAt(e.target.value)}
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
          啟用
        </label>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saveLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saveLoading ? "儲存中..." : editingId ? "更新折扣碼" : "新增折扣碼"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300"
            >
              取消編輯
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCodes()}
            placeholder="搜尋折扣碼或業務員"
            className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => loadCodes()}
            disabled={codesLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {codesLoading ? "搜尋中..." : "搜尋"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">折扣碼</th>
                <th className="py-2 pr-3">折扣 (%)</th>
                <th className="py-2 pr-3">業務員</th>
                <th className="py-2 pr-3">啟用</th>
                <th className="py-2 pr-3">建立時間</th>
                <th className="py-2 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-mono">{row.code}</td>
                  <td className="py-2 pr-3">{Number(row.discount_percent).toFixed(2)}</td>
                  <td className="py-2 pr-3">{row.salesperson}</td>
                  <td className="py-2 pr-3">{row.is_active ? "是" : "否"}</td>
                  <td className="py-2 pr-3">{new Date(row.created_at).toLocaleString("zh-HK")}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(row)}
                        className="px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold"
                      >
                        修改
                      </button>
                      <button
                        onClick={() => handleDelete(row.id)}
                        disabled={deletingId === row.id}
                        className="px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold disabled:opacity-50"
                      >
                        {deletingId === row.id ? "刪除中..." : "刪除"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && !codesLoading && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400">找不到折扣碼資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">折扣碼使用摘要</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <select
            value={salespersonFilter}
            onChange={(e) => setSalespersonFilter(e.target.value)}
            className="p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">全部業務員</option>
            {salespersonOptions.map((sp) => (
              <option key={sp} value={sp}>{sp}</option>
            ))}
          </select>
          <button
            onClick={loadUsage}
            disabled={usageLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {usageLoading ? "載入中..." : "套用篩選"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">月份</th>
                <th className="py-2 pr-3">業務員</th>
                <th className="py-2 pr-3">使用次數</th>
                <th className="py-2 pr-3">成功付款次數</th>
                <th className="py-2 pr-3">原價總額 (HKD)</th>
                <th className="py-2 pr-3">實付總額 (HKD)</th>
                <th className="py-2 pr-3">折扣總額 (HKD)</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={`${row.usage_month}-${row.salesperson}`} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{row.usage_month}</td>
                  <td className="py-2 pr-3">{row.salesperson}</td>
                  <td className="py-2 pr-3">{row.usage_count}</td>
                  <td className="py-2 pr-3">{row.paid_count}</td>
                  <td className="py-2 pr-3">{Number(row.gross_amount_hkd).toFixed(2)}</td>
                  <td className="py-2 pr-3">{Number(row.final_amount_hkd).toFixed(2)}</td>
                  <td className="py-2 pr-3">{Number(row.discount_amount_hkd).toFixed(2)}</td>
                </tr>
              ))}
              {summaryRows.length === 0 && !usageLoading && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-400">沒有符合條件的摘要資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-xs text-gray-500">可匯出目前篩選條件下的完整原始使用紀錄（CSV）</p>
          <button
            onClick={exportCsv}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            匯出 CSV
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorReferralCodeSection({ sessionToken }: { sessionToken: string }) {
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryRows, setSummaryRows] = useState<TutorReferralCodeSummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const [createCode, setCreateCode] = useState("");
  const [createTutorName, setCreateTutorName] = useState("");
  const [createTutorMobile, setCreateTutorMobile] = useState("");
  const [createTutorEmail, setCreateTutorEmail] = useState("");
  const [resetCode, setResetCode] = useState("");

  const [detailCode, setDetailCode] = useState("");
  const [detailResult, setDetailResult] = useState<{
    found: boolean;
    code: TutorReferralCodeSummaryRow | null;
    rows: TutorReferralUsageDetailRow[];
  } | null>(null);

  const loadSummary = async (q = summarySearch) => {
    setSummaryLoading(true);
    setMsg("");
    try {
      const data = await adminConsoleRequest<TutorReferralCodeSummaryRow[]>(
        "tutor_referral_code_summary",
        { q: q.trim() },
        sessionToken
      );
      setSummaryRows(data || []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "教師編號摘要載入失敗");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    loadSummary("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  const handleCreate = async () => {
    const code = normalizeReferralCodeInput(createCode);
    const tutorName = createTutorName.trim();
    const tutorMobile = createTutorMobile.replace(/\D/g, "").slice(0, 8);
    const tutorEmailInput = createTutorEmail.trim().toLowerCase();
    const tutorEmail = tutorEmailInput || null;
    if (!/^\d{6}$/.test(code)) {
      setMsg("教師編號必須為 6 位數字");
      return;
    }
    if (!tutorName) {
      setMsg("請輸入教師名稱");
      return;
    }
    if (!/^\d{8}$/.test(tutorMobile)) {
      setMsg("請輸入 8 位數字教師手機");
      return;
    }
    if (tutorEmail && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(tutorEmail)) {
      setMsg("教師電郵格式不正確");
      return;
    }
    setSaveLoading(true);
    setMsg("");
    try {
      await adminConsoleRequest(
        "tutor_referral_code_create",
        {
          code,
          tutor_name: tutorName,
          tutor_mobile: tutorMobile,
          tutor_email: tutorEmail,
        },
        sessionToken
      );
      setMsg("教師編號已新增");
      setCreateCode("");
      setCreateTutorName("");
      setCreateTutorMobile("");
      setCreateTutorEmail("");
      await loadSummary();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "新增教師編號失敗");
    } finally {
      setSaveLoading(false);
    }
  };

  const loadDetail = async (rawCode = detailCode) => {
    const code = normalizeReferralCodeInput(rawCode);
    setDetailCode(code);
    if (!/^\d{6}$/.test(code)) {
      setMsg("請輸入 6 位數字教師編號");
      setDetailResult(null);
      return;
    }

    setDetailLoading(true);
    setMsg("");
    try {
      const data = await adminConsoleRequest<{
        found: boolean;
        code: TutorReferralCodeSummaryRow | null;
        rows: TutorReferralUsageDetailRow[];
      }>("tutor_referral_code_usage_details", { code }, sessionToken);
      setDetailResult(data);
      if (!data.found) {
        setMsg("找不到此教師編號");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "教師編號使用紀錄查詢失敗");
      setDetailResult(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const exportDetailCsv = () => {
    if (!detailResult?.found || !detailResult.code || detailResult.rows.length === 0) {
      setMsg("目前沒有可匯出的使用紀錄");
      return;
    }
    const csv = buildReferralUsageCsv(detailResult.rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tutor-referral-usage-${detailResult.code.code}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportDetailPdf = () => {
    if (!detailResult?.found || !detailResult.code || detailResult.rows.length === 0) {
      setMsg("目前沒有可匯出的使用紀錄");
      return;
    }
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!printWindow) {
      setMsg("無法開啟列印視窗，請檢查瀏覽器是否封鎖彈出視窗。");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(
      buildReferralUsagePrintHtml({
        code: detailResult.code.code,
        tutorName: detailResult.code.tutor_name,
        tutorMobile: detailResult.code.tutor_mobile,
        tutorEmail: detailResult.code.tutor_email,
        rows: detailResult.rows,
      })
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleResetPassword = async () => {
    const code = normalizeReferralCodeInput(resetCode);
    setResetMsg("");
    if (!/^\d{6}$/.test(code)) {
      setResetMsg("請輸入 6 位數字教師編號以重設密碼");
      return;
    }
    if (!window.confirm(`確認重設教師編號 ${code} 的密碼為 123456？`)) {
      return;
    }
    setResetLoading(true);
    setResetMsg("");
    try {
      const result = await adminConsoleRequest<{
        code: string;
        tutor_name: string;
        message: string;
      }>("tutor_referral_password_reset", { code }, sessionToken);
      setResetMsg(result.message || "已重設此教師編號密碼為 123456，下次登入需先更新密碼。");
      setResetCode("");
    } catch (err) {
      setResetMsg(err instanceof Error ? err.message : "重設教師密碼失敗");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">教師編號維護</h2>

      {msg && (
        <p
          className={`text-sm ${
            msg.includes("失敗") || msg.includes("錯誤") || msg.includes("找不到")
              ? "text-red-500"
              : "text-emerald-600"
          }`}
        >
          {msg}
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">手動新增教師編號</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">教師編號（6位數字）</label>
            <input
              value={createCode}
              onChange={(e) => setCreateCode(normalizeReferralCodeInput(e.target.value))}
              placeholder="例如 123456"
              maxLength={6}
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">教師名稱</label>
            <input
              value={createTutorName}
              onChange={(e) => setCreateTutorName(e.target.value)}
              placeholder="例如 陳老師"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">教師手機（8位數字）</label>
            <input
              value={createTutorMobile}
              onChange={(e) => setCreateTutorMobile(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="例如 91234567"
              maxLength={8}
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">教師電郵（可選）</label>
            <input
              type="email"
              value={createTutorEmail}
              onChange={(e) => setCreateTutorEmail(e.target.value)}
              placeholder="例如 tutor@example.com"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={saveLoading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {saveLoading ? "儲存中..." : "新增教師編號"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Part 1：教師編號使用摘要</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={summarySearch}
            onChange={(e) => setSummarySearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadSummary()}
            placeholder="搜尋教師編號 / 教師名稱 / 手機 / 電郵"
            className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => loadSummary()}
            disabled={summaryLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {summaryLoading ? "載入中..." : "搜尋"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">建立日期</th>
                <th className="py-2 pr-3">教師名稱</th>
                <th className="py-2 pr-3">教師手機</th>
                <th className="py-2 pr-3">教師電郵</th>
                <th className="py-2 pr-3">教師編號</th>
                <th className="py-2 pr-3">已使用次數 / 上限</th>
                <th className="py-2 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">
                    {row.created_at ? new Date(row.created_at).toLocaleString("zh-HK") : "-"}
                  </td>
                  <td className="py-2 pr-3">{row.tutor_name}</td>
                  <td className="py-2 pr-3">{row.tutor_mobile || "-"}</td>
                  <td className="py-2 pr-3">{row.tutor_email || "-"}</td>
                  <td className="py-2 pr-3 font-mono">{row.code}</td>
                  <td className="py-2 pr-3">
                    {row.current_uses} / {row.usage_limit}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => loadDetail(row.code)}
                      className="px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold"
                    >
                      查詢使用
                    </button>
                  </td>
                </tr>
              ))}
              {summaryRows.length === 0 && !summaryLoading && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-400">
                    沒有符合條件的資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Part 2：教師編號使用明細查詢</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={detailCode}
            onChange={(e) => setDetailCode(normalizeReferralCodeInput(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && loadDetail()}
            placeholder="輸入 6 位數字教師編號"
            maxLength={6}
            className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => loadDetail()}
            disabled={detailLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {detailLoading ? "查詢中..." : "查詢"}
          </button>
        </div>

        {detailResult?.found && detailResult.code && (
          <p className="text-sm text-gray-600">
            教師編號：<span className="font-mono">{detailResult.code.code}</span> ｜ 教師：
            <span className="font-semibold"> {detailResult.code.tutor_name}</span> ｜ 教師手機：
            <span className="font-semibold"> {detailResult.code.tutor_mobile || "-"}</span> ｜ 教師電郵：
            <span className="font-semibold"> {detailResult.code.tutor_email || "-"}</span> ｜ 已使用：
            <span className="font-semibold"> {detailResult.code.current_uses}</span> /
            {detailResult.code.usage_limit}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">使用日期</th>
                <th className="py-2 pr-3">電話號碼</th>
                <th className="py-2 pr-3">家長狀態</th>
              </tr>
            </thead>
            <tbody>
              {(detailResult?.rows ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">
                    {row.used_at ? new Date(row.used_at).toLocaleString("zh-HK") : "-"}
                  </td>
                  <td className="py-2 pr-3">{row.mobile_number}</td>
                  <td className="py-2 pr-3">{row.parent_status}</td>
                </tr>
              ))}
              {!detailLoading && (detailResult?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400">
                    沒有可顯示的使用明細
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-xs text-gray-500">可匯出目前查詢結果（CSV / PDF）</p>
          <div className="flex gap-2">
            <button
              onClick={exportDetailCsv}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              匯出 CSV
            </button>
            <button
              onClick={exportDetailPdf}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800"
            >
              匯出 PDF
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Part 3：重設導師登入密碼</h3>
        <p className="text-xs text-gray-500">
          輸入教師編號後可重設密碼為 <span className="font-mono">123456</span>。重設後會清除錯誤次數鎖定，並要求導師下次登入先更新密碼。
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={resetCode}
            onChange={(e) => setResetCode(normalizeReferralCodeInput(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
            placeholder="輸入 6 位數字教師編號"
            maxLength={6}
            className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={handleResetPassword}
            disabled={resetLoading}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
          >
            {resetLoading ? "重設中..." : "重設為 123456"}
          </button>
        </div>
        {resetMsg && (
          <p
            className={`text-sm ${
              resetMsg.includes("失敗") || resetMsg.includes("錯誤")
                ? "text-red-500"
                : "text-emerald-600"
            }`}
          >
            {resetMsg}
          </p>
        )}
      </div>
    </div>
  );
}
