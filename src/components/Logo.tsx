/** DockIn mark: a dock tray with a dot settling into it. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="DockIn"
    >
      <rect width="64" height="64" rx="15" fill="#1f5fd6" />
      <circle cx="32" cy="17.5" r="6.2" fill="#fff" />
      <rect x="12" y="29" width="40" height="22" rx="8" fill="#fff" />
      <rect x="17.5" y="22.5" width="29" height="23" rx="5.5" fill="#1f5fd6" />
    </svg>
  );
}
