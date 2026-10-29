import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOME_PAGE_NOTICE_TABLE_HINT,
  isMissingHomePageNoticeTableError,
  parseHomePageNoticeAdminRow,
  type HomePageNoticeAdminSettings,
} from "@/lib/home-page-notice";

export async function adminHomePageNoticeGet(
  admin: SupabaseClient
): Promise<HomePageNoticeAdminSettings> {
  const { data, error } = await admin
    .from("home_page_notice_settings")
    .select("enabled, body_text, image_url, link_url, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (isMissingHomePageNoticeTableError(msg)) {
      return {
        enabled: false,
        body_text: null,
        image_url: null,
        link_url: null,
        updated_at: null,
        error: HOME_PAGE_NOTICE_TABLE_HINT,
      };
    }
    throw new Error(msg);
  }

  return parseHomePageNoticeAdminRow(data ?? { enabled: false });
}

export async function adminHomePageNoticeUpdate(
  admin: SupabaseClient,
  input: {
    enabled: boolean;
    body_text: string | null;
    image_url: string | null;
    link_url: string | null;
  }
): Promise<HomePageNoticeAdminSettings> {
  const payload = {
    id: 1,
    enabled: Boolean(input.enabled),
    body_text: input.body_text?.trim() ? input.body_text.trim() : null,
    image_url: input.image_url?.trim() ? input.image_url.trim() : null,
    link_url: input.link_url?.trim() ? input.link_url.trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("home_page_notice_settings").upsert(payload, { onConflict: "id" });
  if (error) {
    const msg = error.message ?? "";
    if (isMissingHomePageNoticeTableError(msg)) {
      throw new Error(HOME_PAGE_NOTICE_TABLE_HINT);
    }
    throw new Error(msg);
  }

  return adminHomePageNoticeGet(admin);
}
