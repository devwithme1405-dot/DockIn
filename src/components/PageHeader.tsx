"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cx } from "./ui";

/** True once the page has been scrolled a little, so the bar can show its divider. */
function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return scrolled;
}

/**
 * The strip pinned to the top of every screen. It never changes height while
 * scrolling (a header that resizes makes the page jump), it only gains a hairline.
 */
export function StickyBar({
  children,
  className,
}: {
  children: ReactNode | ((scrolled: boolean) => ReactNode);
  className?: string;
}) {
  const scrolled = useScrolled();
  return (
    <header
      className={cx(
        // At rest the bar is not there at all, so the page's colour runs behind
        // the title unbroken. Any translucency at the top leaves a seam where
        // the bar ends — the one thing that makes a screen look assembled from
        // parts. It becomes frosted only once something has scrolled under it.
        "sticky top-0 z-30 border-b transition-colors duration-200",
        scrolled
          ? "border-line bg-bg/75 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent",
        "pt-[max(0.625rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      {typeof children === "function" ? children(scrolled) : children}
    </header>
  );
}

/** Title (and optional subtitle and action) pinned to the top of a tab screen. */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    // The row wraps rather than truncating: on a narrow phone the controls drop
    // to a line of their own instead of cutting the subtitle off mid-word.
    <StickyBar className="px-5 pb-3">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-[8rem] flex-1">
          <h1 className="truncate text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle != null && <p className="text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
    </StickyBar>
  );
}

/**
 * Header for a screen you drill into: a pinned bar with the back link, the title
 * fading into the bar once the large title has scrolled away, then the large title.
 */
export function BackHeader({
  href,
  backLabel,
  title,
  right,
  hideLargeTitle,
}: {
  href: string;
  backLabel: string;
  title: string;
  right?: ReactNode;
  hideLargeTitle?: boolean;
}) {
  return (
    <>
      <StickyBar className="px-3 pb-1.5">
        {(scrolled) => (
          <div className="relative flex h-11 items-center justify-between">
            <Link href={href} className="inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1.5 text-accent">
              <ChevronLeft size={22} />
              {backLabel}
            </Link>
            <p
              aria-hidden={!scrolled}
              className={cx(
                "pointer-events-none absolute inset-x-24 truncate text-center text-[16px] font-semibold transition-opacity duration-150",
                scrolled ? "opacity-100" : "opacity-0",
              )}
            >
              {title}
            </p>
            <div className="flex items-center gap-1">{right}</div>
          </div>
        )}
      </StickyBar>
      {!hideLargeTitle && (
        <h1 className="px-5 pt-2 pb-3 text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
      )}
    </>
  );
}
