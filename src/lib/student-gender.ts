export type StudentGender = "M" | "F";

export function genderFromAvatarStyle(avatarStyle: string): StudentGender | null {
  const normalized = avatarStyle.trim().toLowerCase();
  if (normalized === "boy") return "M";
  if (normalized === "girl") return "F";
  return null;
}
