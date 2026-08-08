import React from "react";
import { loadFont } from "@remotion/fonts";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame
} from "remotion";

void loadFont({ family: "At Umami", url: staticFile("fonts/AtUmamiVAR.woff2") });
void loadFont({ family: "At Textual", url: staticFile("fonts/AtTextualVAR.woff2") });
void loadFont({ family: "IBM Plex Sans", url: staticFile("fonts/IBMPlexSansVAR.woff2") });

const ease = Easing.bezier(0.16, 1, 0.3, 1);

type CopyBeatProps = {
  detail?: string;
  end: number;
  index: string;
  start: number;
  text: string;
};

function CopyBeat({ detail, end, index, start, text }: CopyBeatProps) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 10, end - 10, end], [0, 1, 1, 0], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        left: 150,
        opacity,
        position: "absolute",
        top: 310,
        translate: `0 ${interpolate(frame, [start, start + 12], [18, 0], {
          easing: ease,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })}px`,
        width: 880
      }}
    >
      <div
        style={{
          alignItems: "center",
          color: "#68706A",
          display: "flex",
          fontFamily: "At Textual",
          fontSize: 22,
          fontWeight: 600,
          gap: 14,
          letterSpacing: "0.02em"
        }}
      >
        <span>{index}</span>
        <span style={{ background: "#9C978A", height: 1, width: 62 }} />
      </div>
      <div
        style={{
          color: "#171A1F",
          fontFamily: "At Umami",
          fontSize: 98,
          fontWeight: 680,
          letterSpacing: "-0.045em",
          lineHeight: 0.98,
          marginTop: 28,
          maxWidth: 850
        }}
      >
        {text}
      </div>
      {detail ? (
        <div
          style={{
            color: "#68706A",
            fontFamily: "IBM Plex Sans",
            fontSize: 30,
            fontWeight: 430,
            lineHeight: 1.35,
            marginTop: 28
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

type ProductShotProps = {
  end: number;
  height: number;
  scrollEnd?: number;
  scrollStart?: number;
  src: string;
  start: number;
};

function ProductShot({ end, height, scrollEnd = 0, scrollStart = 0, src, start }: ProductShotProps) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 12, end - 12, end], [0, 1, 1, 0], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <CanvasImage
      src={staticFile(src)}
      style={{
        height,
        left: 0,
        opacity,
        position: "absolute",
        top: 0,
        translate: `0 ${interpolate(frame, [start + 16, end - 8], [scrollStart, scrollEnd], {
          easing: ease,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })}px`,
        width: 504
      }}
    />
  );
}

function BrowserToolbar() {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        alignItems: "center",
        background: "#F7F5EE",
        border: "1px solid #9C978A",
        borderRadius: 8,
        boxShadow: "0 18px 48px rgb(32 32 30 / 0.12)",
        display: "flex",
        gap: 12,
        height: 74,
        opacity: interpolate(frame, [0, 10, 54, 68], [0, 1, 1, 0], {
          easing: ease,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        }),
        padding: "10px 12px",
        position: "absolute",
        right: 108,
        top: 58,
        width: 504
      }}
    >
      <div
        style={{
          background: "#FFFDF8",
          border: "1px solid #CCC7B8",
          borderRadius: 6,
          color: "#68706A",
          flex: 1,
          fontFamily: "IBM Plex Sans",
          fontSize: 18,
          fontWeight: 500,
          padding: "13px 16px"
        }}
      >
        baseten.co
      </div>
      <div
        style={{
          alignItems: "center",
          background: "#FFFDF8",
          border: "1px solid #CCC7B8",
          borderRadius: 6,
          display: "flex",
          height: 52,
          justifyContent: "center",
          width: 52
        }}
      >
        <CanvasImage
          src={staticFile("product/chrome-extension-icon.png")}
          style={{ height: 38, width: 38 }}
        />
      </div>
    </div>
  );
}

function IconCursor() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [18, 28, 52, 62], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const press = interpolate(frame, [42, 46, 52], [1, 0.82, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <Pointer
      left={1746}
      opacity={opacity}
      press={press}
      top={83}
      translateX={interpolate(frame, [18, 40], [60, 0], {
        easing: ease,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })}
      translateY={interpolate(frame, [18, 40], [42, 0], {
        easing: ease,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })}
    />
  );
}

function ButtonCursor() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [92, 102, 132, 140], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const press = interpolate(frame, [116, 120, 126], [1, 0.82, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <Pointer
      left={420}
      opacity={opacity}
      press={press}
      top={410}
      translateX={interpolate(frame, [92, 114], [38, 0], {
        easing: ease,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })}
      translateY={interpolate(frame, [92, 114], [28, 0], {
        easing: ease,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })}
    />
  );
}

type PointerProps = {
  left: number;
  opacity: number;
  press: number;
  top: number;
  translateX: number;
  translateY: number;
};

function Pointer({ left, opacity, press, top, translateX, translateY }: PointerProps) {
  return (
    <div
      style={{
        filter: "drop-shadow(0 3px 5px rgb(23 26 31 / 0.24))",
        height: 58,
        left,
        opacity,
        position: "absolute",
        scale: press,
        top,
        translate: `${translateX}px ${translateY}px`,
        width: 58
      }}
    >
      <svg height="58" viewBox="0 0 58 58" width="58">
        <path
          d="M8 5L43 34L27 36L20 51L8 5Z"
          fill="#FFFDF8"
          stroke="#171A1F"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}

function StepRail() {
  const frame = useCurrentFrame();
  const active = frame < 84 ? 0 : frame < 156 ? 1 : frame < 228 ? 2 : 3;

  return (
    <div style={{ bottom: 112, display: "flex", gap: 12, left: 150, position: "absolute" }}>
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          style={{
            background: index === active ? "#6E5C9E" : "#B7B2A5",
            height: 4,
            opacity: index <= active ? 1 : 0.48,
            width: index === active ? 86 : 38
          }}
        />
      ))}
    </div>
  );
}

export function FirstCompanyGuideVideo() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: "#E4DCC8", overflow: "hidden" }}>
      <div
        style={{
          backgroundImage: "linear-gradient(rgb(156 151 138 / 0.13) 1px, transparent 1px)",
          backgroundSize: "100% 54px",
          inset: 0,
          opacity: 0.55,
          position: "absolute"
        }}
      />
      <div
        style={{
          alignItems: "center",
          color: "#171A1F",
          display: "flex",
          fontFamily: "At Umami",
          fontSize: 27,
          fontWeight: 680,
          gap: 14,
          left: 150,
          position: "absolute",
          top: 90
        }}
      >
        <span style={{ background: "#6E5C9E", borderRadius: 999, height: 13, width: 13 }} />
        Cold Start
      </div>

      <CopyBeat detail="When you need context on a company." end={84} index="01" start={0} text="Open Cold Start." />
      <CopyBeat end={156} index="02" start={72} text="Begin research." />
      <CopyBeat end={228} index="03" start={144} text="Sources appear." />
      <CopyBeat end={336} index="04" start={216} text="Read the profile." />
      <StepRail />

      <BrowserToolbar />
      <IconCursor />

      <div
        style={{
          background: "#F7F5EE",
          border: "1px solid #9C978A",
          borderRadius: 8,
          boxShadow: "0 24px 64px rgb(32 32 30 / 0.16)",
          height: 964,
          overflow: "hidden",
          position: "absolute",
          right: 108,
          top: 58,
          translate: `${interpolate(frame, [48, 70], [620, 0], {
            easing: ease,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          })}px 0`,
          width: 504
        }}
      >
        <ProductShot end={164} height={1080} src="product/intake.png" start={0} />
        <ProductShot end={216} height={1082.4} src="product/sources.png" start={144} />
        <ProductShot end={252} height={1080} src="product/early-read.png" start={204} />
        <ProductShot end={336} height={1999.2} scrollEnd={-700} src="product/profile.png" start={240} />
        <ButtonCursor />
      </div>

      <div
        style={{
          border: "1px solid rgb(156 151 138 / 0.68)",
          borderRadius: 8,
          inset: 28,
          opacity: interpolate(frame, [0, 16], [0, 1], {
            easing: ease,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          }),
          pointerEvents: "none",
          position: "absolute"
        }}
      />
    </AbsoluteFill>
  );
}
