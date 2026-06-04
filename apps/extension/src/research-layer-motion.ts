import { dampenOutsideRange, projectIntent } from "./motion-primitives";

const SNAP_THRESHOLD = -58;
const SNAP_PREVIEW_THRESHOLD = -24;
const SNAP_FLICK_VELOCITY = -460;
const SNAP_PROJECTION_SCALE = 0.18;
const CLICK_SUPPRESSION_THRESHOLD = 7;

export function dragOffsetShouldSnap(offsetY: number, velocityY = 0) {
  const projectedOffsetY = offsetY + projectVelocity(velocityY) * SNAP_PROJECTION_SCALE;
  return projectedOffsetY <= SNAP_THRESHOLD || (offsetY <= SNAP_PREVIEW_THRESHOLD && velocityY <= SNAP_FLICK_VELOCITY);
}

export function dragOffsetShouldPreview(offsetY: number) {
  return offsetY <= SNAP_PREVIEW_THRESHOLD;
}

export function dragOffsetShouldSuppressClick(offset: { x: number; y: number }) {
  return Math.hypot(offset.x, offset.y) >= CLICK_SUPPRESSION_THRESHOLD;
}

export function projectVelocity(initialVelocity: number, decelerationRate = 0.998) {
  return projectIntent(initialVelocity, decelerationRate);
}

export function dampenDragOffset(offsetY: number) {
  return dampenOutsideRange(offsetY, [-130, 0], 2.4);
}
