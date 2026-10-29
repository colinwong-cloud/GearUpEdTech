"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HOME_PAGE_NOTICE_TABLE_HINT,
  type HomePageNoticeAdminSettings,
} from "@/lib/home-page-notice";

type HomeNoticeAdminAction = "home_page_notice_get" | "home_page_notice_update";

async function homeNoticeAdminRequest<T>(
  action: HomeNoticeAdminAction,
  sessionToken: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const res = await fetch("/api/admin/console", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(body.error || "操作失敗");
  return body.data as T;
}

export function HomePageNoticeAdminSection({ sessionToken }: { sessionToken: string }) {
  const [settings, setSettings] = useState<HomePageNoticeAdminSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [bodyText, setBodyText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await homeNoticeAdminRequest<HomePageNoticeAdminSettings>(
        "home_page_notice_get",
        sessionToken
      );
      setSettings(data);
      setEnabled(Boolean(data.enabled));
      setBodyText(data.body_text ?? "");
      setImageUrl(data.image_url ?? "");
      setLinkUrl(data.link_url ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const data = await homeNoticeAdminRequest<HomePageNoticeAdminSettings>(
        "home_page_notice_update",
        sessionToken,
        {
          enabled,
          body_text: bodyText,
          image_url: imageUrl,
          link_url: linkUrl,
        }
      );
      setSettings(data);
      setMessage("已儲存主頁公告設定");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/home-page-notice/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
        credentials: "include",
        body: form,
      });
      const body = (await res.json()) as { image_url?: string; error?: string };
      if (!res.ok || !body.image_url) {
        throw new Error(body.error || "上載失敗");
      }
      setImageUrl(body.image_url);
      setMessage("海報已上載，請按「儲存設定」以發佈");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上載失敗");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-gray-900">主頁公告</h2>
        <p className="mt-1 text-sm text-gray-500">
          顯示於登入後「選擇身份」畫面、月費推廣卡上方。關閉或留空時不會顯示（fail-closed）。
        </p>
      </div>

      {settings?.error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {settings.error || HOME_PAGE_NOTICE_TABLE_HINT}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">載入中…</p>
      ) : (
        <>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 px-3 py-3">
            <span className="text-sm font-semibold text-gray-800">啟用</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={Boolean(settings?.error)}
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
                enabled ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          <div>
            <label className="text-sm font-semibold text-gray-800">文字</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={4}
              placeholder="可貼上 Traditional Chinese 公告文字"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-800">海報</label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="圖片網址（可上載或貼上）"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading || Boolean(settings?.error)}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {uploading ? "上載中…" : "上載海報圖片"}
              </button>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="預覽" className="h-16 rounded border border-gray-200 object-cover" />
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleUpload(file);
              }}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-800">連結（選填）</label>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            disabled={saving || Boolean(settings?.error)}
            onClick={() => void handleSave()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存設定"}
          </button>
        </>
      )}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
