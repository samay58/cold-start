"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const StaticMeshGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({ default: module.StaticMeshGradient }))
);

// The documented near-static WebGL parchment island (DESIGN.md, Shape/Texture/Elevation).
// Scoped to the public card surface: the span carries the flat CSS fallback, so SSR,
// no-WebGL, and prefers-reduced-motion all read as the plain --cat-paper texture with
// no layout shift; the shader only ever paints on top of it.
export function CardTexture() {
  const [shaderEnabled, setShaderEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      setShaderEnabled(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")));
    } catch {
      setShaderEnabled(false);
    }
  }, []);

  return (
    <span aria-hidden="true" className="cs-card-texture">
      {shaderEnabled ? (
        <Suspense fallback={null}>
          <StaticMeshGradient
            className="cs-card-texture-shader"
            colors={["#f4eddc", "#efe6d2", "#f7f1e2", "#f4eddc", "#ece2ca"]}
            fit="cover"
            grainMixer={0.55}
            grainOverlay={0.12}
            mixing={0.66}
            positions={24}
            scale={1.3}
            waveX={0.1}
            waveXShift={0.4}
            waveY={0.08}
            waveYShift={0.55}
          />
        </Suspense>
      ) : null}
    </span>
  );
}
