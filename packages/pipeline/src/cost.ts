export type CostLine = {
  label: string;
  usd: number;
};

export function totalGenerationCost(lines: CostLine[]) {
  const total = lines.reduce((sum, line) => {
    if (!Number.isFinite(line.usd) || line.usd < 0) {
      throw new Error(`Generation cost line "${line.label}" must be finite nonnegative USD`);
    }

    return sum + line.usd;
  }, 0);

  return Number(total.toFixed(4));
}
