// Hand-written declarations for signal-clusters.mjs, which stays plain dependency-free JS so the
// eval harness (node --test) can import the exact function the pipeline and UI use.

export type ClusterableSignal = {
  title: string;
  url: string;
  date: string;
  source: string;
  category: string;
  citationIds: string[];
};

export type SignalClusterOptions = {
  companyDomain?: string | null | undefined;
  companyName?: string | null | undefined;
  cap?: number | undefined;
};

export declare function clusterSignals<T extends ClusterableSignal>(
  signals: readonly T[] | null | undefined,
  options?: SignalClusterOptions
): T[];

export declare function signalClusterStats(
  signals: readonly ClusterableSignal[] | null | undefined,
  options?: SignalClusterOptions
): {
  signalCount: number;
  eventCount: number;
  distinctEventRatio: number | null;
};
