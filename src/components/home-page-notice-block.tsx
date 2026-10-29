"use client";

import { useHomePageNotice } from "@/lib/use-home-page-notice";

function NoticeInner({
  bodyText,
  imageUrl,
  linkUrl,
}: {
  bodyText: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
}) {
  const content = (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="主頁公告"
          className="w-full rounded-lg border border-gray-200"
        />
      ) : null}
      {bodyText ? (
        <p className={`text-sm text-gray-800 whitespace-pre-wrap ${imageUrl ? "mt-2" : ""}`}>
          {bodyText}
        </p>
      ) : null}
    </>
  );

  if (linkUrl) {
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        {content}
      </a>
    );
  }

  return <div>{content}</div>;
}

/** Admin-controlled notice for 選擇身份 — hidden when disabled or empty (fail-closed). */
export function HomePageNoticeBlock({ className = "" }: { className?: string }) {
  const { notice, loading } = useHomePageNotice();
  if (loading || !notice.visible) return null;

  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 ${className}`.trim()}
      data-testid="home-page-notice"
    >
      <NoticeInner bodyText={notice.body_text} imageUrl={notice.image_url} linkUrl={notice.link_url} />
    </div>
  );
}
