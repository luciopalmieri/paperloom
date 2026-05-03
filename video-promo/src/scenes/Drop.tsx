import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const Drop = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // PDF icon falls into the dropzone.
  const fallProgress = spring({ frame, fps, config: { damping: 20 } });
  const y = interpolate(fallProgress, [0, 1], [-400, 0]);
  const scale = interpolate(fallProgress, [0, 1], [0.7, 1]);

  // Dropzone highlights when icon arrives.
  const highlight = interpolate(frame, [20, 32], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: theme.background,
      }}
    >
      <div
        style={{
          width: 720,
          height: 360,
          borderRadius: 16,
          border: `3px dashed ${theme.foreground}`,
          background: `oklch(0.55 0.13 155 / ${highlight * 0.08})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            transform: `translateY(${y}px) scale(${scale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <PdfIcon />
          <div
            style={{
              fontFamily: theme.fontMono,
              fontSize: 24,
              color: theme.foreground,
            }}
          >
            workshop-manual.pdf
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          fontSize: 24,
          color: theme.mutedForeground,
        }}
      >
        Drop a PDF or image
      </div>
    </AbsoluteFill>
  );
};

const PdfIcon = () => (
  <svg width={120} height={150} viewBox="0 0 120 150" fill="none">
    <rect
      x={4}
      y={4}
      width={112}
      height={142}
      rx={8}
      fill={theme.card}
      stroke={theme.foreground}
      strokeWidth={3}
    />
    <rect x={20} y={32} width={80} height={6} rx={2} fill={theme.mutedForeground} />
    <rect x={20} y={48} width={64} height={6} rx={2} fill={theme.mutedForeground} />
    <rect x={20} y={64} width={72} height={6} rx={2} fill={theme.mutedForeground} />
    <rect x={20} y={94} width={80} height={32} rx={4} fill={theme.muted} />
    <text
      x={60}
      y={116}
      fontSize={18}
      fontWeight={700}
      fill={theme.foreground}
      textAnchor="middle"
      fontFamily={theme.fontMono}
    >
      PDF
    </text>
  </svg>
);
