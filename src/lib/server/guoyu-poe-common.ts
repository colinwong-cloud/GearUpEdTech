export const POE_CHAT_COMPLETIONS_URL = "https://api.poe.com/v1/chat/completions";

export const POE_MODEL_OCR_PINYIN = "GPT-5.4";
export const POE_MODEL_TTS = "Gemini-3.1-Flash-TTS";

export type PoeServiceError = {
  ok: false;
  error: string;
  missingKey?: boolean;
};

export function resolvePoeApiKey(apiKey?: string): string | null {
  const key = apiKey ?? process.env.POE_API_KEY?.trim();
  return key || null;
}

export function poeMissingKeyError(service: "ocr" | "pinyin" | "tts"): PoeServiceError {
  if (service === "ocr") {
    return {
      ok: false,
      error: "OCR 服務未設定（缺少 POE_API_KEY），請改用手動輸入文字。",
      missingKey: true,
    };
  }
  if (service === "pinyin") {
    return {
      ok: false,
      error: "拼音服務未設定（缺少 POE_API_KEY），請稍後再試。",
      missingKey: true,
    };
  }
  return {
    ok: false,
    error: "朗讀服務未設定（缺少 POE_API_KEY），請稍後再試。",
    missingKey: true,
  };
}
