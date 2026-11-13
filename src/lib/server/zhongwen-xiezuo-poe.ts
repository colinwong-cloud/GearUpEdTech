import {
  gradeLevelWritingHint,
  parseParentPhraseInput,
  parseZhongwenXiezuoGeneratedContent,
  type ZhongwenXiezuoGeneratedContent,
} from "@/lib/zhongwen-xiezuo/content";
import {
  ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL,
  ZHONGWEN_XIEZUO_RHETORIC_DEVICES,
} from "@/lib/zhongwen-xiezuo/rhetoric";
import {
  POE_CHAT_COMPLETIONS_URL,
  POE_MODEL_OCR_PINYIN,
  resolvePoeApiKey,
} from "@/lib/server/guoyu-poe-common";

export type ZhongwenXiezuoPoeResult =
  | { ok: true; content: ZhongwenXiezuoGeneratedContent }
  | { ok: false; error: string; missingKey?: boolean };

const XIEZUO_SYSTEM = `你是香港小學中文寫作練習出題助手。只輸出單一 JSON 物件，不要 markdown 或解釋。
必須使用繁體中文。
範文須約 180–220 字，並在故事中自然融入家長提供的詞語。
範文須運用修辭手法，並在 rhetoric_marks 標註；device 只能取自以下清單（措辭辭須一致，誇張須用「誇張」二字，勿用簡化「夸張」）：
${ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL}

JSON schema:
{
  "version": 1,
  "source_phrases": string[],
  "page1_cloze": [{ "number": number, "sentence_with_blank": string, "answer": string }],
  "page2_cloze": [{ "number": number, "sentence_with_blank": string, "answer": string }],
  "essay": string,
  "rhetoric_marks": [{ "device": string, "excerpt": string }]
}

規則：
- page1_cloze：6–8 題，句中用「＿＿＿」留白，答案須來自家長詞語（詞語庫參考）。
- page2_cloze：6–8 題，不同於 page1，同樣用「＿＿＿」留白，不提示詞語庫。
- page1 與 page2 題目不可重複。
- source_phrases 須與家長輸入一致。`;

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function generateZhongwenXiezuoContent(input: {
  parentText: string;
  gradeLevel: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<ZhongwenXiezuoPoeResult> {
  const key = resolvePoeApiKey(input.apiKey);
  if (!key) {
    return {
      ok: false,
      error: "寫作服務未設定（缺少 POE_API_KEY），請稍後再試。",
      missingKey: true,
    };
  }

  const phrases = parseParentPhraseInput(input.parentText);
  if (phrases.length < 2) {
    return { ok: false, error: "請輸入至少兩個詞語或短語。" };
  }

  const gradeHint = gradeLevelWritingHint(input.gradeLevel);
  const userContent = `學生年級：${input.gradeLevel || "未設定"}
${gradeHint}

家長自訂詞語／句式（請用於 page1 詞語庫與範文）：
${phrases.map((p, i) => `${i + 1}. ${p}`).join("\n")}

請按 system 指示輸出 JSON。修辭 device 範例（含誇張）：${ZHONGWEN_XIEZUO_RHETORIC_DEVICES.slice(0, 4).join("、")} 等。`;

  const fetchImpl = input.fetchImpl ?? fetch;
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
          { role: "system", content: XIEZUO_SYSTEM },
          { role: "user", content: userContent },
        ],
        max_tokens: 4096,
      }),
    });
  } catch {
    return { ok: false, error: "無法連線寫作服務，請稍後再試。" };
  }

  if (!res.ok) {
    return { ok: false, error: "寫作服務暫時無法使用，請稍後再試。" };
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = String(payload.choices?.[0]?.message?.content ?? "");
  const parsed = extractJsonObject(raw);
  const content = parseZhongwenXiezuoGeneratedContent(parsed);
  if (!content) {
    return { ok: false, error: "產生內容格式不正確，請稍後再試。" };
  }

  if (content.rhetoric_marks.some((m) => m.device === "夸張")) {
    content.rhetoric_marks = content.rhetoric_marks.map((m) =>
      m.device === "夸張" ? { ...m, device: "誇張" } : m
    );
  }

  return {
    ok: true,
    content: {
      ...content,
      source_phrases: phrases,
    },
  };
}
