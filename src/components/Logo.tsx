import { Cap3D } from "./Paper";
import { cx } from "./ui";

/**
 * The DockIn mark as an app icon: the purple 3D cap on a cream paper tile.
 * (`tile` and `color` are accepted for older callers; the mark is always the
 * tiled one now.)
 */
export function Logo({
  size = 36,
  className,
}: {
  size?: number;
  tile?: boolean;
  color?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="DockIn"
      className={cx("grid shrink-0 place-items-center rounded-[28%] border border-[#d8b98d]", className)}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(120% 90% at 50% 20%, #fff8ea, #f0ddbb)",
        boxShadow: "0 2px 0 #c9a172",
      }}
    >
      <Cap3D size={Math.round(size * 0.86)} />
    </span>
  );
}
