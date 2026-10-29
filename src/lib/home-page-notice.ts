export const HOME_PAGE_NOTICE_TABLE_HINT =
  "缺少主頁公告資料表，請先在 Supabase 執行 supabase_home_page_notice.sql。";

export type HomePageNoticePublic = {
  visible: boolean;
  body_text: string | null;
  image_url: string | null;
  link_url: string | null;
};

export type HomePageNoticeAdminSettings = {
  enabled: boolean;
  body_text: string | null;
  image_url: string | null;
  link_url: string | null;
  updated_at: string | null;
  error?: string | null;
};

const EMPTY_PUBLIC: HomePageNoticePublic = {
  visible: false,
  body_text: null,
  image_url: null,
  link_url: null,
};

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function parseHomePageNoticePublic(data: unknown): HomePageNoticePublic {
  if (!data || typeof data !== "object") return EMPTY_PUBLIC;
  const row = data as Record<string, unknown>;
  const visible = row.visible === true;
  if (!visible) return EMPTY_PUBLIC;
  const body_text = readNullableString(row.body_text);
  const image_url = readNullableString(row.image_url);
  const link_url = readNullableString(row.link_url);
  if (!body_text && !image_url) return EMPTY_PUBLIC;
  return { visible: true, body_text, image_url, link_url };
}

export function parseHomePageNoticeAdminRow(data: unknown): HomePageNoticeAdminSettings {
  if (!data || typeof data !== "object") {
    return {
      enabled: false,
      body_text: null,
      image_url: null,
      link_url: null,
      updated_at: null,
    };
  }
  const row = data as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    body_text: readNullableString(row.body_text),
    image_url: readNullableString(row.image_url),
    link_url: readNullableString(row.link_url),
    updated_at: readNullableString(row.updated_at),
  };
}

export function isMissingHomePageNoticeTableError(message: string): boolean {
  return /home_page_notice_settings|42P01|PGRST205|does not exist/i.test(message);
}
