import { permanentRedirect } from "next/navigation";
import { CHENGFENSHI_GUIDE_PATH } from "@/lib/chengfenshi-visibility-guide-meta";

/** Legacy slug — 301 to canonical /guides/IA (Vercel also lists this path in vercel.json). */
export default function LegacyChengFenshiGuideRedirect() {
  permanentRedirect(CHENGFENSHI_GUIDE_PATH);
}