export type CookiePolicyLanguage = "zh-HK" | "en";

export type CookieConsentAction =
  | "accept_all"
  | "reject_non_essential"
  | "save_preferences";

export interface CookieConsentPreferences {
  necessary: true;
  analytics: boolean;
  advertising: boolean;
  updated_at: string;
  action: CookieConsentAction;
}

export interface CookiePreferenceDraft {
  analytics: boolean;
  advertising: boolean;
}

export const COOKIE_CONSENT_STORAGE_KEY = "gearup_cookie_consent_v1";

export interface CookiePolicySection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface CookiePolicyCopy {
  heading: string;
  intro: string[];
  sections: CookiePolicySection[];
  footer: string[];
  lastUpdated: string;
}

export const COOKIE_POLICY_COPY: Record<CookiePolicyLanguage, CookiePolicyCopy> =
  {
    "zh-HK": {
      heading: "Cookie 與私隱聲明",
      intro: [
        "我們（GearUp EduTech Limited）重視你的私隱。本網站使用 Cookie 及相關技術，以提供核心功能、改善體驗及量度成效。",
        "根據香港《個人資料（私隱）條例》及私隱專員公署相關指引，我們會以清晰方式告知資料用途，並讓你就非必要 Cookie 作出選擇。",
      ],
      sections: [
        {
          title: "1) 我們使用哪些 Cookie",
          bullets: [
            "必要 Cookie（永遠啟用）：維持基本網站運作與安全功能，例如登入流程與防濫用機制。",
            "分析 Cookie（可選）：協助我們了解訪客行為，例如停留時間、操作流程及頁面表現，用於改善產品。",
            "廣告/重定向 Cookie（可選）：協助我們衡量廣告成效及建立受眾分群，以進行社交媒體再行銷。",
          ],
          paragraphs: [],
        },
        {
          title: "2) 你可如何選擇",
          paragraphs: [
            "你可以「接受全部」、「拒絕非必要」或在「管理設定」中自訂偏好。必要 Cookie 不可關閉，因為它們是網站正常運作所必需。",
            "你可隨時按網站的「Cookie 設定」重新開啟設定面板並更新選擇。",
          ],
        },
        {
          title: "3) 第三方服務與資料傳輸",
          paragraphs: [
            "在你同意後，我們可能使用第三方分析或廣告服務（例如 Google Tag Manager / Google Analytics / 社交平台廣告工具）。",
            "相關服務供應商可能在香港以外地區處理資料。我們會採取合理措施，確保資料在傳輸及處理期間受到適當保護。",
          ],
        },
        {
          title: "4) 保留及查詢",
          paragraphs: [
            "我們只會在達成用途所需期間內保留資料，並按業務與法規要求處理。",
            "如你對本聲明、資料存取或更正有任何查詢，可電郵聯絡：cs@hkedutech.com。",
          ],
        },
      ],
      footer: [
        "使用本網站即代表你已閱讀本聲明。你作出的 Cookie 選擇將儲存在你的瀏覽器，以便下次瀏覽時沿用。",
      ],
      lastUpdated: "2026-05-15",
    },
    en: {
      heading: "Cookie & Privacy Notice",
      intro: [
        "We (GearUp EduTech Limited) value your privacy. This website uses cookies and similar technologies to provide core functionality, improve user experience, and measure performance.",
        "In line with the Hong Kong Personal Data (Privacy) Ordinance (PDPO) and PCPD guidance, we provide clear information and allow you to choose how non-essential cookies are used.",
      ],
      sections: [
        {
          title: "1) Types of cookies we use",
          bullets: [
            "Strictly necessary cookies (always on): required for essential site operation and security-related functions, including login flows and anti-abuse controls.",
            "Analytics cookies (optional): help us understand visitor behavior such as session duration, user journeys, and page performance to improve the product.",
            "Advertising/retargeting cookies (optional): help us measure campaign effectiveness and build audience segments for social media remarketing.",
          ],
          paragraphs: [],
        },
        {
          title: "2) Your choices",
          paragraphs: [
            "You can choose “Accept all”, “Reject non-essential”, or customize your preferences in “Manage settings”. Necessary cookies cannot be disabled because they are required for the site to function.",
            "You can revisit and update your choices at any time via “Cookie settings”.",
          ],
        },
        {
          title: "3) Third-party services and cross-border processing",
          paragraphs: [
            "With your consent, we may use third-party analytics and advertising tools (for example: Google Tag Manager, Google Analytics, and social platform ad tools).",
            "Service providers may process data outside Hong Kong. We apply reasonable safeguards to protect data during transfer and processing.",
          ],
        },
        {
          title: "4) Retention and contact",
          paragraphs: [
            "We retain data only for as long as necessary to fulfill the stated purposes and to meet legal or operational requirements.",
            "For enquiries about this notice, or to request data access/correction, please contact: cs@hkedutech.com.",
          ],
        },
      ],
      footer: [
        "By using this website, you acknowledge this notice. Your cookie choices are stored in your browser and reused on future visits.",
      ],
      lastUpdated: "2026-05-15",
    },
  };

export function createCookieConsentPreferences(
  draft: CookiePreferenceDraft,
  action: CookieConsentAction
): CookieConsentPreferences {
  return {
    necessary: true,
    analytics: Boolean(draft.analytics),
    advertising: Boolean(draft.advertising),
    updated_at: new Date().toISOString(),
    action,
  };
}

export function parseCookieConsentPreferences(
  raw: string | null | undefined
): CookieConsentPreferences | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CookieConsentPreferences> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const action = parsed.action;
    if (
      action !== "accept_all" &&
      action !== "reject_non_essential" &&
      action !== "save_preferences"
    ) {
      return null;
    }
    if (
      parsed.necessary !== true ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.advertising !== "boolean" ||
      typeof parsed.updated_at !== "string"
    ) {
      return null;
    }
    return {
      necessary: true,
      analytics: parsed.analytics,
      advertising: parsed.advertising,
      updated_at: parsed.updated_at,
      action,
    };
  } catch {
    return null;
  }
}
