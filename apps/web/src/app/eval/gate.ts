import { notFound } from "next/navigation";

// The rig renders synthesis in a browser; public web must never show synthesis.
// Every /eval page and route handler calls this first.
export function assertEvalRigEnabled(): void {
  if (process.env.EVAL_RIG_ENABLED !== "true") notFound();
}

export function dataDir(): string {
  const dir = process.env.EVAL_RIG_DATA_DIR;
  if (!dir) throw new Error("EVAL_RIG_DATA_DIR must point at eval/curation (absolute path)");
  return dir;
}
