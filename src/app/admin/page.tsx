"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { BusinessKpiSection } from "./business-kpi";

const ADMIN_USER = "colinwong";
const ADMIN_PASS = "qweasd";

type Tab = "quota" | "delete" | "email" | "questions" | "business";

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

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("business");

  const handleLogin = () => {
    if (loginId === ADMIN_USER && loginPass === ADMIN_PASS) {
      setLoggedIn(true);
      setLoginError("");
    } else {
      setLoginError("帳號或密碼錯誤");
    }
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
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all"
            >
              登入
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "business", label: "業務概覽" },
    { key: "quota", label: "題目配額" },
    { key: "delete", label: "刪除帳戶" },
    { key: "email", label: "電郵通知" },
    { key: "questions", label: "題目管理" },
  ];

  return (
    <div className="admin-console-root min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">管理員控制台</span>
        <button onClick={() => setLoggedIn(false)} className="text-sm text-gray-500 hover:text-red-500">登出</button>
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

        {tab === "business" && <BusinessKpiSection user={loginId} pass={loginPass} />}
        {tab === "quota" && <QuotaSection />}
        {tab === "delete" && <DeleteSection />}
        {tab === "email" && <EmailSection />}
        {tab === "questions" && <QuestionsSection />}
      </div>
    </div>
  );
}

function QuotaSection() {
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
        const { data } = await supabase.rpc("admin_search_parent", { p_mobile: searchVal.trim() });
        if (!data) { setMsg("找不到此電話號碼"); return; }
        setParentInfo(data as ParentInfo);
      } else {
        const { data } = await supabase.rpc("admin_search_parent", { p_mobile: "" });
        void data;
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
      const { data, error } = await supabase.rpc("admin_add_quota", {
        p_student_id: studentId,
        p_subject: "數學",
        p_amount: amount,
      });
      if (error) throw error;
      const result = data as { remaining_questions: number };
      setMsg(`成功增加 ${amount} 題，新餘額：${result.remaining_questions}`);
      setAddAmount("");
      handleSearch();
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

function DeleteSection() {
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
      const { data } = await supabase.rpc("admin_search_parent", { p_mobile: mobile.trim() });
      if (!data) { setMsg("找不到此電話號碼"); return; }
      setParentInfo(data as ParentInfo);
    } catch { setMsg("搜尋失敗"); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!mobile.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_delete_parent", { p_mobile: mobile.trim() });
      if (error) throw error;
      const result = data as { deleted: boolean; students_deleted?: number };
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

function EmailSection() {
  const [globalEnabled, setGlobalEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [, setPerEmailEnabled] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadGlobal = async () => {
    const { data } = await supabase.rpc("admin_get_settings");
    if (data) {
      const s = data as Record<string, string>;
      setGlobalEnabled(s.email_notifications_enabled !== "false");
    }
  };

  if (globalEnabled === null) { loadGlobal(); }

  const toggleGlobal = async () => {
    setLoading(true);
    const newVal = !globalEnabled;
    try {
      await supabase.rpc("admin_set_setting", {
        p_key: "email_notifications_enabled",
        p_value: newVal ? "true" : "false",
      });
      setGlobalEnabled(newVal);
      setMsg(`全局電郵通知已${newVal ? "開啟" : "關閉"}`);
    } catch { setMsg("設定失敗"); }
    finally { setLoading(false); }
  };

  const handleEmailToggle = async (enabled: boolean) => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_email_notification", {
        p_email: email.trim(),
        p_enabled: enabled,
      });
      if (error) throw error;
      const result = data as { updated: number };
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
          <button onClick={toggleGlobal} disabled={loading}
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

function QuestionsSection() {
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
      const { data, error } = await supabase.rpc("admin_search_questions", { p_query: query.trim() });
      if (error) throw error;
      setResults((data as QuestionResult[]) || []);
      if (!data || (data as QuestionResult[]).length === 0) setMsg("找不到相關題目");
    } catch { setMsg("搜尋失敗"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!editing) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("admin_update_question", {
        p_id: editing.id,
        p_content: editing.content,
        p_opt_a: editing.opt_a,
        p_opt_b: editing.opt_b,
        p_opt_c: editing.opt_c,
        p_opt_d: editing.opt_d,
        p_correct_answer: editing.correct_answer,
        p_explanation: editing.explanation,
      });
      if (error) throw error;
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
