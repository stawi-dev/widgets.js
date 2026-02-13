/** Clean outlined SVG icons — Google Material style */

const defaults = {
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ size = 18, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={defaults.fill}
      stroke={defaults.stroke}
      strokeWidth={defaults.strokeWidth}
      strokeLinecap={defaults.strokeLinecap}
      strokeLinejoin={defaults.strokeLinejoin}
    >
      {children}
    </svg>
  );
}

export function EmailIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </Svg>
  );
}

export function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z" />
    </Svg>
  );
}

export function PersonIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0112 0v1" />
    </Svg>
  );
}

export function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M16.47 3.53a2.1 2.1 0 013 3L8.36 17.64l-4.36 1 1-4.36L16.47 3.53z" />
    </Svg>
  );
}

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

export function SignOutIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

export function ExternalLinkIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Svg>
  );
}

export function LanguageIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </Svg>
  );
}

export function MapPinIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </Svg>
  );
}
