import { NextResponse } from "next/server";
import { getShareBannerUrl } from "@/lib/login-marketing-assets";

function resolveShareBannerUrl(): string {
  const explicit =
    process.env.SHARE_BANNER_URL?.trim() ||
    process.env.NEXT_PUBLIC_SHARE_BANNER_URL?.trim();
  if (explicit) return explicit;
  const inferred = getShareBannerUrl();
  return inferred;
}

export async function GET() {
  const imageUrl = resolveShareBannerUrl();
  if (!imageUrl) {
    return NextResponse.json(
      {
        error:
          "Share banner URL is not configured. Set NEXT_PUBLIC_SHARE_BANNER_URL or NEXT_PUBLIC_SUPABASE_URL.",
      },
      { status: 503 }
    );
  }
  const upstream = await fetch(imageUrl, {
    method: "GET",
    cache: "force-cache",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Unable to fetch share banner (status ${upstream.status})` },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const cacheControl =
    upstream.headers.get("cache-control") ||
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      // Allow social bots to cache/preview without indexing restrictions.
      "X-Robots-Tag": "all",
    },
  });
}
