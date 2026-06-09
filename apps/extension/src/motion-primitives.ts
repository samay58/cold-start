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

// Workhorse springs sit just under critical damping (zeta ~0.91) so committed motion
// settles fast but keeps a breath of follow-through. Reference tunings: the source-pass
// substep spring (500/30/0.62, zeta 0.85) and the pile drag bounce (zeta 0.71).
export const snapSpring = {
  type: "spring",
  stiffness: 620,
  damping: 34,
  mass: 0.56
} as const;

export const commitSpring = {
  type: "spring",
  stiffness: 470,
  damping: 31,
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
