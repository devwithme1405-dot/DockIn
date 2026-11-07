/**
 * DockIn mark: a dot docking into an open tray, on an ink tile.
 *
 * Ink over paper reads premium; the single cobalt dot is the one spot of brand
 * colour, "docking in". `tone` lets the loader draw the mark on its own dark
 * ground without the tile.
 */
export function Logo({
  size = 36,
  tile = true,
  className,
}: {
  size?: number;
  tile?: boolean;
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
      {tile && <rect width="64" height="64" rx="16" fill="#17181d" />}
      {/* The tray: a white, open-topped container. */}
      <path
        d="M16 28 V39 a9 9 0 0 0 9 9 h14 a9 9 0 0 0 9 -9 V28"
        fill="none"
        stroke="#f6f6f2"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      {/* The dot, settling into it. */}
      <circle cx="32" cy="20.5" r="6" fill="#2d3bda" />
    </svg>
  );
}
