import { describe, expect, it, vi } from "vitest";
import {
  extractAudioFromPoeCompletion,
  speakingRateToPoePaceTag,
  synthesizeMandarinTts,
} from "@/lib/server/guoyu-poe-tts";

describe("guoyu-poe-tts", () => {
  it("maps speaking rate to pace tags", () => {
    expect(speakingRateToPoePaceTag(0.75)).toContain("[slow]");
    expect(speakingRateToPoePaceTag(1.0)).toBe("");
    expect(speakingRateToPoePaceTag(1.75)).toContain("[fast]");
  });

  it("extracts base64 from data URL in message content", async () => {
    const audio = await extractAudioFromPoeCompletion(
      {
        choices: [
          {
            message: {
              content: "Here: data:audio/mpeg;base64,QUJD",
            },
          },
        ],
      },
      fetch
    );
    expect(audio?.contentType).toBe("audio/mpeg");
    expect(audio?.base64).toBe("QUJD");
  });

  it("downloads audio when Poe returns an https URL", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as unknown as typeof fetch;

    const audio = await extractAudioFromPoeCompletion(
      {
        choices: [{ message: { content: "Audio: https://cdn.example.com/out.mp3" } }],
      },
      fetchImpl
    );
    expect(audio?.base64).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("returns missingKey when POE_API_KEY is absent", async () => {
    const prev = process.env.POE_API_KEY;
    delete process.env.POE_API_KEY;
    const result = await synthesizeMandarinTts({ text: "你好", speakingRate: 1 });
    if (prev) process.env.POE_API_KEY = prev;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingKey).toBe(true);
      expect(result.error).toContain("POE_API_KEY");
    }
  });

  it("requests Gemini TTS model with stream false", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "data:audio/mpeg;base64,QQ==" } }],
      }),
    })) as unknown as typeof fetch;

    const result = await synthesizeMandarinTts(
      { text: "你好", speakingRate: 1.5, fetchImpl, apiKey: "k" }
    );
    expect(result.ok).toBe(true);
    const call = fetchImpl.mock.calls[0];
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.model).toBe("Gemini-3.1-Flash-TTS");
    expect(body.stream).toBe(false);
  });
});
