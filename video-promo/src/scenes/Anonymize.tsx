import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

const REDACTED = "█";

const FILE_NAME = "Senior AI Engineer _ Shopfully (1).md";

const ORIGINAL = `---
title: "Senior AI Engineer | Shopfully"
source: "https://www.linkedin.com/jobs/view/4404862371/?trackingId=1%2FDPPoKJSdKuhvk742wdWg%3D%3D"
author:
published:
created: 2026-04-28
description:
tags:
  - "clippings"
---
Senior AI Engineer

Unione Europea · 6 giorni fa · 82 persone hanno cliccato sul pulsante "Candidati"

Promossa da recruiter · Risposte gestite esternamente a LinkedIn

Contact: mario.rossi@shopfully.com · +39 333 123 4567`;

// PII strings to detect, in the order they appear. Offsets resolved at module
// load via indexOf — keeps the scene declarative.
const PII_TEXTS = [
  "https://www.linkedin.com/jobs/view/4404862371/?trackingId=1%2FDPPoKJSdKuhvk742wdWg%3D%3D",
  "2026-04-28",
  "mario.rossi@shopfully.com",
  "+39 333 123 4567",
];

type Span = { start: number; end: number };

const SPANS: Span[] = PII_TEXTS.map((needle) => {
  const start = ORIGINAL.indexOf(needle);
  return { start, end: start + needle.length };
}).filter((s) => s.start >= 0);

export const Anonymize = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Stage timing (90 frames @ 30 fps = 3 s).
  // 0-12  : panel fade in
  // 12-50 : detection — spans light up one by one
  // 50-80 : redacted text fills the right panel
  // 80-90 : settled state
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const detectFrac = interpolate(frame, [12, 50], [0, 1], {
    extrapolateRight: "clamp",
  });
  const redactFrac = interpolate(frame, [50, 80], [0, 1], {
    extrapolateRight: "clamp",
  });

  const detectedCount = Math.floor(detectFrac * SPANS.length);
  const maskedCount = Math.floor(redactFrac * SPANS.length);
  const elapsedSec = Math.min(22, Math.max(1, Math.floor(frame / fps) + 1));

  return (
    <AbsoluteFill
      style={{
        padding: "60px 80px",
        flexDirection: "column",
        gap: 16,
        background: theme.background,
        opacity: fadeIn,
      }}
    >
      <Header />
      <Divider />
      <SlowHint />
      <Toolbar
        filename={FILE_NAME}
        detected={detectedCount}
        elapsedSec={elapsedSec}
      />
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          minHeight: 0,
        }}
      >
        <OriginalPanel
          detectedCount={detectedCount}
          scanning={frame >= 12 && frame < 80}
          frame={frame}
        />
        <RedactedPanel maskedCount={maskedCount} redactFrac={redactFrac} />
      </div>
    </AbsoluteFill>
  );
};

const Header = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <h1
      style={{
        margin: 0,
        fontFamily: theme.fontMono,
        fontSize: 56,
        fontWeight: 600,
        color: theme.foreground,
        letterSpacing: "-0.02em",
      }}
    >
      Anonimizza
    </h1>
    <AiBadge />
  </div>
);

const AiBadge = () => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 9999,
      border: `1px solid ${theme.ai}`,
      color: theme.ai,
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 1,
    }}
  >
    <Sparkle />
    AI
  </span>
);

const Sparkle = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z" />
  </svg>
);

const Divider = () => (
  <div style={{ height: 1, background: theme.border, marginTop: 4 }} />
);

const SlowHint = () => (
  <p
    style={{
      margin: 0,
      fontSize: 18,
      color: theme.mutedForeground,
      fontFamily: theme.fontSans,
    }}
  >
    Il tempo di rilevamento dipende dalla lunghezza del testo: documenti lunghi
    possono richiedere uno o due minuti.
  </p>
);

const Toolbar = ({
  filename,
  detected,
  elapsedSec,
}: {
  filename: string;
  detected: number;
  elapsedSec: number;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <span
      style={{
        fontFamily: theme.fontMono,
        fontSize: 16,
        color: theme.foreground,
      }}
    >
      {filename}
    </span>
    <Chip
      label={`${detected} rilevati`}
      tone={detected > 0 ? "warning" : "muted"}
    />
    <span style={{ fontSize: 14, color: theme.mutedForeground }}>
      · rilevamento PII
    </span>
    <span style={{ fontSize: 14, color: theme.mutedForeground, fontVariantNumeric: "tabular-nums" }}>
      · {elapsedSec}s
    </span>
    <div style={{ flex: 1 }} />
    <span style={{ fontSize: 14, color: theme.mutedForeground }}>Preset</span>
    <PresetSelect value="Bilanciato" />
    <ToolbarButton icon="square" label="Stop" />
    <ToolbarButton icon="upload" label="Sostituisci input" />
  </div>
);

const Chip = ({ label, tone }: { label: string; tone: "warning" | "muted" }) => {
  const isWarn = tone === "warning";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 6,
        background: isWarn
          ? `color-mix(in oklch, ${theme.warning} 15%, transparent)`
          : theme.muted,
        color: isWarn ? theme.warning : theme.mutedForeground,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
};

const PresetSelect = ({ value }: { value: string }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minWidth: 200,
      padding: "6px 12px",
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: theme.card,
      color: theme.foreground,
      fontSize: 14,
    }}
  >
    <span>{value}</span>
    <span style={{ color: theme.mutedForeground, fontSize: 12 }}>▾</span>
  </div>
);

const ToolbarButton = ({
  icon,
  label,
}: {
  icon: "square" | "upload";
  label: string;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 12px",
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: theme.background,
      color: theme.foreground,
      fontSize: 14,
    }}
  >
    {icon === "square" ? <SquareIcon /> : <UploadIcon />}
    {label}
  </div>
);

const SquareIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <rect x={3} y={3} width={18} height={18} rx={2} />
  </svg>
);

const UploadIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
  </svg>
);

const OriginalPanel = ({
  detectedCount,
  scanning,
  frame,
}: {
  detectedCount: number;
  scanning: boolean;
  frame: number;
}) => {
  const segments = buildSegments(ORIGINAL, SPANS.slice(0, detectedCount));

  // Scanning sweep — vertical gradient drifts top → bottom on a 3.5s loop.
  const sweepCycle = (frame % 105) / 105; // 105 frames ≈ 3.5s @ 30fps
  const sweepY = interpolate(sweepCycle, [0, 1], [-30, 130]);

  return (
    <Card title="Originale">
      <div
        style={{
          position: "relative",
          height: "100%",
          overflow: "hidden",
          borderRadius: 8,
        }}
      >
        {scanning && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${sweepY}%`,
              height: "30%",
              background: `linear-gradient(180deg, transparent 0%, color-mix(in oklch, ${theme.info} 18%, transparent) 50%, transparent 100%)`,
              pointerEvents: "none",
              zIndex: 1,
              mixBlendMode: "screen",
            }}
          />
        )}
        <pre
          style={{
            margin: 0,
            padding: 24,
            fontFamily: theme.fontMono,
            fontSize: 16,
            lineHeight: 1.55,
            color: theme.foreground,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            position: "relative",
            zIndex: 2,
          }}
        >
          {segments.map((seg, idx) =>
            seg.span ? (
              <mark
                key={idx}
                style={{
                  background: `color-mix(in oklch, ${theme.warning} 30%, transparent)`,
                  color: theme.foreground,
                  borderRadius: 3,
                  padding: "0 2px",
                }}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={idx}>{seg.text}</span>
            ),
          )}
        </pre>
      </div>
    </Card>
  );
};

const RedactedPanel = ({
  maskedCount,
  redactFrac,
}: {
  maskedCount: number;
  redactFrac: number;
}) => {
  // Build a redacted version where the first `maskedCount` spans are masked.
  // While redaction is in progress show a subtle progress strip.
  const visibleSpans = SPANS.slice(0, maskedCount);
  const redactedText = applyRedactions(ORIGINAL, visibleSpans);

  // Reveal redacted text progressively as a typewriter-ish slice for visual
  // continuity with OCR streaming.
  const charsVisible = Math.floor(redactFrac * redactedText.length);
  const shown = redactedText.slice(0, charsVisible);

  return (
    <Card title="Redatto">
      <pre
        style={{
          margin: 0,
          padding: 24,
          fontFamily: theme.fontMono,
          fontSize: 16,
          lineHeight: 1.55,
          color: theme.foreground,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {shown.length > 0 ? (
          shown
        ) : (
          <span style={{ color: theme.mutedForeground }}>…</span>
        )}
      </pre>
    </Card>
  );
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      borderRadius: 12,
      background: theme.card,
      border: `1px solid ${theme.border}`,
      overflow: "hidden",
      minHeight: 0,
    }}
  >
    <div
      style={{
        padding: "16px 24px",
        fontSize: 18,
        fontWeight: 700,
        color: theme.foreground,
        fontFamily: theme.fontSans,
      }}
    >
      {title}
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
  </div>
);

type Segment = { text: string; span: Span | null };

function buildSegments(text: string, spans: Span[]): Segment[] {
  if (spans.length === 0) return [{ text, span: null }];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue;
    if (s.start > cursor) out.push({ text: text.slice(cursor, s.start), span: null });
    out.push({ text: text.slice(s.start, s.end), span: s });
    cursor = s.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), span: null });
  return out;
}

function applyRedactions(text: string, spans: Span[]): string {
  if (spans.length === 0) return text;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue;
    out += text.slice(cursor, s.start);
    out += REDACTED.repeat(s.end - s.start);
    cursor = s.end;
  }
  out += text.slice(cursor);
  return out;
}
