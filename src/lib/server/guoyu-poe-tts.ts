import { Buffer } from "node:buffer";
import {
  POE_CHAT_COMPLETIONS_URL,
  POE_MODEL_TTS,
  poeMissingKeyError,
  resolvePoeApiKey,
} from "@/lib/server/guoyu-poe-common";

export type PoeTtsResult =
  | { ok: true; audioBase64: string; contentType: string }
  | { ok: false; error: string; missingKey?: boolean };

type PoeMessage = {
  content?: string;
  attachments?: Array<{
    url?: string;
    mime_type?: string;
    content_type?: string;
    data?: string;
  }>;
  audio?: { data?: string; id?: string };
};

export function speakingRateToPoePaceTag(speakingRate: number): string {
  if (speakingRate <= 0.8) return "[slow] ";
  if (speakingRate >= 1.75) return "[fast] ";
  if (speakingRate >= 1.4) return "[slightly fast] ";
  if (speakingRate <= 0.9) return "[slow] ";
  return "";
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

export async function downloadAudioAsBase64(
  url: string,
  fetchImpl: typeof fetch
): Promise<{ base64: string; contentType: string } | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return null;
    return { base64: bufferToBase64(buf), contentType };
  } catch {
    return null;
  }
}

export function extractAudioFromPoeCompletion(
  payload: { choices?: Array<{ message?: PoeMessage }> },
  fetchImpl: typeof fetch
): Promise<{ base64: string; contentType: string } | null> {
  const message = payload.choices?.[0]?.message;
  if (!message) return Promise.resolve(null);

  if (message.audio?.data) {
    return Promise.resolve({
      base64: message.audio.data,
      contentType: "audio/mpeg",
    });
  }

  const attachments = message.attachments ?? [];
  for (const att of attachments) {
    if (att.data) {
      return Promise.resolve({
        base64: att.data,
        contentType: att.mime_type || att.content_type || "audio/mpeg",
      });
    }
    if (att.url) {
      return downloadAudioAsBase64(att.url, fetchImpl);
    }
  }

  const content = String(message.content ?? "");
  const dataUrl = content.match(/data:(audio\/[^;]+);base64,([A-Za-z0-9+/=\s]+)/i);
  if (dataUrl) {
    return Promise.resolve({
      contentType: dataUrl[1] ?? "audio/mpeg",
      base64: dataUrl[2]?.replace(/\s+/g, "") ?? "",
    });
  }

  const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
  if (urlMatch?.[0]) {
    return downloadAudioAsBase64(urlMatch[0], fetchImpl);
  }

  return Promise.resolve(null);
}

export async function synthesizeMandarinTts(params: {
  text: string;
  speakingRate: number;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<PoeTtsResult> {
  const key = resolvePoeApiKey(params.apiKey);
  if (!key) return poeMissingKeyError("tts");

  const fetchFn = params.fetchImpl ?? fetch;
  const pace = speakingRateToPoePaceTag(params.speakingRate);
  const userText = `${pace}請用普通話朗讀以下中文課文：\n${params.text.slice(0, 5000)}`;

  let res: Response;
  try {
    res = await fetchFn(POE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: POE_MODEL_TTS,
        stream: false,
        messages: [{ role: "user", content: userText }],
        max_tokens: 4096,
      }),
    });
  } catch {
    return { ok: false, error: "無法朗讀，請稍後再試。" };
  }

  if (!res.ok) {
    return { ok: false, error: "無法朗讀，請稍後再試。" };
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: PoeMessage }> };
  const audio = await extractAudioFromPoeCompletion(payload, fetchFn);
  if (!audio?.base64) {
    return { ok: false, error: "無法朗讀，請稍後再試。" };
  }

  return {
    ok: true,
    audioBase64: audio.base64,
    contentType: audio.contentType || "audio/mpeg",
  };
}
