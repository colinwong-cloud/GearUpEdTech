export type TutorStudentPreview = {
  name: string;
  mobile: string;
};

type PaperOverviewCache = {
  savedAt: number;
  monthKey: string;
  used: number;
  limit: number;
  remaining: number | null;
  unlimited: boolean;
  papers: unknown[];
};

const PREVIEW_KEY = "tutor-student-preview-v1";
const PAPER_TTL_MS = 60_000;
let paperCache: PaperOverviewCache | null = null;
let schoolCache: unknown[] | null = null;
let schoolRequest: Promise<unknown[]> | null = null;

export function rememberTutorStudent(hash: string, preview: TutorStudentPreview) {
  if (typeof window === "undefined" || !hash) return;
  const all = readPreviewMap();
  all[hash] = { name: preview.name.trim(), mobile: preview.mobile.trim() };
  sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(all));
}

export function readTutorStudentPreview(hash: string): TutorStudentPreview | null {
  if (typeof window === "undefined" || !hash) return null;
  const preview = readPreviewMap()[hash];
  if (!preview?.name && !preview?.mobile) return null;
  return preview;
}

export function readPaperOverviewCache(): PaperOverviewCache | null {
  if (!paperCache) return null;
  if (Date.now() - paperCache.savedAt > PAPER_TTL_MS) return null;
  return paperCache;
}

export function writePaperOverviewCache(data: Omit<PaperOverviewCache, "savedAt">) {
  paperCache = { ...data, savedAt: Date.now() };
}

export function clearPaperOverviewCache() {
  paperCache = null;
}

export function readComparisonSchoolCache<T>(): T[] | null {
  return schoolCache as T[] | null;
}

export function writeComparisonSchoolCache(schools: unknown[]) {
  schoolCache = schools;
}

export function rememberComparisonSchoolRequest(request: Promise<unknown[]>) {
  schoolRequest = request;
}

export function readComparisonSchoolRequest(): Promise<unknown[]> | null {
  return schoolRequest;
}

function readPreviewMap(): Record<string, TutorStudentPreview> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || "{}") as Record<string, TutorStudentPreview>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
