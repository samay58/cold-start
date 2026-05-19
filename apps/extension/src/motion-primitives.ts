export const motionTokens = {
  easeOut: [0.16, 1, 0.3, 1]
} as const;

export const snapSpring = {
  type: "spring",
  stiffness: 760,
  damping: 44,
  mass: 0.54
} as const;

export const commitSpring = {
  type: "spring",
  stiffness: 540,
  damping: 42,
  mass: 0.64
} as const;

export const instrumentSpring = {
  type: "spring",
  stiffness: 520,
  damping: 48,
  mass: 0.42
} as const;

export function projectIntent(initialVelocity: number, decelerationRate = 0.998) {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

export function dampenOutsideRange(value: number, [min, max]: [number, number], factor = 2) {
  if (value > max) {
    return max + Math.sqrt(value - max) * factor;
  }

  if (value < min) {
    return min - Math.sqrt(min - value) * factor;
  }

  return value;
}

export function clamp(value: number, [min, max]: [number, number]) {
  return Math.min(Math.max(value, min), max);
}

export function stageDelay(index: number, activeIndex: number) {
  return Math.max(0, Math.abs(index - activeIndex) * 0.025);
}
