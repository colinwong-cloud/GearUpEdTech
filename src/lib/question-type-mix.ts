import type { ParentWeight, Question } from "./types";
import { buildStrictAiQuestionPoolErrorMessage } from "./question-source";

export function normalizeQuestionTypeKey(type: string | null | undefined): string {
  return (type || "").trim().toLowerCase();
}

export function distinctQuestionTypesFromPool(questions: Question[]): string[] {
  const seen = new Map<string, string>();
  for (const q of questions) {
    const label = (q.question_type || "").trim();
    if (!label) continue;
    const key = normalizeQuestionTypeKey(label);
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

export function filterQuestionsByEnabledTypes(
  questions: Question[],
  enabledTypes: ReadonlySet<string> | readonly string[]
): Question[] {
  const enabled = enabledTypes instanceof Set ? enabledTypes : new Set(enabledTypes);
  if (enabled.size === 0) return [];
  const enabledKeys = new Set(
    [...enabled].map((t) => normalizeQuestionTypeKey(t))
  );
  return questions.filter((q) =>
    enabledKeys.has(normalizeQuestionTypeKey(q.question_type))
  );
}

export function composeWeightsWithEnabledTypes(
  weights: ParentWeight[],
  enabledTypes: ReadonlySet<string> | readonly string[]
): ParentWeight[] {
  const enabled = enabledTypes instanceof Set ? enabledTypes : new Set(enabledTypes);
  if (enabled.size === 0) return [];
  const enabledKeys = new Set(
    [...enabled].map((t) => normalizeQuestionTypeKey(t))
  );
  return weights.filter(
    (w) =>
      w.weight_percentage > 0 &&
      enabledKeys.has(normalizeQuestionTypeKey(w.question_type))
  );
}

export function allTypesEnabledInMix(
  poolTypes: readonly string[],
  enabledTypes: ReadonlySet<string> | readonly string[]
): boolean {
  if (poolTypes.length === 0) return true;
  const enabled = enabledTypes instanceof Set ? enabledTypes : new Set(enabledTypes);
  if (enabled.size < poolTypes.length) return false;
  const enabledKeys = new Set(
    [...enabled].map((t) => normalizeQuestionTypeKey(t))
  );
  return poolTypes.every((t) => enabledKeys.has(normalizeQuestionTypeKey(t)));
}

export function isAtLeastOneQuestionTypeEnabled(
  enabledTypes: ReadonlySet<string> | readonly string[]
): boolean {
  const enabled = enabledTypes instanceof Set ? enabledTypes : new Set(enabledTypes);
  return enabled.size > 0;
}

export function buildQuestionTypeMixAllOffMessage(): string {
  return "請至少選擇一種題型";
}

export function buildSoftPoolShortfallMessage(availableCount: number): string {
  return `所選題型只有 ${availableCount} 題，將全部作答`;
}

export type QuizDrawPlan = {
  effectiveCount: number;
  softWarnMessage: string | null;
  strictErrorMessage: string | null;
};

export function planQuizQuestionDraw({
  subjectKey,
  gradeLevel,
  requestedCount,
  totalPoolSize,
  filteredPoolSize,
  allTypesEnabled,
}: {
  subjectKey: string;
  gradeLevel: string;
  requestedCount: number;
  totalPoolSize: number;
  filteredPoolSize: number;
  allTypesEnabled: boolean;
}): QuizDrawPlan {
  if (!allTypesEnabled) {
    if (filteredPoolSize <= 0) {
      return {
        effectiveCount: 0,
        softWarnMessage: null,
        strictErrorMessage: buildQuestionTypeMixAllOffMessage(),
      };
    }
    if (filteredPoolSize < requestedCount) {
      return {
        effectiveCount: filteredPoolSize,
        softWarnMessage: buildSoftPoolShortfallMessage(filteredPoolSize),
        strictErrorMessage: null,
      };
    }
    return {
      effectiveCount: requestedCount,
      softWarnMessage: null,
      strictErrorMessage: null,
    };
  }

  if (totalPoolSize < requestedCount) {
    return {
      effectiveCount: requestedCount,
      softWarnMessage: null,
      strictErrorMessage: buildStrictAiQuestionPoolErrorMessage({
        subjectKey,
        gradeLevel,
        requestedCount,
        availableCount: totalPoolSize,
      }),
    };
  }

  return {
    effectiveCount: requestedCount,
    softWarnMessage: null,
    strictErrorMessage: null,
  };
}
