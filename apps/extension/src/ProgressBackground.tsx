import { lazy, Suspense, useEffect, useState } from "react";
import { useResolvedThemeValue } from "./theme";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const ProgressMeshGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({ default: module.MeshGradient }))
);
const ProgressStaticMeshGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({ default: module.StaticMeshGradient }))
);

// The shader takes colors as JS props, so CSS tokens cannot reach it. Pass a
// warm-dark mesh on dark; the CSS fallback gradient flips via tokens already.
const MESH_COLORS_LIGHT = ["#f7f5ee", "#f4eddc", "#fffdf8", "#f4eddc", "#6e5c9e"];
const MESH_COLORS_DARK = ["#1b1612", "#241d18", "#2c241d", "#241d18", "#bba8df"];

export function ProgressBackground() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const resolvedTheme = useResolvedThemeValue();
  const meshColors = resolvedTheme === "dark" ? MESH_COLORS_DARK : MESH_COLORS_LIGHT;
  const [shaderEnabled, setShaderEnabled] = useState(false);

  useEffect(() => {
    if (navigator.userAgent.toLowerCase().includes("jsdom")) {
      setShaderEnabled(false);
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
    <div className="cs-generation-mesh" aria-hidden="true" data-reduced-motion={prefersReducedMotion ? "true" : "false"}>
      <span className="cs-generation-mesh-fallback" />
      {shaderEnabled ? (
        <Suspense fallback={null}>
          {prefersReducedMotion ? (
            <ProgressStaticMeshGradient
              className="cs-generation-mesh-shader"
              colors={meshColors}
              fit="cover"
              grainMixer={0.42}
              grainOverlay={0.08}
              mixing={0.62}
              positions={32}
              scale={1.18}
              waveX={0.14}
              waveXShift={0.28}
              waveY={0.10}
              waveYShift={0.62}
            />
          ) : (
            <ProgressMeshGradient
              className="cs-generation-mesh-shader"
              colors={meshColors}
              distortion={0.18}
              fit="cover"
              grainMixer={0.35}
              grainOverlay={0.06}
              scale={1.16}
              speed={0.07}
              swirl={0.12}
            />
          )}
        </Suspense>
      ) : null}
    </div>
  );
}
