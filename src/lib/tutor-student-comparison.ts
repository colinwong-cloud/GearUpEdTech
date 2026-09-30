export const TUTOR_COMPARISON_MONTHLY_PRICE_HKD = 199;

export type ComparisonMember = {
  studentId: string;
  schoolId: string | null;
  district: string | null;
  accuracy: number | null;
};

export type ComparisonCohort = {
  average: number | null;
  count: number;
  rank: number | null;
};

export type PeerComparison = {
  studentAccuracy: number | null;
  school: ComparisonCohort | null;
  district: ComparisonCohort | null;
  grade: ComparisonCohort;
};

export function tutorComparisonUnlocked(paidUntil: string | null | undefined, now = new Date()): boolean {
  if (!paidUntil) return false;
  const time = Date.parse(paidUntil);
  return Number.isFinite(time) && time > now.getTime();
}

function roundAccuracy(value: number): number {
  return Math.round(value * 10) / 10;
}

function cohortFor(members: ComparisonMember[], studentId: string): ComparisonCohort {
  const scored = members.filter((member) => member.accuracy !== null && Number.isFinite(member.accuracy));
  const student = scored.find((member) => member.studentId === studentId);
  const average =
    scored.length > 0
      ? roundAccuracy(scored.reduce((sum, member) => sum + (member.accuracy as number), 0) / scored.length)
      : null;
  if (!student || student.accuracy === null) {
    return { average, count: scored.length, rank: null };
  }
  const ahead = scored.filter((member) => (member.accuracy as number) > student.accuracy!).length;
  return { average, count: scored.length, rank: ahead + 1 };
}

/** Compare one student with same-school, same-district, and same-grade peers. */
export function buildPeerComparison(input: {
  studentId: string;
  schoolId: string | null;
  district: string | null;
  members: ComparisonMember[];
}): PeerComparison {
  const student = input.members.find((member) => member.studentId === input.studentId);
  const schoolId = input.schoolId || null;
  const district = input.district?.trim() || null;
  return {
    studentAccuracy: student?.accuracy ?? null,
    school: schoolId
      ? cohortFor(
          input.members.filter((member) => member.schoolId === schoolId),
          input.studentId
        )
      : null,
    district: district
      ? cohortFor(
          input.members.filter((member) => (member.district?.trim() || null) === district),
          input.studentId
        )
      : null,
    grade: cohortFor(input.members, input.studentId),
  };
}
