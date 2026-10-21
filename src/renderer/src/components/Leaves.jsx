import React, { useMemo } from 'react'
import { Leaf } from './Sprites'

// Amas de feuilles posés dans les coins, comme sur les maquettes.
const CORNERS = [
  { left: -6, top: 4, size: 34, rot: -20 }, { left: 18, top: -6, size: 22, rot: 35 },
  { left: -8, bottom: 30, size: 30, rot: 15 }, { left: 14, bottom: 4, size: 26, rot: -40 }, { left: 44, bottom: -6, size: 20, rot: 70 },
  { right: -4, bottom: 36, size: 28, rot: 25 }, { right: 20, bottom: 2, size: 32, rot: -15 }, { right: 52, bottom: -4, size: 20, rot: 50 },
  { right: -6, top: 120, size: 26, rot: -30 }
]

// Feuilles qui tombent en arrière-plan + amas dans les coins.
export default function Leaves({ count = 16, animated = true }) {
  const falling = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        size: 14 + Math.random() * 18,
        dur: 16 + Math.random() * 18,
        delay: -Math.random() * 34,
        drift: (Math.random() - 0.5) * 260,
        spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        o: 0.35 + Math.random() * 0.4,
        variant: i
      })),
    [count]
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {CORNERS.map((c, i) => (
        <div key={i} className="absolute opacity-80" style={{ left: c.left, right: c.right, top: c.top, bottom: c.bottom, width: c.size, height: c.size, transform: `rotate(${c.rot}deg)` }}>
          <Leaf variant={i} className="h-full w-full" />
        </div>
      ))}
      {animated &&
        falling.map((l, i) => (
          <div
            key={i}
            className="leaf absolute top-0"
            style={{ left: `${l.left}%`, width: l.size, height: l.size, '--dur': `${l.dur}s`, '--delay': `${l.delay}s`, '--drift': `${l.drift}px`, '--spin': `${l.spin}deg`, '--o': l.o }}
          >
            <Leaf variant={l.variant} className="h-full w-full" />
          </div>
        ))}
    </div>
  )
}
