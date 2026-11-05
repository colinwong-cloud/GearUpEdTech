import { stripLatinAndDigits } from "@/lib/guoyu/text";
import {
  POE_CHAT_COMPLETIONS_URL,
  POE_MODEL_OCR_PINYIN,
  poeMissingKeyError,
  resolvePoeApiKey,
} from "@/lib/server/guoyu-poe-common";

export type PoeOcrResult =
  | { ok: true; text: string }
  | { ok: false; error: string; missingKey?: boolean };

export async function extractChineseTextFromImageViaPoe(params: {
  mimeType: string;
  base64: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<PoeOcrResult> {
  const key = resolvePoeApiKey(params.apiKey);
  if (!key) {
    return poeMissingKeyError("ocr");
  }

  const fetchFn = params.fetchImpl ?? fetch;
  const dataUrl = `data:${params.mimeType};base64,${params.base64}`;

  const systemPrompt =
    "You extract Traditional or Simplified Chinese text from the image. Output only Chinese characters and Chinese punctuation. No English, numbers, explanations, or markdown. Maximum 1000 characters.";

  let res: Response;
  try {
    res = await fetchFn(POE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: POE_MODEL_OCR_PINYIN,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "請辨識圖片中的中文課文或報紙文字，只輸出中文及標點。",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 1200,
      }),
    });
  } catch {
    return { ok: false, error: "無法連接 OCR 服務，請稍後再試或改為手動輸入。" };
  }

  if (!res.ok) {
    return { ok: false, error: "無法辨識文字，請重試或改為手動輸入。" };
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = String(payload.choices?.[0]?.message?.content ?? "").trim();
  if (!raw) {
    return { ok: false, error: "無法辨識文字，請重試或改為手動輸入。" };
  }

  let cleaned = stripLatinAndDigits(raw);
  cleaned = cleaned.replace(/[^\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\ufe30-\ufe4f，。！？、；：「」『』（）【】《》…—－·．\s\n\r]/gu, "");
  cleaned = cleaned.replace(/\s+/gu, " ").trim();
  cleaned = [...cleaned].slice(0, 1000).join("");
  if (!cleaned.trim()) {
    return { ok: false, error: "無法辨識文字，請重試或改為手動輸入。" };
  }
  return { ok: true, text: cleaned };
}
