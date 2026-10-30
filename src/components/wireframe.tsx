import type { Guide } from "@/lib/studio/catalog";

export function Wireframe({ guide }: { guide: Guide }) {
  return (
    <svg viewBox="0 0 160 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <rect x="1" y="1" width="158" height="98" fill="none" stroke="currentColor" strokeDasharray="3 3" opacity="0.7" />
      {guide === "front34" && (
        <path d="M28 68 L40 42 L78 36 L112 40 L132 58 L128 72 L28 72 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
      {guide === "front" && <path d="M40 70 L48 40 L112 40 L120 70 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {guide === "rear" && <path d="M36 70 L44 42 L116 42 L124 70 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {guide === "side" && <path d="M18 66 L22 48 L50 40 L120 40 L140 52 L140 68 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {guide === "wheel" && <circle cx="80" cy="52" r="26" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {(guide === "dash" || guide === "odo") && (
        <path d="M24 62 L40 34 L120 34 L136 62" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
      {(guide === "seats" || guide === "door" || guide === "cargo") && (
        <rect x="36" y="28" width="88" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
      {guide === "vin" && <rect x="46" y="34" width="68" height="32" fill="none" stroke="currentColor" strokeWidth="1.4" />}
    </svg>
  );
}
