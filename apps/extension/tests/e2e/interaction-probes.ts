import { expect, type Locator, type Page } from "@playwright/test";

export type DragSample = {
  cardCenterY: number;
  deltaFromPointer: number;
  label: string;
  pointerY: number;
  transform: string;
};

export type FocusSample = {
  bottom: number;
  display: string;
  height: number;
  left: number;
  right: number;
  tagName: string;
  top: number;
  visibility: string;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
};

export async function dragWithSamples({
  card,
  deltas,
  page,
  screenshotPrefix
}: {
  card: Locator;
  deltas: Array<{ label: string; y: number }>;
  page: Page;
  screenshotPrefix?: string;
}) {
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return [];
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const samples: DragSample[] = [];

  if (screenshotPrefix) {
    await page.screenshot({ fullPage: true, path: `/private/tmp/${screenshotPrefix}-rest.png` });
  }

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (const delta of deltas) {
    const pointerY = startY + delta.y;
    await page.mouse.move(startX, pointerY, { steps: 6 });
    await page.waitForTimeout(80);
    const rect = await card.boundingBox();
    expect(rect).not.toBeNull();
    if (!rect) {
      continue;
    }

    const transform = await card.evaluate((element) => getComputedStyle(element).transform);
    samples.push({
      cardCenterY: rect.y + rect.height / 2,
      deltaFromPointer: rect.y + rect.height / 2 - pointerY,
      label: delta.label,
      pointerY,
      transform
    });

    if (screenshotPrefix) {
      await page.screenshot({ fullPage: true, path: `/private/tmp/${screenshotPrefix}-${delta.label}.png` });
    }
  }

  return samples;
}

export function expectPointerAttached(samples: DragSample[], maxDelta = 3) {
  for (const sample of samples) {
    expect(
      Math.abs(sample.deltaFromPointer),
      `${sample.label} should stay attached to pointer, got ${sample.deltaFromPointer}px`
    ).toBeLessThanOrEqual(maxDelta);
  }
}

export async function expectFocusedElementVisible(page: Page) {
  const sample = await page.evaluate<FocusSample | null>(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return {
      bottom: rect.bottom,
      display: styles.display,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      tagName: element.tagName,
      top: rect.top,
      visibility: styles.visibility,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width
    };
  });

  expect(sample, "keyboard focus should land on a concrete element").not.toBeNull();
  if (!sample) {
    return;
  }

  expect(sample.display, `${sample.tagName} focus should not be display:none`).not.toBe("none");
  expect(sample.visibility, `${sample.tagName} focus should not be hidden`).not.toBe("hidden");
  expect(sample.width, `${sample.tagName} focus should have visible width`).toBeGreaterThan(0);
  expect(sample.height, `${sample.tagName} focus should have visible height`).toBeGreaterThan(0);
  expect(sample.bottom, `${sample.tagName} focus should not be above the viewport`).toBeGreaterThan(0);
  expect(sample.right, `${sample.tagName} focus should not be left of the viewport`).toBeGreaterThan(0);
  expect(sample.top, `${sample.tagName} focus should not be below the viewport`).toBeLessThan(sample.viewportHeight);
  expect(sample.left, `${sample.tagName} focus should not be right of the viewport`).toBeLessThan(sample.viewportWidth);
}
