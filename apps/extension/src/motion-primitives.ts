export const motionTokens = {
  ease: [0.25, 0.1, 0.25, 1],
  easeOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.77, 0, 0.175, 1],
  feedbackMs: 0.12,
  stateMs: 0.2
} as const;

export const reducedSpring = {
  stiffness: 1000,
  damping: 100,
  mass: 0.1
} as const;

export const snapSpring = {
  type: "spring",
  stiffness: 620,
  damping: 54,
  mass: 0.56
} as const;

export const commitSpring = {
  type: "spring",
  stiffness: 470,
  damping: 48,
  mass: 0.62
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
