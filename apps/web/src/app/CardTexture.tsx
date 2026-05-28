"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const PaperTexture = lazy(() =>
  import("@paper-design/shaders-react").then((m) => ({ default: m.PaperTexture }))
);

// Real parchment surface for the public card. Renders only after mount so the
// WebGL import never runs on the server; the card's flat --cat-paper fill is the
// fallback for SSR, no-WebGL, and reduced-motion (the shader is static anyway).
export function CardTexture() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      setEnabled(true);
    }
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <PaperTexture
        className="cs-card-texture"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        colorBack="#f4eddc"
        colorFront="#cdbf9c"
        scale={0.62}
        contrast={0.4}
        roughness={0.66}
        fiber={0.85}
        fiberSize={0.15}
        crumples={0.06}
        crumpleSize={0.4}
        folds={0.04}
        foldCount={2}
        drops={0.03}
        fade={0.1}
        speed={0}
        seed={7}
      />
    </Suspense>
  );
}
