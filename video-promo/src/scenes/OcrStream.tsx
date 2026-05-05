import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

const TOTAL_PAGES = 8;
const SCENE_FRAMES = 180;

const SAMPLE_LINES = [
  "# Workshop Manual",
  "",
  "## 3.4 Hydraulic system overview",
  "",
  "The hydraulic system delivers power to the steering",
  "actuators through a closed-loop pressure circuit. The",
  "pump draws fluid from the reservoir at a baseline of",
  "**12 bar** and routes it through the main control valve.",
  "",
  "### Components",
  "",
  "- Reservoir (cap. 4.2 L)",
  "- Variable-displacement pump",
  "- Pressure-relief valve (set: 180 bar)",
  "- Return-line filter (10 µm)",
  "",
  "> ⚠ Always depressurize before service.",
];

export const OcrStream = () => {
  const frame = useCurrentFrame();

  const visiblePages = Math.min(
    TOTAL_PAGES,
    Math.floor(interpolate(frame, [0, SCENE_FRAMES * 0.7], [0, TOTAL_PAGES])),
  );
  const visibleChars = Math.floor(
    interpolate(frame, [10, SCENE_FRAMES], [0, SAMPLE_LINES.join("\n").length]),
  );
  const visibleText = SAMPLE_LINES.join("\n").slice(0, visibleChars);

  return (
    <AbsoluteFill
      style={{
        padding: "60px 80px",
        gap: 32,
        flexDirection: "column",
        background: theme.background,
      }}
    >
      <Header />
      <div style={{ display: "flex", gap: 24, flex: 1, minHeight: 0 }}>
        <ThumbColumn visiblePages={visiblePages} />
        <MarkdownColumn text={visibleText} />
      </div>
    </AbsoluteFill>
  );
};

const Header = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div
      style={{
        fontFamily: theme.fontMono,
        fontSize: 36,
        fontWeight: 600,
        color: theme.foreground,
      }}
    >
      OCR streaming
    </div>
    <PrivacyBadge />
  </div>
);

const PrivacyBadge = () => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 16px",
      borderRadius: 9999,
      background: theme.success,
      color: theme.background,
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: `${theme.background}b3`,
      }}
    />
    Local
  </div>
);

const ThumbColumn = ({ visiblePages }: { visiblePages: number }) => {
  return (
    <div
      style={{
        width: 220,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      {Array.from({ length: TOTAL_PAGES }, (_, i) => i).map((i) => {
        const done = i < visiblePages;
        const active = i === visiblePages;
        return (
          <Thumb key={i} index={i + 1} done={done} active={active} />
        );
      })}
    </div>
  );
};

const Thumb = ({
  index,
  done,
  active,
}: {
  index: number;
  done: boolean;
  active: boolean;
}) => {
  const frame = useCurrentFrame();
  const pulse = active ? 0.5 + 0.5 * Math.sin(frame / 4) : 1;
  const dotColor = done ? theme.success : active ? theme.info : theme.border;
  const opacity = done || active ? 1 : 0.5;
  return (
    <div
      style={{
        opacity,
        display: "flex",
        gap: 12,
        padding: 8,
        borderRadius: 8,
        border: `1px solid ${active ? theme.foreground : theme.border}`,
        background: theme.card,
      }}
    >
      <div
        style={{
          width: 60,
          height: 80,
          borderRadius: 4,
          background: theme.muted,
          border: `1px solid ${theme.border}`,
        }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: theme.foreground }}>
          {index}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: dotColor,
              opacity: active ? pulse : 1,
            }}
          />
          <span style={{ fontSize: 12, color: theme.mutedForeground }}>
            {done ? "Done" : active ? "Processing" : "Pending"}
          </span>
        </div>
      </div>
    </div>
  );
};

const MarkdownColumn = ({ text }: { text: string }) => (
  <div
    style={{
      flex: 1,
      borderRadius: 12,
      background: theme.card,
      border: `1px solid ${theme.border}`,
      padding: 32,
      fontFamily: theme.fontMono,
      fontSize: 22,
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
      color: theme.foreground,
      overflow: "hidden",
    }}
  >
    {text}
    <span
      style={{
        display: "inline-block",
        width: "0.6em",
        height: "1.1em",
        verticalAlign: "text-bottom",
        background: theme.foreground,
        marginLeft: 2,
      }}
    />
  </div>
);
