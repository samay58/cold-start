import React from "react";
import { loadFont } from "@remotion/google-fonts/IBMPlexSans";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const { fontFamily } = loadFont("normal", {
  subsets: ["latin"],
  weights: ["400", "500", "600", "700"]
});

const colors = {
  accent: "#6E5C9E",
  accentWash: "#EEEAF7",
  field: "#F7F5EE",
  ground: "#E4DCC8",
  ink: "#171A1F",
  muted: "#68706A",
  paper: "#F4EDDC",
  plate: "#FFFDF8",
  rule: "#CCC7B8",
  ruleStrong: "#B7AA8B",
  verified: "#0E6B5B"
} as const;

const sharedEasing = Easing.bezier(0.16, 1, 0.3, 1);

const frameOf = (seconds: number) => Math.round(seconds * 24);

type SceneTextProps = {
  eyebrow: string;
  headline: string;
  detail: string;
  sceneStart: number;
  sceneEnd: number;
};

function SceneText({ eyebrow, headline, detail, sceneStart, sceneEnd }: SceneTextProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        left: 144,
        opacity: interpolate(frame, [sceneStart, sceneStart + 0.5 * fps, sceneEnd - 0.45 * fps, sceneEnd], [0, 1, 1, 0], {
          easing: [sharedEasing, Easing.linear, Easing.bezier(0.7, 0, 0.84, 0)],
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        }),
        position: "absolute",
        top: 142,
        translate: `0 ${interpolate(frame, [sceneStart, sceneStart + 0.5 * fps], [18, 0], {
          easing: sharedEasing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })}px`,
        width: 650,
        zIndex: 4
      }}
    >
      <div
        style={{
          alignItems: "center",
          color: colors.muted,
          display: "flex",
          fontFamily,
          fontSize: 21,
          fontWeight: 600,
          gap: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase"
        }}
      >
        <span style={{ background: colors.accent, height: 9, width: 9 }} />
        {eyebrow}
      </div>
      <div
        style={{
          color: colors.ink,
          fontFamily,
          fontSize: 102,
          fontWeight: 700,
          letterSpacing: "-0.065em",
          lineHeight: 0.93,
          marginTop: 28,
          maxWidth: 620
        }}
      >
        {headline}
      </div>
      <div
        style={{
          color: colors.muted,
          fontFamily,
          fontSize: 31,
          fontWeight: 400,
          letterSpacing: "-0.02em",
          lineHeight: 1.32,
          marginTop: 28,
          maxWidth: 560
        }}
      >
        {detail}
      </div>
    </div>
  );
}

function BrowserChrome({ activeStep }: { activeStep: 1 | 2 | 3 }) {
  const frame = useCurrentFrame();
  const toolbarProgress = interpolate(frame, [frameOf(6), frameOf(6.6)], [0, 1], {
    easing: sharedEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <>
      <div
        style={{
          alignItems: "center",
          background: colors.field,
          borderBottom: `1px solid ${colors.rule}`,
          display: "flex",
          gap: 14,
          height: 68,
          padding: "0 22px"
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map((index) => (
            <span key={index} style={{ background: colors.muted, borderRadius: 999, height: 8, opacity: 0.65, width: 8 }} />
          ))}
        </div>
        <div
          style={{
            background: colors.plate,
            border: `1px solid ${colors.rule}`,
            borderRadius: 3,
            color: colors.muted,
            flex: 1,
            fontFamily,
            fontSize: 18,
            fontWeight: 500,
            padding: "10px 14px"
          }}
        >
          linear.app
        </div>
        <div
          style={{
            alignItems: "center",
            background: activeStep === 2 || activeStep === 3 ? colors.accentWash : colors.plate,
            border: `1px solid ${activeStep === 2 || activeStep === 3 ? colors.accent : colors.ruleStrong}`,
            borderRadius: 3,
            color: activeStep === 2 || activeStep === 3 ? colors.accent : colors.muted,
            display: "flex",
            fontFamily,
            fontSize: 17,
            fontWeight: 600,
            gap: 9,
            padding: "10px 13px",
            scale: activeStep === 2 ? 1 + 0.035 * Math.sin(frame / 5) : 1
          }}
        >
          <span
            style={{
              border: `1.5px solid currentColor`,
              height: 16,
              opacity: activeStep === 2 ? 0.8 + toolbarProgress * 0.2 : 1,
              width: 20
            }}
          />
          Cold Start
        </div>
      </div>
      {activeStep === 2 ? (
        <div
          style={{
            background: colors.accent,
            height: 3,
            opacity: toolbarProgress,
            position: "absolute",
            right: 24,
            top: 63,
            width: 137
          }}
        />
      ) : null}
    </>
  );
}

function LinearSite() {
  const frame = useCurrentFrame();
  const pageOpacity = interpolate(frame, [frameOf(0.6), frameOf(1.1)], [0, 1], {
    easing: sharedEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div style={{ opacity: pageOpacity, padding: "70px 66px" }}>
      <div style={{ alignItems: "center", display: "flex", gap: 20 }}>
        <div
          style={{
            alignItems: "center",
            background: colors.ink,
            borderRadius: 9,
            color: colors.plate,
            display: "flex",
            fontFamily,
            fontSize: 52,
            fontWeight: 700,
            height: 82,
            justifyContent: "center",
            letterSpacing: "-0.07em",
            width: 82
          }}
        >
          L
        </div>
        <div>
          <div style={{ color: colors.ink, fontFamily, fontSize: 54, fontWeight: 700, letterSpacing: "-0.055em" }}>Linear</div>
          <div style={{ color: colors.muted, fontFamily, fontSize: 23, marginTop: 6 }}>Product development, streamlined.</div>
        </div>
      </div>
      <div style={{ background: colors.field, border: `1px solid ${colors.rule}`, marginTop: 58, padding: "28px 30px" }}>
        <div style={{ color: colors.muted, fontFamily, fontSize: 18, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Company site
        </div>
        <div style={{ color: colors.ink, fontFamily, fontSize: 37, fontWeight: 600, letterSpacing: "-0.04em", marginTop: 18 }}>
          Make product work feel calm again.
        </div>
        <div style={{ background: colors.rule, height: 1, marginTop: 30, width: "100%" }} />
        <div style={{ display: "flex", gap: 20, marginTop: 23 }}>
          {["Teams", "Projects", "Customers"].map((item) => (
            <span key={item} style={{ color: colors.muted, fontFamily, fontSize: 19 }}>
              {item}
            </span>
          ))}
        </div>
      </div>
      <div
        style={{
          background: colors.paper,
          border: `1px solid ${colors.rule}`,
          bottom: 48,
          display: "flex",
          gap: 14,
          left: 66,
          padding: "16px 18px",
          position: "absolute",
          right: 66
        }}
      >
        <span style={{ background: colors.verified, height: 9, marginTop: 7, width: 9 }} />
        <span style={{ color: colors.muted, fontFamily, fontSize: 19, lineHeight: 1.4 }}>
          You are on a company site. That is enough to start.
        </span>
      </div>
    </div>
  );
}

function FiledCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stampSpring = spring({
    config: { damping: 18, mass: 0.7, stiffness: 150 },
    fps,
    frame: Math.max(0, frame - frameOf(13.15))
  });

  return (
    <div style={{ display: "grid", gap: 18, padding: "27px 28px" }}>
      <div style={{ alignItems: "start", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: colors.accent, fontFamily, fontSize: 16, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Cold Start
          </div>
          <div style={{ color: colors.ink, fontFamily, fontSize: 37, fontWeight: 700, letterSpacing: "-0.055em", marginTop: 9 }}>Linear</div>
        </div>
        <div
          style={{
            border: `2px solid ${colors.accent}`,
            color: colors.accent,
            fontFamily,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.09em",
            opacity: stampSpring,
            padding: "9px 10px",
            rotate: `${-7 + (1 - stampSpring) * 15}deg`,
            scale: 0.76 + stampSpring * 0.24
          }}
        >
          FILED
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${colors.rule}`, display: "grid", gap: 13, paddingTop: 18 }}>
        <div style={{ color: colors.muted, fontFamily, fontSize: 16, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          What it does
        </div>
        <div style={{ color: colors.ink, fontFamily, fontSize: 23, fontWeight: 500, letterSpacing: "-0.026em", lineHeight: 1.27 }}>
          Product development software for teams that want less process around the work.
        </div>
        <div style={{ alignItems: "center", color: colors.muted, display: "flex", fontFamily, fontSize: 15, gap: 9 }}>
          <span style={{ background: colors.verified, height: 7, width: 7 }} />
          6 sources held beside the read
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${colors.rule}`, display: "grid", gap: 12, paddingTop: 18 }}>
        <div style={{ color: colors.muted, fontFamily, fontSize: 16, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Latest signal
        </div>
        <div style={{ color: colors.ink, fontFamily, fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.32 }}>
          A cited profile, without the tab-hopping.
        </div>
      </div>
    </div>
  );
}

function SidePanel({ state }: { state: "begin" | "filed" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panelStart = state === "begin" ? frameOf(6.25) : frameOf(12.15);

  return (
    <div
      style={{
        background: colors.paper,
        borderLeft: `1px solid ${colors.ruleStrong}`,
        bottom: 0,
        opacity: interpolate(frame, [panelStart, panelStart + 0.45 * fps], [0, 1], {
          easing: sharedEasing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        }),
        position: "absolute",
        right: 0,
        top: 69,
        translate: `${interpolate(frame, [panelStart, panelStart + 0.55 * fps], [78, 0], {
          easing: sharedEasing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })}px 0`,
        width: 433
      }}
    >
      <div
        style={{
          alignItems: "center",
          borderBottom: `1px solid ${colors.rule}`,
          color: colors.muted,
          display: "flex",
          fontFamily,
          fontSize: 16,
          fontWeight: 600,
          justifyContent: "space-between",
          letterSpacing: "0.04em",
          padding: "18px 22px",
          textTransform: "uppercase"
        }}
      >
        <span style={{ color: colors.accent }}>Cold Start</span>
        <span>Linear</span>
      </div>
      {state === "begin" ? (
        <div style={{ display: "grid", gap: 24, padding: "37px 28px" }}>
          <div>
            <div style={{ color: colors.muted, fontFamily, fontSize: 17, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Linear
            </div>
            <div style={{ color: colors.ink, fontFamily, fontSize: 39, fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 1.02, marginTop: 12 }}>
              Ready when you are.
            </div>
          </div>
          <div
            style={{
              alignItems: "center",
              background: colors.ink,
              color: colors.plate,
              display: "flex",
              fontFamily,
              fontSize: 20,
              fontWeight: 600,
              justifyContent: "space-between",
              padding: "18px 19px"
            }}
          >
            Begin research
            <span style={{ color: colors.paper, fontSize: 25, lineHeight: 0.7 }}>+</span>
          </div>
          <div style={{ borderTop: `1px solid ${colors.rule}`, color: colors.muted, fontFamily, fontSize: 17, lineHeight: 1.42, paddingTop: 18 }}>
            A sourced public profile. No setup required.
          </div>
        </div>
      ) : (
        <FiledCard />
      )}
    </div>
  );
}

function BrowserStage() {
  const frame = useCurrentFrame();
  const sceneTwoOpen = frame >= frameOf(5.75) && frame < frameOf(11.75);
  const sceneThreeOpen = frame >= frameOf(11.75);
  const activeStep = sceneThreeOpen ? 3 : sceneTwoOpen ? 2 : 1;
  const stageEnter = interpolate(frame, [frameOf(0.4), frameOf(1.05)], [0, 1], {
    easing: sharedEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        background: colors.plate,
        border: `1px solid ${colors.ruleStrong}`,
        bottom: 112,
        boxShadow: "18px 22px 0 rgba(32, 32, 30, 0.08), 0 18px 42px rgba(32, 32, 30, 0.1)",
        height: 650,
        opacity: stageEnter,
        overflow: "hidden",
        position: "absolute",
        right: 130,
        scale: 0.94 + stageEnter * 0.06,
        transformOrigin: "bottom right",
        translate: `${interpolate(frame, [frameOf(0.4), frameOf(1.05)], [60, 0], {
          easing: sharedEasing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })}px ${interpolate(frame, [frameOf(0.4), frameOf(1.05)], [45, 0], {
          easing: sharedEasing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })}px`,
        width: 1035,
        zIndex: 3
      }}
    >
      <BrowserChrome activeStep={activeStep} />
      <LinearSite />
      {sceneTwoOpen ? <SidePanel state="begin" /> : null}
      {sceneThreeOpen ? <SidePanel state="filed" /> : null}
      {sceneThreeOpen ? (
        <div
          style={{
            background: colors.plate,
            bottom: 0,
            left: 0,
            opacity: interpolate(frame, [frameOf(12.7), frameOf(13.25)], [0, 0.35], {
              easing: sharedEasing,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            }),
            position: "absolute",
            right: 433,
            top: 69
          }}
        />
      ) : null}
    </div>
  );
}

function StepRail() {
  const frame = useCurrentFrame();
  const activeIndex = frame >= frameOf(11.75) ? 2 : frame >= frameOf(5.75) ? 1 : 0;

  return (
    <div
      style={{
        bottom: 112,
        color: colors.muted,
        display: "flex",
        fontFamily,
        gap: 28,
        left: 144,
        position: "absolute",
        zIndex: 5
      }}
    >
      {["Open a company", "Open Cold Start", "Begin research"].map((label, index) => (
        <div key={label} style={{ alignItems: "center", display: "flex", gap: 10 }}>
          <span
            style={{
              background: index === activeIndex ? colors.accent : "transparent",
              border: `1px solid ${index === activeIndex ? colors.accent : colors.ruleStrong}`,
              height: 10,
              width: 10
            }}
          />
          <span style={{ color: index === activeIndex ? colors.ink : colors.muted, fontSize: 18, fontWeight: index === activeIndex ? 600 : 400 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export const FirstCompanyGuideVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: colors.ground, fontFamily, overflow: "hidden" }}>
      <div
        style={{
          border: `1px solid ${colors.ruleStrong}`,
          bottom: 48,
          left: 48,
          pointerEvents: "none",
          position: "absolute",
          right: 48,
          top: 48
        }}
      />
      <div
        style={{
          color: colors.muted,
          display: "flex",
          fontFamily,
          fontSize: 19,
          fontWeight: 600,
          justifyContent: "space-between",
          left: 86,
          letterSpacing: "0.06em",
          position: "absolute",
          right: 86,
          textTransform: "uppercase",
          top: 83,
          zIndex: 5
        }}
      >
        <span>Cold Start / first company</span>
        <span>{String(Math.min(3, Math.floor(frame / (6 * fps)) + 1)).padStart(2, "0")} / 03</span>
      </div>
      <SceneText
        detail="Start with a company you are already curious about. Cold Start waits for the site."
        eyebrow="First company"
        headline="Start with curiosity"
        sceneEnd={frameOf(5.7)}
        sceneStart={0}
      />
      <SceneText
        detail="Use the browser button. It reads the company you are on, not your browsing history."
        eyebrow="The simple part"
        headline="Open Cold Start"
        sceneEnd={frameOf(11.7)}
        sceneStart={frameOf(5.55)}
      />
      <SceneText
        detail="A profile arrives with the sources beside it, so you can decide what is worth carrying forward."
        eyebrow="The payoff"
        headline="Read what holds up"
        sceneEnd={456}
        sceneStart={frameOf(11.55)}
      />
      <BrowserStage />
      <StepRail />
      <div
        style={{
          bottom: 72,
          color: colors.muted,
          fontFamily,
          fontSize: 18,
          left: 144,
          opacity: interpolate(frame, [frameOf(16), frameOf(16.5)], [0, 1], {
            easing: sharedEasing,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          }),
          position: "absolute",
          zIndex: 5
        }}
      >
        You bring the curiosity. We bring the paper trail.
      </div>
    </AbsoluteFill>
  );
};
