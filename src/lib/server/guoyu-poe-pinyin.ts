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

export function syllablesFromPoePinyinRaw(raw: string): string[] {
  const normalized = normalizePoePinyinLine(raw);
  if (!normalized) return [];
  return normalized.split(/\s+/u).filter(Boolean);
}

export function parsePoePinyinResponse(raw: string, expectedCjkCount: number): string | null {
  const syllables = syllablesFromPoePinyinRaw(raw);
  if (expectedCjkCount === 0) return "";
  if (syllables.length === 0) return null;
  if (syllables.length !== expectedCjkCount) return null;
  return syllables.join(" ");
}

/** Accept Poe output even when syllable count drifts; worksheet alignment fills gaps. */
export function bestEffortPoePinyinLine(raw: string): string | null {
  const syllables = syllablesFromPoePinyinRaw(raw);
  if (syllables.length === 0) return null;
  return syllables.join(" ");
}

export function maxTokensForPinyinLine(expectedCjkCount: number): number {
  if (expectedCjkCount <= 0) return 256;
  return Math.min(4096, Math.max(800, expectedCjkCount * 14));
}

type PoeFetchResult =
  | { ok: true; raw: string }
  | { ok: false; httpError: boolean };

async function fetchPoePinyinForLine(
  line: string,
  expectedCjkCount: number,
  fetchImpl: typeof fetch,
  key: string,
  options?: { correctiveRetry?: boolean }
): Promise<PoeFetchResult> {
  const userContent = options?.correctiveRetry
    ? `上一輪輸出的拼音音節數量不正確。此句共有 ${expectedCjkCount} 個中文字，請輸出恰好 ${expectedCjkCount} 個以空格分隔的拼音音節（不含標點）：\n${line}`
    : `請將以下句子轉成拼音（只輸出空格分隔的音節）：\n${line}`;

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
          { role: "user", content: userContent },
        ],
        max_tokens: maxTokensForPinyinLine(expectedCjkCount),
      }),
    });
  } catch {
    return { ok: false, httpError: false };
  }

  if (!res.ok) {
    return { ok: false, httpError: true };
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = String(payload.choices?.[0]?.message?.content ?? "");
  return { ok: true, raw };
}

export async function romanizePinyinLineWithPoe(
  line: string,
  fetchImpl: typeof fetch,
  key: string
): Promise<
  | { ok: true; romanized: string }
  | { ok: false; error: string; missingKey?: boolean; httpError?: boolean }
> {
  const expected = countCjkInLine(line);
  if (!line.trim()) {
    return { ok: true, romanized: "" };
  }
  if (expected === 0) {
    return { ok: true, romanized: "" };
  }

  const first = await fetchPoePinyinForLine(line, expected, fetchImpl, key);
  if (!first.ok) {
    return {
      ok: false,
      error: first.httpError ? "無法生成練習，請稍後再試。" : "無法生成練習，請稍後再試。",
      httpError: first.httpError,
    };
  }

  let parsed = parsePoePinyinResponse(first.raw, expected);
  if (parsed !== null) {
    return { ok: true, romanized: parsed };
  }

  const retry = await fetchPoePinyinForLine(line, expected, fetchImpl, key, {
    correctiveRetry: true,
  });
  if (!retry.ok) {
    return {
      ok: false,
      error: "無法生成練習，請稍後再試。",
      httpError: retry.httpError,
    };
  }

  parsed = parsePoePinyinResponse(retry.raw, expected);
  if (parsed !== null) {
    return { ok: true, romanized: parsed };
  }

  const bestEffort = bestEffortPoePinyinLine(retry.raw) ?? bestEffortPoePinyinLine(first.raw);
  if (bestEffort !== null) {
    return { ok: true, romanized: bestEffort };
  }

  return { ok: false, error: "無法生成練習，請稍後再試。" };
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
    const lineResult = await romanizePinyinLineWithPoe(line, fetchImpl, key);
    if (!lineResult.ok) {
      return {
        ok: false,
        error: lineResult.error,
        missingKey: lineResult.missingKey,
      };
    }
    romanized.push(lineResult.romanized);
  }

  return { ok: true, lines: romanized };
}
