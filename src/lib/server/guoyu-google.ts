import { getGoogleCloudAccessToken, getGoogleCloudProjectId } from "@/lib/server/google-cloud-auth";

export async function romanizeChineseLines(
  lines: string[],
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; lines: string[] } | { ok: false; error: string }> {
  const projectId = getGoogleCloudProjectId();
  const token = await getGoogleCloudAccessToken();
  if (!projectId || !token) {
    return { ok: false, error: "拼音服務未設定，請稍後再試。" };
  }

  const romanized: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      romanized.push("");
      continue;
    }
    const url = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}:romanizeText`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: { content: line },
        languageCode: "zh-CN",
      }),
    });
    if (!res.ok) {
      return { ok: false, error: "無法生成練習，請稍後再試。" };
    }
    const data = (await res.json()) as { romanizedText?: string };
    romanized.push(String(data.romanizedText ?? "").trim());
  }
  return { ok: true, lines: romanized };
}

export async function synthesizeMandarinTts(params: {
  text: string;
  speakingRate: number;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; audioBase64: string; contentType: string } | { ok: false; error: string }> {
  const token = await getGoogleCloudAccessToken();
  if (!token) {
    return { ok: false, error: "朗讀服務未設定，請稍後再試。" };
  }
  const fetchFn = params.fetchImpl ?? fetch;
  const res = await fetchFn("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text: params.text.slice(0, 5000) },
      voice: { languageCode: "zh-CN", name: "zh-CN-Wavenet-C" },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: params.speakingRate,
      },
    }),
  });
  if (!res.ok) {
    return { ok: false, error: "無法朗讀，請稍後再試。" };
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    return { ok: false, error: "無法朗讀，請稍後再試。" };
  }
  return { ok: true, audioBase64: data.audioContent, contentType: "audio/mpeg" };
}
