"use client";

import { useEffect, useState } from "react";
import { BusinessKpiSection } from "./business-kpi";

type AdminConsoleAction =
  | "search_parent"
  | "add_quota"
  | "delete_parent"
  | "get_settings"
  | "set_setting"
  | "set_email_notification"
  | "search_questions"
  | "update_question"
  | "discount_code_list"
  | "discount_code_create"
  | "discount_code_update"
  | "discount_code_delete"
  | "discount_code_usage_summary"
  | "payment_status_enquiry";

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
  | "payment_status";

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
  } | null;
}

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
    { key: "payment_status", label: "付款狀態查詢" },
    { key: "delete", label: "刪除帳戶" },
    { key: "email", label: "電郵通知" },
    { key: "questions", label: "題目管理" },
    { key: "discount_codes", label: "折扣碼維護" },
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
        {tab === "payment_status" && <PaymentStatusSection sessionToken={sessionToken} />}
        {tab === "delete" && <DeleteSection sessionToken={sessionToken} />}
        {tab === "email" && <EmailSection sessionToken={sessionToken} />}
        {tab === "questions" && <QuestionsSection sessionToken={sessionToken} />}
        {tab === "discount_codes" && <DiscountCodeSection sessionToken={sessionToken} />}
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

function PaymentStatusSection({ sessionToken }: { sessionToken: string }) {
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<PaymentStatusEnquiryResult | null>(null);

  const handleSearch = async () => {
    if (!mobile.trim()) {
      setMsg("請輸入電話號碼");
      setResult(null);
      return;
    }
    setLoading(true);
    setMsg("");
    setResult(null);
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

  const paymentRows = result?.payment?.billed_last_12_months_by_month ?? [];

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
            </>
          )}
        </div>
      )}
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
