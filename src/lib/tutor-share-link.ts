export const TUTOR_SHARE_ORIGIN = "https://www.gearupquiz.com";

const TUTOR_CODE_RE = /^\d{6}$/;

/** Read a 6-digit tutor code from a page search string such as `?tutor=112233`. */
export function readTutorCodeFromSearch(search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get("tutor")?.trim() || "";
  return TUTOR_CODE_RE.test(raw) ? raw : "";
}

/** Unique registration link for one tutor. The code in the link is that tutor's code. */
export function buildTutorShareUrl(code: string, origin = TUTOR_SHARE_ORIGIN): string {
  const url = new URL(origin.endsWith("/") ? origin : `${origin}/`);
  url.searchParams.set("tutor", code);
  return url.toString();
}

/**
 * WhatsApp text. The registration link is first, the same way the main page
 * shares its homepage URL, so WhatsApp shows the GearUp title, description,
 * and preview image.
 */
export function buildTutorWhatsAppText(code: string, origin = TUTOR_SHARE_ORIGIN): string {
  const link = buildTutorShareUrl(code, origin);
  return `${link}\n請按此連結登記增分寶，登記時會自動填上我的教師編號。`;
}
