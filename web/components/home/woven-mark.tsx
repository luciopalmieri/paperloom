type Props = {
  className?: string;
  ariaLabel?: string;
  animated?: boolean;
};

export function WovenMark({ className, ariaLabel, animated = false }: Props) {
  const horizY = [22, 38, 54, 70, 86, 102, 118];
  const vertX = [22, 38, 54, 70, 86, 102, 118];
  const cellGap = 8;

  return (
    <svg
      viewBox="0 0 140 140"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={animated ? "wovenmark-animated" : undefined}
      >
        {horizY.map((y, i) => (
          <line
            key={`h${i}`}
            x1="14"
            y1={y}
            x2="126"
            y2={y}
            opacity="0.85"
          />
        ))}
        {vertX.map((x, i) =>
          horizY.map((y, j) => {
            const isOver = (i + j) % 2 === 0;
            if (!isOver) return null;
            return (
              <line
                key={`v${i}-${j}`}
                x1={x}
                y1={y - cellGap}
                x2={x}
                y2={y + cellGap}
                opacity="0.95"
              />
            );
          })
        )}
        {vertX.map((x, i) => {
          const segments: { y1: number; y2: number }[] = [];
          let lastEnd = 14;
          horizY.forEach((y, j) => {
            const isOver = (i + j) % 2 === 0;
            if (isOver) {
              segments.push({ y1: lastEnd, y2: y - cellGap });
              lastEnd = y + cellGap;
            }
          });
          segments.push({ y1: lastEnd, y2: 126 });
          return segments.map((s, k) => (
            <line
              key={`vbg${i}-${k}`}
              x1={x}
              y1={s.y1}
              x2={x}
              y2={s.y2}
              opacity="0.4"
            />
          ));
        })}
      </g>
      <style>{`
        .wovenmark-animated line {
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
          animation: wovenmark-draw 900ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        .wovenmark-animated line:nth-child(7n+1) { animation-delay: 0ms; }
        .wovenmark-animated line:nth-child(7n+2) { animation-delay: 60ms; }
        .wovenmark-animated line:nth-child(7n+3) { animation-delay: 120ms; }
        .wovenmark-animated line:nth-child(7n+4) { animation-delay: 180ms; }
        .wovenmark-animated line:nth-child(7n+5) { animation-delay: 240ms; }
        .wovenmark-animated line:nth-child(7n+6) { animation-delay: 300ms; }
        .wovenmark-animated line:nth-child(7n+7) { animation-delay: 360ms; }
        @keyframes wovenmark-draw {
          to { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wovenmark-animated line {
            animation: none;
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </svg>
  );
}
