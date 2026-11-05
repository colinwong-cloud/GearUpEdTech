import type { GuoyuWorksheetRow } from "@/lib/guoyu/worksheet";

export const GUOYU_RESULT_PAYLOAD_KEY = "gearup_guoyu_result_payload_v1";

export type GuoyuResultPayload = {
  sourceText: string;
  rows: GuoyuWorksheetRow[];
};

export function saveGuoyuResultPayload(payload: GuoyuResultPayload): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(GUOYU_RESULT_PAYLOAD_KEY, JSON.stringify(payload));
}

export function readGuoyuResultPayload(): GuoyuResultPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(GUOYU_RESULT_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuoyuResultPayload;
  } catch {
    return null;
  }
}

export function clearGuoyuResultPayload(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(GUOYU_RESULT_PAYLOAD_KEY);
}
