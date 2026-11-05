import { isCjkCharacter } from "@/lib/guoyu/text";
import {
  POE_CHAT_COMPLETIONS_URL,
  POE_MODEL_OCR_PINYIN,
  poeMissingKeyError,
  resolvePoeApiKey,
} from "@/lib/server/guoyu-poe-common";

export type PoePinyinLineResult =
  | { ok: true; lines: string[] }
  | { ok: false; error: string; missingKey?: boolean };

const PINYIN_SYSTEM =
  "You convert Chinese text to standard Mandarin Hanyu Pinyin with tone marks. " +
  "Output ONLY space-separated pinyin syllables, one syllable per Chinese character in order. " +
  "Do not output syllables for punctuation or whitespace. No explanations or markdown.";

/** Strip non-pinyin tokens; keep tone-marked syllables. */
export function normalizePoePinyinLine(raw: string): string {
  return raw
    .trim()
    .replace(/[^\s.a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ0-9]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function countCjkInLine(line: string): number {
  return [...line].filter((ch) => isCjkCharacter(ch)).length;
}

export function parsePoePinyinResponse(raw: string, expectedCjkCount: number): string | null {
  const normalized = normalizePoePinyinLine(raw);
  if (!normalized) return null;
  const syllables = normalized.split(/\s+/u).filter(Boolean);
  if (expectedCjkCount === 0) return "";
  if (syllables.length !== expectedCjkCount) return null;
  return syllables.join(" ");
}

export async function romanizeChineseLines(
  lines: string[],
  fetchImpl: typeof fetch = fetch,
  apiKey?: string
): Promise<PoePinyinLineResult> {
  const key = resolvePoeApiKey(apiKey);
  if (!key) return poeMissingKeyError("pinyin");

  const romanized: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      romanized.push("");
      continue;
    }
    const expected = countCjkInLine(line);

    let res: Response;
    try {
      res = await fetchImpl(POE_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: POE_MODEL_OCR_PINYIN,
          stream: false,
          messages: [
            { role: "system", content: PINYIN_SYSTEM },
            {
              role: "user",
              content: `請將以下句子轉成拼音（只輸出空格分隔的音節）：\n${line}`,
            },
          ],
          max_tokens: 800,
        }),
      });
    } catch {
      return { ok: false, error: "無法生成練習，請稍後再試。" };
    }

    if (!res.ok) {
      return { ok: false, error: "無法生成練習，請稍後再試。" };
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = String(payload.choices?.[0]?.message?.content ?? "");
    const parsed = parsePoePinyinResponse(raw, expected);
    if (parsed === null) {
      return { ok: false, error: "無法生成練習，請稍後再試。" };
    }
    romanized.push(parsed);
  }

  return { ok: true, lines: romanized };
}
