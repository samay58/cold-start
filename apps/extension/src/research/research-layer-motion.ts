import { dampenOutsideRange, projectIntent } from "../shared/motion-primitives";

const SNAP_THRESHOLD = -68;
const SNAP_PREVIEW_THRESHOLD = -32;
const SNAP_FLICK_VELOCITY = -540;
const SNAP_PROJECTION_SCALE = 0.16;
const SNAP_STACK_INDEX_CAP = 5;
const SNAP_STACK_INDEX_STEP = 28;
const SNAP_PREVIEW_INDEX_STEP = 12;
const CLICK_SUPPRESSION_THRESHOLD = 7;

function thresholdForStackDepth(base: number, stackIndex: number, step: number) {
  const safeIndex = Math.max(0, Math.min(SNAP_STACK_INDEX_CAP, stackIndex));
  return base - safeIndex * step;
}

export function dragOffsetShouldSnap(offsetY: number, velocityY = 0, stackIndex = 0) {
  const threshold = thresholdForStackDepth(SNAP_THRESHOLD, stackIndex, SNAP_STACK_INDEX_STEP);
  const previewThreshold = thresholdForStackDepth(SNAP_PREVIEW_THRESHOLD, stackIndex, SNAP_PREVIEW_INDEX_STEP);
  const projectedOffsetY = offsetY + projectVelocity(velocityY) * SNAP_PROJECTION_SCALE;
  return projectedOffsetY <= threshold || (offsetY <= previewThreshold && velocityY <= SNAP_FLICK_VELOCITY);
}

export function dragOffsetShouldPreview(offsetY: number, stackIndex = 0) {
  return offsetY <= thresholdForStackDepth(SNAP_PREVIEW_THRESHOLD, stackIndex, SNAP_PREVIEW_INDEX_STEP);
}

export function dragOffsetShouldSuppressClick(offset: { x: number; y: number }) {
  return Math.hypot(offset.x, offset.y) >= CLICK_SUPPRESSION_THRESHOLD;
}

export function projectVelocity(initialVelocity: number, decelerationRate = 0.998) {
  return projectIntent(initialVelocity, decelerationRate);
}

export function dampenDragOffset(offsetY: number) {
  return dampenOutsideRange(offsetY, [-150, 0], 2.2);
}
