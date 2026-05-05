import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

export const Title = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 48, 60], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });
  const blur = interpolate(frame, [0, 12], [10, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div
        style={{
          opacity,
          filter: `blur(${blur}px)`,
          fontFamily: theme.fontMono,
          fontSize: 140,
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
          fontSize: 32,
          color: theme.mutedForeground,
          maxWidth: 1100,
          textAlign: "center",
          fontWeight: 400,
        }}
      >
        Local-first document toolkit. Agent-native.
      </div>
    </AbsoluteFill>
  );
};
