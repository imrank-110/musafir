/**
 * Crescent moon + star icon component.
 * Used as the app logo throughout the UI.
 */
export default function CrescentMoon({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background circle */}
      <circle cx="20" cy="20" r="20" fill="url(#moon-grad)" />
      
      {/* Crescent cutout */}
      <circle cx="26" cy="14" r="14" fill="#f5f0eb" opacity="0.85" />
      
      {/* Star */}
      <path
        d="M20 8 L21.5 13 L27 13 L22.5 16 L24 21 L20 18 L16 21 L17.5 16 L13 13 L18.5 13 Z"
        fill="#f5f0eb"
        opacity="0.95"
      />
      
      {/* Subtle glow */}
      <circle cx="20" cy="20" r="18" stroke="white" strokeWidth="0.5" opacity="0.15" />
      
      <defs>
        <linearGradient id="moon-grad" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#c4a882" />
          <stop offset="100%" stopColor="#a08060" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Small inline crescent moon for use in text or as a decorative element.
 */
export function MiniCrescent({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="10" cy="10" r="10" fill="url(#mini-moon)" />
      <circle cx="13" cy="7" r="7" fill="#f5f0eb" opacity="0.85" />
      <path
        d="M10 4 L10.75 7 L13.5 7 L11.25 9 L12 12 L10 10.5 L8 12 L8.75 9 L6.5 7 L9.25 7 Z"
        fill="#f5f0eb"
        opacity="0.95"
      />
      <defs>
        <linearGradient id="mini-moon" x1="0" y1="0" x2="20" y2="20">
          <stop offset="0%" stopColor="#c4a882" />
          <stop offset="100%" stopColor="#a08060" />
        </linearGradient>
      </defs>
    </svg>
  );
}