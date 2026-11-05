/** Minimal silent WAV for unlocking iOS audio in the same user gesture as tap. */
export const GUOYU_TTS_SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAA==";

export const GUOYU_TTS_ERR_BROWSER_UNSUPPORTED = "此瀏覽器暫不支援朗讀";
export const GUOYU_TTS_ERR_PLAY_RETRY = "未能播放朗讀，請再試一次";

export function isHtmlAudioAvailable(): boolean {
  return typeof Audio !== "undefined";
}

export function configureGuoyuTtsAudioElement(audio: HTMLAudioElement): void {
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "true");
  audio.preload = "auto";
}

/** Call synchronously at the start of the tap handler, before any await. */
export function unlockGuoyuTtsAudioInUserGesture(audio: HTMLAudioElement): void {
  configureGuoyuTtsAudioElement(audio);
  audio.src = GUOYU_TTS_SILENT_WAV_DATA_URL;
  audio.load();
  void audio.play().catch(() => {});
}

export function isNotAllowedPlaybackError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === "NotAllowedError";
}

export function isDecodePlaybackError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === "NotSupportedError" || err.name === "EncodingError";
}

export function guoyuTtsPlaybackErrorMessage(err: unknown): string {
  if (isNotAllowedPlaybackError(err) || isDecodePlaybackError(err)) {
    return GUOYU_TTS_ERR_PLAY_RETRY;
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return GUOYU_TTS_ERR_PLAY_RETRY;
}

export function guoyuTtsApiErrorMessage(status: number, serverError?: string): string {
  if (status === 429) return serverError?.trim() || "本月朗讀額度已用完";
  if (serverError?.trim()) return serverError.trim();
  return GUOYU_TTS_ERR_PLAY_RETRY;
}
