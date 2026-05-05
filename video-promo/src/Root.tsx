import { Composition } from "remotion";
import { Demo, FPS, DURATION_FRAMES, WIDTH, HEIGHT } from "./Demo";

export const Root = () => {
  return (
    <>
      <Composition
        id="Demo"
        component={Demo}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
