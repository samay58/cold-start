export type CostLine = {
  label: string;
  usd: number;
};

export function totalGenerationCost(lines: CostLine[]) {
  return Number(lines.reduce((sum, line) => sum + line.usd, 0).toFixed(4));
}
