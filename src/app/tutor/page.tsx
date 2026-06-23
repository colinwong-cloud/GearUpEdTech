"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type TutorSessionPayload = {
  authenticated: boolean;
  code?: string;
  tutor_name?: string;
  must_change_password?: boolean;
};

type TutorStudentRow = {
  registered_mobile: string;
  linked_at: string;
  last_practice_at: string | null;
};

type TutorMessageTone = "error" | "warning" | "success" | "info";

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("zh-HK");
}

function resolveMessageTone(message: string): TutorMessageTone {
  if (!message) return "info";
  if (/(已更新|歡迎|成功)/.test(message)) return "success";
  if (/(鎖定|聯絡管理員|暫停|停用)/.test(message)) return "warning";
  return "error";
}

function messageClassByTone(tone: TutorMessageTone): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function TutorPortalPage() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<TutorSessionPayload>({ authenticated: false });

  const [loginCode, setLoginCode] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  const [rows, setRows] = useState<TutorStudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const isAuthenticated = Boolean(session.authenticated);
  const mustChangePassword = Boolean(session.must_change_password);

  const loadSession = useCallback(async () => {
    setBooting(true);
    setMsg("");
    try {
      const res = await fetch("/api/tutor/session", { method: "GET", cache: "no-store" });
      if (!res.ok) {
        setSession({ authenticated: false });
        return;
      }
      const data = (await res.json()) as TutorSessionPayload;
      setSession({
        authenticated: true,
        code: String(data.code ?? ""),
        tutor_name: data.tutor_name ?? "",
        must_change_password: Boolean(data.must_change_password),
      });
    } catch {
      setSession({ authenticated: false });
    } finally {
      setBooting(false);
    }
  }, []);

  const loadStudents = useCallback(
    async (query: string) => {
      if (!isAuthenticated || mustChangePassword) return;
      setListLoading(true);
      setMsg("");
      try {
        const url = `/api/tutor/students${query ? `?q=${encodeURIComponent(query)}` : ""}`;
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as
          | { data?: TutorStudentRow[]; error?: string }
          | null;
        if (!res.ok) {
          throw new Error(payload?.error || "無法載入名單。");
        }
        setRows(payload?.data ?? []);
      } catch (err) {
        setRows([]);
        setMsg(err instanceof Error ? err.message : "無法載入名單。");
      } finally {
        setListLoading(false);
      }
    },
    [isAuthenticated, mustChangePassword]
  );

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return;
    loadStudents("");
  }, [isAuthenticated, mustChangePassword, loadStudents]);

  const handleLogin = async () => {
    const code = loginCode.replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(code)) {
      setMsg("請輸入 6 位數字教師編號。");
      return;
    }
    if (!loginPassword) {
      setMsg("請輸入密碼。");
      return;
    }

    setLoginLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/tutor/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          password: loginPassword,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string; must_change_password?: boolean; locked_until?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "登入失敗。");
      }
      setSession({
        authenticated: true,
        code: payload.code || code,
        must_change_password: Boolean(payload.must_change_password),
      });
      setLoginPassword("");
      setMsg(payload.must_change_password ? "首次登入請先更新密碼。" : "");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "登入失敗。");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMsg("請完整填寫密碼欄位。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg("新密碼與確認密碼不一致。");
      return;
    }

    setChangeLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/tutor/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "更新密碼失敗。");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSession((prev) => ({ ...prev, must_change_password: false }));
      setMsg("密碼已更新，歡迎進入導師頁面。");
      await loadStudents("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "更新密碼失敗。");
    } finally {
      setChangeLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/tutor/session", { method: "DELETE" }).catch(() => null);
    setSession({ authenticated: false });
    setRows([]);
    setMsg("");
    setLoginPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const filteredRows = useMemo(() => rows, [rows]);
  const messageTone = useMemo(() => resolveMessageTone(msg), [msg]);
  const messageClass = useMemo(() => messageClassByTone(messageTone), [messageTone]);

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">載入中...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-50 px-4 py-8 sm:py-12">
        <div className="mx-auto grid w-full max-w-5xl gap-5 md:grid-cols-2">
          <section className="hidden rounded-3xl border border-indigo-100/60 bg-white/80 p-7 shadow-sm backdrop-blur md:flex md:flex-col md:justify-between">
            <div className="space-y-4">
              <p className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                GearUp 導師平台
              </p>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">導師學生學習追蹤中心</h1>
                <p className="text-sm leading-6 text-slate-600">
                  查看已綁定學生的練習紀錄與表現，快速跟進學習狀況。僅限有效教師編號登入使用。
                </p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="rounded-xl border border-slate-100 bg-white px-3 py-2">一個教師編號管理其已綁定學生名單</li>
              <li className="rounded-xl border border-slate-100 bg-white px-3 py-2">登入失敗達上限時，系統會暫時鎖定帳戶</li>
              <li className="rounded-xl border border-slate-100 bg-white px-3 py-2">首次登入後必須更新密碼，強化帳戶安全</li>
            </ul>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-indigo-100/40 sm:p-7">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Tutor Login</p>
              <h2 className="text-2xl font-bold text-slate-900">導師入口</h2>
              <p className="text-sm text-slate-600">
                使用教師編號登入（首次密碼為 123456，首次登入後必須修改密碼）。
              </p>
            </div>

            {msg && (
              <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>
                {msg}
              </p>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">教師編號（6位數字）</label>
                <input
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  placeholder="例如 123456"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">密碼</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="輸入密碼"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {loginLoading ? "登入中..." : "登入"}
            </button>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              忘記密碼或帳戶被鎖？請聯絡管理員重設密碼。
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-50 px-4 py-8 sm:py-12">
        <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-indigo-100/40 sm:p-7">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Security Update</p>
            <h1 className="text-2xl font-bold text-slate-900">首次登入請更新密碼</h1>
            <p className="text-sm text-slate-600">為保障帳戶安全，請先更新密碼後才可查看學生練習記錄。</p>
          </div>

          {msg && (
            <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>
              {msg}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">目前密碼</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">確認新密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changeLoading}
            className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {changeLoading ? "更新中..." : "更新密碼"}
          </button>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">導師學生練習總覽</h1>
            <p className="text-sm text-gray-500">
              教師編號：<span className="font-mono">{session.code || "-"}</span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            登出
          </button>
        </div>

        {msg && <p className="text-sm text-red-500">{msg}</p>}

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="輸入登記手機搜尋"
              className="flex-1 rounded-lg border border-gray-200 p-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => loadStudents(search)}
              disabled={listLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {listLoading ? "搜尋中..." : "搜尋"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-3 w-20">#</th>
                <th className="py-2 pr-3">登記手機</th>
                <th className="py-2 pr-3">最後練習日期時間</th>
                <th className="py-2 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.registered_mobile} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{index + 1}</td>
                  <td className="py-2 pr-3 font-mono">{row.registered_mobile}</td>
                  <td className="py-2 pr-3">{formatDateTime(row.last_practice_at)}</td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/tutor/student/${encodeURIComponent(row.registered_mobile)}`}
                      className="inline-flex rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && !listLoading && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-400">
                    沒有符合條件的資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
