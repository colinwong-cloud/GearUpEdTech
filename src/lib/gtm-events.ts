type EventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function normalizeParams(params: EventParams): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );
}

export function pushGtmEvent(event: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  const payload: Record<string, unknown> = {
    event,
    page_path: window.location.pathname,
    ...normalizeParams(params),
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

export function pushGtmEventOncePerSession(
  event: string,
  params: EventParams = {}
): boolean {
  if (typeof window === "undefined") return false;
  const key = `gtm:event-once:${event}`;
  try {
    if (window.sessionStorage.getItem(key) === "1") {
      return false;
    }
    pushGtmEvent(event, params);
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    // If sessionStorage is blocked, still emit event.
    pushGtmEvent(event, params);
    return true;
  }
}
