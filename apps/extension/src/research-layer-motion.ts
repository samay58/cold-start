const SNAP_THRESHOLD = -58;
const SNAP_PREVIEW_THRESHOLD = -24;
const SNAP_FLICK_VELOCITY = -460;
const CLICK_SUPPRESSION_THRESHOLD = 7;

export function dragOffsetShouldSnap(offsetY: number, velocityY = 0) {
  return offsetY <= SNAP_THRESHOLD || (offsetY <= SNAP_PREVIEW_THRESHOLD && velocityY <= SNAP_FLICK_VELOCITY);
}

export function dragOffsetShouldPreview(offsetY: number) {
  return offsetY <= SNAP_PREVIEW_THRESHOLD;
}

export function dragOffsetShouldSuppressClick(offset: { x: number; y: number }) {
  return Math.hypot(offset.x, offset.y) >= CLICK_SUPPRESSION_THRESHOLD;
}

export function dormantCardCanDrag() {
  return true;
}
