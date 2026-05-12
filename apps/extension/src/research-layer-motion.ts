const SNAP_THRESHOLD = -80;
const SNAP_PREVIEW_THRESHOLD = -42;
const CLICK_SUPPRESSION_THRESHOLD = 7;

export function dragOffsetShouldSnap(offsetY: number) {
  return offsetY <= SNAP_THRESHOLD;
}

export function dragOffsetShouldPreview(offsetY: number) {
  return offsetY <= SNAP_PREVIEW_THRESHOLD;
}

export function dragOffsetShouldSuppressClick(offset: { x: number; y: number }) {
  return Math.abs(offset.x) >= CLICK_SUPPRESSION_THRESHOLD || Math.abs(offset.y) >= CLICK_SUPPRESSION_THRESHOLD;
}
