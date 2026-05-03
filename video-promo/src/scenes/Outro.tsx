import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

export const Outro = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 50, 60], [0, 1, 1, 0.85], {
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [0, 18], [20, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 32,
        background: theme.background,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${lift}px)`,
          fontFamily: theme.fontMono,
          fontSize: 96,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: theme.foreground,
        }}
      >
        paperloom
      </div>
      <div
        style={{
          opacity,
          transform: `translateY(${lift}px)`,
          fontSize: 28,
          color: theme.mutedForeground,
          maxWidth: 1200,
          textAlign: "center",
        }}
      >
        OCR + PDF tools + PII anonymizer.
        <br />
        Python, CLI, MCP server, web UI. Single Ollama model.
      </div>
      <div
        style={{
          opacity,
          marginTop: 24,
          fontFamily: theme.fontMono,
          fontSize: 20,
          color: theme.foreground,
          padding: "10px 20px",
          borderRadius: 10,
          background: theme.muted,
          border: `1px solid ${theme.border}`,
        }}
      >
        github.com/luciopalmieri/paperloom
      </div>
    </AbsoluteFill>
  );
};
