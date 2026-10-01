"use client";

import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";
import { useCallback, useEffect, useMemo, useState } from "react";
import { filenameFromContentDisposition, hktMonthLabel } from "@/lib/tutor-practice-paper";
import { redirectToTutorPlanCheckout } from "@/lib/tutor-plan-checkout";

type TutorSessionPayload = {
  authenticated: boolean;
  code?: string;
  tutor_name?: string;
  must_change_password?: boolean;
};

type TutorStudentRow = {
  student_id: string;
  student_name: string;
  registered_mobile: string;
  hash: string;
  linked_at: string;
  last_practice_at: string | null;
};

type TutorMessageTone = "error" | "warning" | "success" | "info";

type PracticePaperOverviewRow = {
  id: string;
  student_name: string;
  registered_mobile: string;
  subject_label: string;
  month_key: string;
  created_at: string;
};

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

const pageShell = "min-h-screen bg-white/60 backdrop-blur-sm";
const fieldClass =
  "w-full rounded-xl border-2 border-gray-200 bg-white p-3 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400";
const primaryButtonClass =
  "mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:opacity-50";

function messageClassByTone(tone: TutorMessageTone): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-indigo-100 bg-indigo-50 text-indigo-800";
}

export default function TutorPortalPage() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<TutorSessionPayload>({ authenticated: false });

  const [loginCode, setLoginCode] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [authView, setAuthView] = useState<"login" | "register" | "registered">("login");
  const [regName, setRegName] = useState("");
  const [regMobile, setRegMobile] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [issuedLogin, setIssuedLogin] = useState<{
    code: string;
    temporaryPassword: string;
    emailSent: boolean;
  } | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  const [rows, setRows] = useState<TutorStudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [planActive, setPlanActive] = useState(false);
  const [planUntil, setPlanUntil] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [paperUsed, setPaperUsed] = useState(0);
  const [paperLimit, setPaperLimit] = useState(4);
  const [paperRemaining, setPaperRemaining] = useState(4);
  const [paperMonthKey, setPaperMonthKey] = useState("");
  const [paperRows, setPaperRows] = useState<PracticePaperOverviewRow[]>([]);
  const [paperMsg, setPaperMsg] = useState("");

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

  const loadPlan = useCallback(async () => {
    if (!isAuthenticated || mustChangePassword) return;
    try {
      const res = await fetch("/api/tutor/billing", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { data?: { active?: boolean; paidUntil?: string | null } }
        | null;
      if (!res.ok) return;
      setPlanActive(Boolean(payload?.data?.active));
      setPlanUntil(payload?.data?.paidUntil ?? null);
    } catch {
      setPlanActive(false);
    }
  }, [isAuthenticated, mustChangePassword]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const loadPaperOverview = useCallback(async () => {
    if (!isAuthenticated || mustChangePassword) return;
    try {
      const res = await fetch("/api/tutor/practice-papers/overview", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | {
            data?: {
              month_key?: string;
              used?: number;
              limit?: number;
              remaining?: number;
              papers?: PracticePaperOverviewRow[];
            };
            error?: string;
          }
        | null;
      if (!res.ok) throw new Error(payload?.error || "無法載入練習卷總覽。");
      setPaperUsed(Number(payload?.data?.used ?? 0));
      setPaperLimit(Number(payload?.data?.limit ?? 4));
      setPaperRemaining(Number(payload?.data?.remaining ?? 0));
      setPaperMonthKey(String(payload?.data?.month_key ?? ""));
      setPaperRows(payload?.data?.papers ?? []);
      setPaperMsg("");
    } catch (err) {
      setPaperRows([]);
      setPaperMsg(err instanceof Error ? err.message : "無法載入練習卷總覽。");
    }
  }, [isAuthenticated, mustChangePassword]);

  useEffect(() => {
    loadPaperOverview();
  }, [loadPaperOverview]);

  const downloadOverviewPaper = async (paperId: string, kind: "student" | "answer") => {
    setPaperMsg("");
    try {
      const res = await fetch(`/api/tutor/practice-papers/${paperId}/pdf?kind=${kind}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "未能下載 PDF。");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromContentDisposition(
        res.headers.get("Content-Disposition"),
        kind === "answer" ? "gearup-practice-answer.pdf" : "gearup-practice-student.pdf"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPaperMsg(err instanceof Error ? err.message : "未能下載 PDF。");
    }
  };

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return;
    const params = new URLSearchParams(window.location.search);
    const intentId = params.get("intent_id") || "";
    if (params.get("billing") !== "success" || !intentId) return;
    let cancelled = false;
    const confirm = async () => {
      setPlanLoading(true);
      try {
        const res = await fetch("/api/tutor/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent_id: intentId }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { data?: { paid?: boolean; paid_until?: string | null }; error?: string }
          | null;
        if (!res.ok) throw new Error(payload?.error || "未能確認付款。");
        if (!cancelled) {
          setMsg(payload?.data?.paid ? "導師進階版已開通。" : "付款尚未完成。");
          await loadPlan();
          window.history.replaceState({}, "", "/tutor");
        }
      } catch (err) {
        if (!cancelled) setMsg(err instanceof Error ? err.message : "未能確認付款。");
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    };
    void confirm();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loadPlan, mustChangePassword]);

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

  const handleRegister = async () => {
    if (!regName.trim() || !/^\d{8}$/.test(regMobile) || !regEmail.trim()) {
      setMsg("請填寫姓名、8 位數字手機及電郵。");
      return;
    }
    if (!turnstileSiteKey || !turnstileToken) {
      setMsg("請完成人機驗證。");
      return;
    }
    setRegLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/tutor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tutor_name: regName.trim(),
          tutor_mobile: regMobile,
          tutor_email: regEmail.trim(),
          turnstile_token: turnstileToken,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string; temporary_password?: string; email_sent?: boolean }
        | null;
      if (!res.ok || !payload?.ok || !payload.code || !payload.temporary_password) {
        throw new Error(payload?.error || "登記失敗。");
      }
      setIssuedLogin({
        code: payload.code,
        temporaryPassword: payload.temporary_password,
        emailSent: Boolean(payload.email_sent),
      });
      setAuthView("registered");
      setRegName("");
      setRegMobile("");
      setRegEmail("");
      setTurnstileToken(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "登記失敗。");
    } finally {
      setRegLoading(false);
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
      <div className={`${pageShell} flex items-center justify-center`}>
        <p className="text-sm text-gray-500">載入中...</p>
      </div>
    );
  }

  if (!isAuthenticated && authView === "registered" && issuedLogin) {
    return (
      <div className={`${pageShell} flex items-center justify-center px-4 py-10`}>
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold text-indigo-700">GearUp Tutor</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-800">登記完成</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              請抄下教師編號及首次密碼。首次登入後必須更新密碼。
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg space-y-3">
            <p className="text-sm text-gray-700">
              教師編號：<span className="font-mono font-semibold">{issuedLogin.code}</span>
            </p>
            <p className="text-sm text-gray-700">
              首次密碼：<span className="font-mono font-semibold">{issuedLogin.temporaryPassword}</span>
            </p>
            <p className="text-sm text-gray-600">
              {issuedLogin.emailSent
                ? "我們亦已把資料寄到你的電郵。"
                : "電郵暫時未能寄出，請先抄下以上資料。"}
            </p>
            <p className="text-sm text-gray-600">學生註冊時請填寫此教師編號。</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoginCode(issuedLogin.code);
              setIssuedLogin(null);
              setAuthView("login");
              setMsg("");
            }}
            className={primaryButtonClass}
          >
            前往登入
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && authView === "register") {
    return (
      <div className={`${pageShell} flex items-center justify-center px-4 py-10`}>
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold text-indigo-700">GearUp Tutor</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-800">導師自行登記</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              填寫姓名、手機及電郵。系統會分配教師編號及首次密碼。
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
            {msg && (
              <p className={`mb-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>{msg}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">導師姓名</label>
                <input
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">手機（8位數字）</label>
                <input
                  value={regMobile}
                  onChange={(e) => setRegMobile(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  maxLength={8}
                  inputMode="numeric"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">電郵</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className={fieldClass}
                />
              </div>
              {turnstileSiteKey ? (
                <div className="flex justify-center">
                  <Turnstile
                    siteKey={turnstileSiteKey}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken(null)}
                    onError={() => setTurnstileToken(null)}
                    options={{ theme: "light", size: "normal" }}
                  />
                </div>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  驗證服務未配置。
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleRegister}
              disabled={regLoading}
              className={primaryButtonClass}
            >
              {regLoading ? "登記中..." : "登記"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setAuthView("login");
              setMsg("");
            }}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            返回登入
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={`${pageShell} flex items-center justify-center px-4 py-10`}>
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold text-indigo-700">GearUp Tutor</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-800">導師登入</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              以教師編號與密碼登入。首次登入後必須更新為新密碼。
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">

          {msg && (
            <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>
              {msg}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                教師編號（6位數字）
              </label>
              <input
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                placeholder="例如 123456"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">密碼</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="輸入密碼"
                className={fieldClass}
              />
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className={primaryButtonClass}
          >
            {loginLoading ? "登入中..." : "登入"}
          </button>
          </div>

          <Link
            href="/"
            data-anti-missing="tutor-login-back-to-main"
            onClick={() => {
              console.info(
                '[anti-missing][tutor][login] back-to-main-clicked {"policy_version":"tutor-login-back-v1","target":"/"}'
              );
            }}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            返回主頁
          </Link>

          <button
            type="button"
            onClick={() => {
              setAuthView("register");
              setMsg("");
            }}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
          >
            導師自行登記
          </button>

          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-center text-sm text-indigo-700">
            忘記密碼或輸入錯誤超過上限？請聯絡管理員處理重設。
          </div>
        </div>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className={`${pageShell} flex items-center justify-center px-4 py-10`}>
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold text-indigo-700">GearUp Tutor</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-800">首次登入請更新密碼</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">為保障帳戶安全，請先更新密碼後才可查看學生練習記錄。</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">

          {msg && (
            <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${messageClass}`}>
              {msg}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">目前密碼</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">確認新密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changeLoading}
            className={primaryButtonClass}
          >
            {changeLoading ? "更新中..." : "更新密碼"}
          </button>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-sky-200 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-200"
          >
            登出
          </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">導師學生練習總覽</h1>
            <p className="text-sm text-gray-500">
              教師編號：<span className="font-mono">{session.code || "-"}</span>
            </p>
            <p className="text-xs text-gray-400">學生註冊時請填寫此教師編號。同一登記手機如有多位學生，會分列顯示；View 只開啟該學生。</p>
          </div>
        </div>

        {msg && <p className="text-sm text-red-500">{msg}</p>}

        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800">導師進階版</h2>
              <p className="mt-1 text-sm text-gray-500">
                HK$199/月。開通後可查看同學對比：同校、同區、同年級，以及自選學校及年級。每月由已授權的付款方式自動續費。
              </p>
              <p className="mt-1 text-sm text-gray-700">
                {planActive && planUntil
                  ? `已生效，至 ${formatDateTime(planUntil)}。`
                  : "尚未開通。"}
              </p>
            </div>
            <button
              type="button"
              disabled={planLoading || planActive}
              onClick={async () => {
                setPlanLoading(true);
                setMsg("");
                try {
                  await redirectToTutorPlanCheckout();
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : "未能建立付款。");
                  setPlanLoading(false);
                }
              }}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {planActive ? "已開通" : planLoading ? "前往付款..." : "前往 Airwallex 付款"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">練習卷總覽</h2>
            <p className="mt-1 text-sm text-gray-500">全部已連結學生合計。餘額按香港時間的月份計算。學生卷及答案卷計作 1 份。重新下載不會再計。列表只顯示近 180 日的練習卷。</p>
            <p className="mt-2 text-sm font-semibold text-indigo-800">
              {paperMonthKey ? hktMonthLabel(paperMonthKey) : "本月"}已生成 {paperUsed} / {paperLimit} 份，尚餘 {paperRemaining} 份。
            </p>
          </div>
          {paperMsg && <p className="text-sm text-rose-600">{paperMsg}</p>}
          {paperRows.length === 0 ? (
            <p className="text-sm text-gray-400">近 180 日尚未生成練習卷。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3">日期</th>
                    <th className="py-2 pr-3">學生</th>
                    <th className="py-2 pr-3">登記手機</th>
                    <th className="py-2 pr-3">科目</th>
                    <th className="py-2 pr-3">下載</th>
                  </tr>
                </thead>
                <tbody>
                  {paperRows.map((paper) => (
                    <tr key={paper.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{formatDateTime(paper.created_at)}</td>
                      <td className="py-2 pr-3">{paper.student_name || "學生"}</td>
                      <td className="py-2 pr-3 font-mono">{paper.registered_mobile || "—"}</td>
                      <td className="py-2 pr-3">{paper.subject_label}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => downloadOverviewPaper(paper.id, "student")}
                          className="mr-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700"
                        >
                          學生卷
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadOverviewPaper(paper.id, "answer")}
                          className="rounded-lg border border-sky-200 bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                        >
                          答案卷
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="輸入登記手機搜尋"
              className="flex-1 rounded-xl border-2 border-gray-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => loadStudents(search)}
              disabled={listLoading}
              className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
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
                <th className="py-2 pr-3">學生姓名</th>
                <th className="py-2 pr-3">最後練習日期時間</th>
                <th className="py-2 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.student_id || row.hash} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{index + 1}</td>
                  <td className="py-2 pr-3 font-mono">{row.registered_mobile}</td>
                  <td className="py-2 pr-3">{row.student_name || "學生"}</td>
                  <td className="py-2 pr-3">{formatDateTime(row.last_practice_at)}</td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/tutor/student/${encodeURIComponent(row.hash)}`}
                      className="inline-flex rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && !listLoading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    沒有符合條件的資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={handleLogout}
              className="w-full rounded-xl border border-sky-200 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-200 sm:w-auto"
            >
              登出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
