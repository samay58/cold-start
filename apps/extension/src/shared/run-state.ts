import type { ResearchLayerId } from "../research/research-layer";

export type RunState = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

export type ActiveSectionRunState = RunState & {
  layerId: ResearchLayerId;
};
