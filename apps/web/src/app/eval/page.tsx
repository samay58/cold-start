import { assertEvalRigEnabled } from "./gate";

export default function EvalPage() {
  assertEvalRigEnabled();
  return <p>rounds load in Task 8</p>;
}
