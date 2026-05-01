"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function subscribeStandalone(onStoreChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getStandaloneSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function getStandaloneServerSnapshot(): boolean {
  return false;
}

export function LoginAddToHomeButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot
  );
  const [tipsOpen, setTipsOpen] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const handleClick = async () => {
    if (standalone) return;
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    setTipsOpen(true);
  };

  if (standalone) {
    return (
      <p className="text-center text-sm text-gray-500">已加入主畫面</p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="w-full rounded-xl border-2 border-indigo-200 bg-indigo-50/90 py-3 text-base font-semibold text-indigo-900 transition-colors hover:bg-indigo-100"
      >
        加入主畫面
      </button>

      {tipsOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-home-tips-title"
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="add-home-tips-title" className="text-lg font-bold text-gray-900">
              將 GearUp 加入主畫面
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-gray-700">
              <li>
                <span className="font-semibold text-gray-800">iPhone／iPad（Safari）</span>
                ：點選底部分享圖示 →「加入主畫面」→「加入」。
              </li>
              <li>
                <span className="font-semibold text-gray-800">Android（Chrome）</span>
                ：點選右上角選單 ⋮ →「加入主畫面」或「安裝應用程式」。
              </li>
              <li>
                <span className="font-semibold text-gray-800">Windows／Mac（Chrome／Edge）</span>
                ：網址列右側若出現「安裝」圖示可一鍵安裝；或使用選單中的「安裝 GearUp Quiz」。
              </li>
              <li>
                <span className="font-semibold text-gray-800">Mac（Safari）</span>
                ：可將網頁加入 Dock，或使用「檔案」→「加入 Dock」／加入書籤以便日後開啟。
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setTipsOpen(false)}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white hover:bg-indigo-700"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
