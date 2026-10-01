import { useId } from "react";
import type { SkyState } from "@/lib/sky";

const STARS: [number, number, number][] = [
  [30, 22, 1.2], [66, 48, 0.9], [102, 16, 1.4], [138, 60, 1], [176, 28, 1.1], [214, 14, 0.9],
  [252, 52, 1.3], [290, 24, 1], [330, 40, 1.2], [368, 18, 0.9], [48, 86, 0.8], [124, 98, 1],
  [196, 78, 0.9], [270, 92, 1.1], [352, 84, 0.9], [20, 52, 0.9], [236, 36, 0.8], [310, 66, 0.9],
];

/** Pure SVG sky that fills its parent. Sun, moon, stars and clouds follow `sky`. */
export function SkyScene({ sky }: { sky: SkyState }) {
  const uid = useId().replace(/:/g, "");
  const W = 400;
  const H = 260;
  const sx = (sky.sun.x / 100) * W;
  const sy = (sky.sun.y / 100) * H;
  const mx = (sky.moon.x / 100) * W;
  const my = (sky.moon.y / 100) * H;
  const cloudShift = (sky.sun.x - 50) * -0.12;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
        <radialGradient id={`sun-${uid}`}>
          <stop offset="0" stopColor={sky.sun.color} stopOpacity={0.9 * sky.sun.glow} />
          <stop offset="0.35" stopColor={sky.sun.color} stopOpacity={0.4 * sky.sun.glow} />
          <stop offset="1" stopColor={sky.sun.color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`moon-${uid}`}>
          <stop offset="0" stopColor="#dfe8ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#dfe8ff" stopOpacity="0" />
        </radialGradient>
        <mask id={`crescent-${uid}`}>
          <rect width={W} height={H} fill="#fff" />
          <circle cx={mx + 7} cy={my - 4} r="15" fill="#000" />
        </mask>
      </defs>

      <rect width={W} height={H} fill={`url(#sky-${uid})`} />

      {sky.starOpacity > 0.02 && (
        <g fill="#fff" opacity={sky.starOpacity}>
          {STARS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} opacity={0.5 + ((i * 37) % 50) / 100} />
          ))}
        </g>
      )}

      {sky.sun.visible && (
        <g>
          <circle cx={sx} cy={sy} r={sky.sun.r * 5.2} fill={`url(#sun-${uid})`} />
          <circle cx={sx} cy={sy} r={sky.sun.r} fill={sky.sun.color} />
        </g>
      )}

      {sky.moon.opacity > 0.02 && (
        <g opacity={sky.moon.opacity}>
          <circle cx={mx} cy={my} r="46" fill={`url(#moon-${uid})`} />
          <circle cx={mx} cy={my} r="16" fill="#f4f1de" mask={`url(#crescent-${uid})`} />
        </g>
      )}

      <g fill={sky.cloud} opacity={sky.cloudOpacity} transform={`translate(${cloudShift} 0)`}>
        <g transform="translate(300 90) scale(0.8)">
          <ellipse cx="0" cy="10" rx="30" ry="9" />
          <ellipse cx="-12" cy="3" rx="14" ry="10" />
          <ellipse cx="9" cy="0" rx="17" ry="12" />
        </g>
        <g transform="translate(352 112) scale(0.7)">
          <ellipse cx="0" cy="10" rx="30" ry="9" />
          <ellipse cx="-12" cy="3" rx="14" ry="10" />
          <ellipse cx="9" cy="0" rx="17" ry="12" />
        </g>
        <g transform="translate(196 122) scale(0.55)" opacity="0.8">
          <ellipse cx="0" cy="10" rx="30" ry="9" />
          <ellipse cx="-12" cy="3" rx="14" ry="10" />
          <ellipse cx="9" cy="0" rx="17" ry="12" />
        </g>
      </g>

      <path
        d={`M0 ${H * 0.78} C 60 ${H * 0.7}, 120 ${H * 0.76}, 190 ${H * 0.73} S 330 ${H * 0.68}, ${W} ${H * 0.74} V ${H} H0 Z`}
        fill={sky.hill}
      />
      <path
        d={`M0 ${H * 0.86} C 90 ${H * 0.8}, 160 ${H * 0.88}, 250 ${H * 0.84} S 350 ${H * 0.82}, ${W} ${H * 0.86} V ${H} H0 Z`}
        fill={sky.hill}
        opacity="0.75"
      />
    </svg>
  );
}
