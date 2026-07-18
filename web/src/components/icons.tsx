/** Inline SVG icons — no emoji, no icon-font dependency. Crisp at any size. */

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lm-grad" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0553D" />
          <stop offset="0.55" stopColor="#D65C93" />
          <stop offset="1" stopColor="#8A6FE8" />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="10" fill="url(#lm-grad)" />
      {/* speech bubble */}
      <path
        d="M9 12.5A3.5 3.5 0 0 1 12.5 9h9A3.5 3.5 0 0 1 25 12.5v5A3.5 3.5 0 0 1 21.5 21H15l-3.6 3.1c-.7.6-1.9.1-1.9-.8V21A3.5 3.5 0 0 1 9 17.5v-5Z"
        fill="#fff"
      />
      {/* heart */}
      <path
        d="M17 18.2c-.2 0-.4-.07-.55-.2-1.7-1.45-2.95-2.55-2.95-3.95 0-.92.7-1.6 1.6-1.6.62 0 1.2.33 1.5.86.3-.53.88-.86 1.5-.86.9 0 1.6.68 1.6 1.6 0 1.4-1.25 2.5-2.95 3.95a.86.86 0 0 1-.55.2Z"
        fill="#F0553D"
      />
    </svg>
  );
}

export function AssistantAvatar({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="av-grad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0553D" />
          <stop offset="0.55" stopColor="#D65C93" />
          <stop offset="1" stopColor="#8A6FE8" />
        </linearGradient>
      </defs>
      <circle cx="15" cy="15" r="15" fill="url(#av-grad)" />
      <path
        d="M15 9.2c-.18 0-.35.06-.49.18-1.52 1.29-2.63 2.27-2.63 3.52 0 .82.62 1.43 1.43 1.43.55 0 1.07-.3 1.34-.77.27.47.79.77 1.34.77.81 0 1.43-.61 1.43-1.43 0-1.25-1.11-2.23-2.63-3.52A.77.77 0 0 0 15 9.2Z"
        fill="#fff"
      />
      <path
        d="M10.5 20.2c.6-1.9 2.4-3.2 4.5-3.2s3.9 1.3 4.5 3.2"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function SendArrow({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4.5 10h11M10.5 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoDot({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6.2v3.2M7 4.4v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
