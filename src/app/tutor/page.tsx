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
  if (tone === "success") return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  if (tone === "error") return "border-rose-300/40 bg-rose-400/10 text-rose-100";
  return "border-white/20 bg-white/10 text-slate-100";
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
      <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
          <div className="absolute -right-12 bottom-6 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-lg rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="space-y-3">
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">
              GearUp Tutor
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">導師登入</h1>
            <p className="text-sm leading-6 text-slate-200">
              以教師編號與密碼登入。首次密碼為 123456，首次登入後必須更新為新密碼。
            </p>
          </div>

          {msg && (
            <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>
              {msg}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                教師編號（6位數字）
              </label>
              <input
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                placeholder="例如 123456"
                className="w-full rounded-xl border border-white/20 bg-slate-900/50 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">密碼</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="輸入密碼"
                className="w-full rounded-xl border border-white/20 bg-slate-900/50 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {loginLoading ? "登入中..." : "登入"}
          </button>

          <div className="mt-4 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-200">
            忘記密碼或輸入錯誤超過上限？請聯絡管理員處理重設。
          </div>
        </div>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
          <div className="absolute -right-12 bottom-6 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-lg rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="space-y-3">
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">
              First Login Security
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">首次登入請更新密碼</h1>
            <p className="text-sm leading-6 text-slate-200">為保障帳戶安全，請先更新密碼後才可查看學生練習記錄。</p>
          </div>

          {msg && (
            <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>
              {msg}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">目前密碼</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-slate-900/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-slate-900/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">確認新密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-slate-900/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changeLoading}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {changeLoading ? "更新中..." : "更新密碼"}
          </button>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
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
