/**
 * DockIn mark: a graduation cap on a violet tile.
 *
 * `tile` draws the rounded violet square behind it (the app-icon form); without
 * it the cap is drawn in `color` alone, for dark grounds like the loader.
 */
export function Logo({
  size = 36,
  tile = true,
  color = "#ffffff",
  className,
}: {
  size?: number;
  tile?: boolean;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="DockIn"
    >
      {tile && (
        <defs>
          <linearGradient id="dockin-tile" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#12835f" />
            <stop offset="1" stopColor="#0d6a4d" />
          </linearGradient>
        </defs>
      )}
      {tile && <rect width="64" height="64" rx="16" fill="url(#dockin-tile)" />}
      {/* Mortarboard: the board, the tassel, and the cap base. */}
      <path d="M32 18 L50 26 L32 34 L14 26 Z" fill={color} />
      <path d="M20 29.5 V38 c0 3.4 5.4 6 12 6 s12 -2.6 12 -6 V29.5 L32 34.8 Z" fill={color} />
      <path d="M50 26 V37" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="50" cy="39.4" r="2.6" fill={color} />
    </svg>
  );
}
