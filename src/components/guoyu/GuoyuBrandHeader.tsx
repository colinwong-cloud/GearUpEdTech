/** Top-left GearUp EduTech mark — matches main quiz partner logo asset. */
export function GuoyuBrandHeader({ logoAlt = "GearUp EduTech" }: { logoAlt?: string }) {
  return (
    <div className="mb-4 flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/main/gearup-quiz-logo.webp"
        alt={logoAlt}
        className="h-9 w-auto max-w-[60%] object-contain object-left"
        draggable={false}
      />
    </div>
  );
}
