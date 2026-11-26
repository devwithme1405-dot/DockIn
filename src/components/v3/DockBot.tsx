"use client";

import { useId } from "react";
import { cx } from "../ui";

export type BotMood = "idle" | "listening" | "thinking" | "talking" | "happy" | "wave";

/**
 * DockBot — DockIn's little leather robot. Drawn, not an image: stitched
 * leather head and body, a glossy face screen with glowing orange eyes, an
 * antenna bulb. It floats and turns gently in 3D, blinks, tilts its head to
 * listen (ears glow), scans while thinking, chatters while talking and hops
 * when something is done. Every loop stops in lite mode and for reduced motion.
 */
export function DockBot({ mood = "idle", size = 96, className }: { mood?: BotMood; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const g = (n: string) => `${n}-${id}`;
  const happy = mood === "happy" || mood === "wave";
  return (
    <div
      className={cx("dockbot", `bot-${mood}`, className)}
      style={{ width: size, height: size * (140 / 120) }}
      role="img"
      aria-label="DockBot"
    >
      <svg viewBox="0 0 120 140" width="100%" height="100%" className="overflow-visible">
        <defs>
          <linearGradient id={g("leather")} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#c47a42" />
            <stop offset="0.45" stopColor="#9a5129" />
            <stop offset="1" stopColor="#6a3317" />
          </linearGradient>
          <linearGradient id={g("leatherDark")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8f4a22" />
            <stop offset="1" stopColor="#57270e" />
          </linearGradient>
          <radialGradient id={g("shine")} cx="0.3" cy="0.22" r="0.7">
            <stop offset="0" stopColor="#fff2dc" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fff2dc" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fff2dc" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={g("screen")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b2112" />
            <stop offset="1" stopColor="#140904" />
          </linearGradient>
          <linearGradient id={g("glass")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={g("bulb")} cx="0.4" cy="0.35" r="0.65">
            <stop offset="0" stopColor="#fff1c9" />
            <stop offset="0.45" stopColor="#ffb547" />
            <stop offset="1" stopColor="#e2700f" />
          </radialGradient>
          <filter id={g("glow")} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ground shadow */}
        <ellipse className="bot-shadow" cx="60" cy="134" rx="30" ry="4.5" fill="#3a1d0c" opacity="0.22" />

        <g className="bot-all">
          {/* body */}
          <g className="bot-body">
            <rect x="35" y="86" width="50" height="38" rx="15" fill={`url(#${g("leather")})`} />
            <rect x="35" y="86" width="50" height="38" rx="15" fill={`url(#${g("shine")})`} />
            <rect x="39" y="90" width="42" height="30" rx="11.5" fill="none" stroke="#f6d6ae" strokeOpacity="0.7" strokeWidth="1.1" strokeDasharray="2.6 2.2" />
            <circle cx="60" cy="105" r="8.5" fill="#fbecd2" />
            <circle cx="60" cy="105" r="8.5" fill="none" stroke="#c2611c" strokeWidth="1.2" />
            <text x="60" y="109.4" textAnchor="middle" fontSize="12" fontWeight="800" fill="#8f4a22" fontFamily="system-ui, sans-serif">
              D
            </text>
            {/* arms */}
            <rect className="bot-arm-l" x="24" y="92" width="11" height="22" rx="5.5" fill={`url(#${g("leatherDark")})`} />
            <rect className="bot-arm-r" x="85" y="92" width="11" height="22" rx="5.5" fill={`url(#${g("leatherDark")})`} />
          </g>

          {/* neck */}
          <rect x="52" y="80" width="16" height="9" rx="3" fill="#57270e" />

          <g className="bot-head">
            {/* antenna */}
            <path d="M60 22 V9" stroke="#57270e" strokeWidth="3" strokeLinecap="round" />
            <circle className="bot-bulb" cx="60" cy="8" r="5.4" fill={`url(#${g("bulb")})`} filter={`url(#${g("glow")})`} />

            {/* ears */}
            <g className="bot-ears">
              <circle cx="13" cy="53" r="8" fill={`url(#${g("leatherDark")})`} />
              <circle cx="107" cy="53" r="8" fill={`url(#${g("leatherDark")})`} />
              <circle className="bot-ear-glow" cx="13" cy="53" r="4" fill="#ffb547" />
              <circle className="bot-ear-glow" cx="107" cy="53" r="4" fill="#ffb547" />
            </g>

            {/* head */}
            <rect x="16" y="22" width="88" height="62" rx="24" fill={`url(#${g("leather")})`} />
            <rect x="16" y="22" width="88" height="62" rx="24" fill={`url(#${g("shine")})`} />
            <rect x="20.5" y="26.5" width="79" height="53" rx="20" fill="none" stroke="#f6d6ae" strokeOpacity="0.75" strokeWidth="1.2" strokeDasharray="3 2.4" />

            {/* face screen */}
            <rect x="27" y="34" width="66" height="38" rx="15" fill={`url(#${g("screen")})`} />
            <rect x="29" y="35.5" width="62" height="16" rx="10" fill={`url(#${g("glass")})`} />

            {/* eyes */}
            <g className="bot-eyes" filter={`url(#${g("glow")})`}>
              {happy ? (
                <>
                  <path d="M41 56 q6 -8 12 0" stroke="#ffb547" strokeWidth="3.6" fill="none" strokeLinecap="round" />
                  <path d="M67 56 q6 -8 12 0" stroke="#ffb547" strokeWidth="3.6" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <rect className="bot-eye" x="42" y="45" width="10" height="13" rx="5" fill="#ffb547" />
                  <rect className="bot-eye" x="68" y="45" width="10" height="13" rx="5" fill="#ffb547" />
                </>
              )}
            </g>
            {/* mouth */}
            <rect className="bot-mouth" x="55" y="63" width="10" height="3" rx="1.5" fill="#ffb547" opacity="0.85" />
            {/* cheeks */}
            <ellipse cx="36" cy="63" rx="4" ry="2.2" fill="#f2871f" opacity="0.35" />
            <ellipse cx="84" cy="63" rx="4" ry="2.2" fill="#f2871f" opacity="0.35" />
          </g>
        </g>
      </svg>
    </div>
  );
}
