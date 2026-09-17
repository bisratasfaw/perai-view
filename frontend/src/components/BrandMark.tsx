import { MAP_COLORS } from '@shared/programs'

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="brand-globe" cx="38%" cy="32%" r="72%">
          <stop offset="0" stopColor="#2276b3" />
          <stop offset="1" stopColor="#061423" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#brand-globe)" />
      <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#5cc8ff" strokeOpacity=".5" strokeWidth="2" />
      <path d="M32 6v52" stroke="#5cc8ff" strokeOpacity=".3" strokeWidth="2" />
      <circle cx="22" cy="26" r="3.6" fill={MAP_COLORS.chatgpt} />
      <circle cx="41" cy="22" r="3.2" fill={MAP_COLORS.gemini} />
      <circle cx="38" cy="40" r="3.6" fill={MAP_COLORS.claude} />
      <circle cx="32" cy="32" r="26" fill="none" stroke="#9adfff" strokeOpacity=".6" strokeWidth="2" />
    </svg>
  )
}
