import { describe, expect, it } from "vitest";
import {
  GUOYU_TTS_ERR_BROWSER_UNSUPPORTED,
  GUOYU_TTS_ERR_PLAY_RETRY,
  guoyuTtsApiErrorMessage,
  guoyuTtsPlaybackErrorMessage,
  isDecodePlaybackError,
  isNotAllowedPlaybackError,
} from "@/lib/guoyu/tts-playback";

describe("guoyu tts-playback errors", () => {
  it("maps NotAllowedError to retry copy", () => {
    const err = new DOMException("play failed", "NotAllowedError");
    expect(isNotAllowedPlaybackError(err)).toBe(true);
    expect(guoyuTtsPlaybackErrorMessage(err)).toBe(GUOYU_TTS_ERR_PLAY_RETRY);
  });

  it("maps decode errors to retry copy", () => {
    const err = new DOMException("decode failed", "NotSupportedError");
    expect(isDecodePlaybackError(err)).toBe(true);
    expect(guoyuTtsPlaybackErrorMessage(err)).toBe(GUOYU_TTS_ERR_PLAY_RETRY);
  });

  it("defaults unknown errors to retry copy", () => {
    expect(guoyuTtsPlaybackErrorMessage({})).toBe(GUOYU_TTS_ERR_PLAY_RETRY);
  });

  it("maps API failures without mislabeling browser unsupported", () => {
    expect(guoyuTtsApiErrorMessage(500)).toBe(GUOYU_TTS_ERR_PLAY_RETRY);
    expect(guoyuTtsApiErrorMessage(429)).toBe("本月朗讀額度已用完");
    expect(guoyuTtsApiErrorMessage(502, "朗讀服務暫時不可用")).toBe("朗讀服務暫時不可用");
  });

  it("reserves browser unsupported string for explicit export", () => {
    expect(GUOYU_TTS_ERR_BROWSER_UNSUPPORTED).toBe("此瀏覽器暫不支援朗讀");
  });
});
