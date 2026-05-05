import { AbsoluteFill, Sequence } from "remotion";
import { theme } from "./theme";
import { Title } from "./scenes/Title";
import { Drop } from "./scenes/Drop";
import { OcrStream } from "./scenes/OcrStream";
import { Anonymize } from "./scenes/Anonymize";
import { Outro } from "./scenes/Outro";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
// 15s × 30fps = 450 frames.
export const DURATION_FRAMES = 450;

// Scene budget (frames): Title 60 | Drop 60 | OcrStream 180 | Anonymize 90 | Outro 60.
const SCENES = {
  title: { from: 0, length: 60 },
  drop: { from: 60, length: 60 },
  ocr: { from: 120, length: 180 },
  anon: { from: 300, length: 90 },
  outro: { from: 390, length: 60 },
};

export const Demo = () => {
  return (
    <AbsoluteFill style={{ background: theme.background, fontFamily: theme.fontSans }}>
      <Sequence from={SCENES.title.from} durationInFrames={SCENES.title.length}>
        <Title />
      </Sequence>
      <Sequence from={SCENES.drop.from} durationInFrames={SCENES.drop.length}>
        <Drop />
      </Sequence>
      <Sequence from={SCENES.ocr.from} durationInFrames={SCENES.ocr.length}>
        <OcrStream />
      </Sequence>
      <Sequence from={SCENES.anon.from} durationInFrames={SCENES.anon.length}>
        <Anonymize />
      </Sequence>
      <Sequence from={SCENES.outro.from} durationInFrames={SCENES.outro.length}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
