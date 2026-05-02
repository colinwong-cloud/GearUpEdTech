"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const PIN_RE = /^[A-Za-z0-9]{6}$/;
  const pinValid = PIN_RE.test(newPin);

  const handleReset = async () => {
    if (!token || !pinValid) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcErr } = await supabase.rpc("reset_password", {
        p_token: token,
        p_new_pin: newPin,
      });
      if (rpcErr) throw rpcErr;
      const result = data as { success: boolean; reason?: string };
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.reason === "invalid_or_expired" ? "連結已失效或已使用，請重新申請。" : "重設失敗，請重試。");
      }
    } catch {
      setError("重設失敗，請重試。");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">無效連結</h1>
          <p className="text-sm text-gray-500 mb-6">此密碼重設連結無效。</p>
          <Link href="/" className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all">
            返回首頁
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">密碼已重設</h1>
          <p className="text-sm text-gray-500 mb-6">你的密碼已成功更新，請使用新密碼登入。</p>
          <Link href="/" className="inline-block px-8 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-md">
            重新登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">重設密碼</h1>
          <p className="mt-2 text-gray-500">請輸入新的 6 位英文或數字密碼</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
          <input
            type="text"
            value={newPin}
            onChange={(e) => {
              setNewPin(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6));
              setError("");
            }}
            maxLength={6}
            placeholder="新密碼（6位英文或數字）"
            className={`w-full p-4 rounded-xl border-2 text-center text-xl tracking-[0.3em] outline-none transition-colors ${
              newPin.length > 0 && !pinValid ? "border-red-300" : "border-gray-200 focus:border-indigo-400"
            }`}
          />
          {newPin.length > 0 && !pinValid && (
            <p className="text-xs text-red-500 text-center">請輸入6位英文字母或數字</p>
          )}
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <button
            onClick={handleReset}
            disabled={!pinValid || loading}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
              pinValid && !loading
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {loading ? "處理中..." : "確認"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
