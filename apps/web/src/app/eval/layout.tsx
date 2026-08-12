import type { ReactNode } from "react";
import { assertEvalRigEnabled } from "./gate";
import "./eval.css";

export default function EvalLayout({ children }: { children: ReactNode }) {
  assertEvalRigEnabled();
  return (
    <div className="eval-rig">
      <header className="eval-rig-header">Cold Start / taste rig</header>
      {children}
    </div>
  );
}
