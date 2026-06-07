import { expect, type Locator, type Page } from "@playwright/test";

export type DragSample = {
  cardCenterY: number;
  deltaFromPointer: number;
  label: string;
  pointerY: number;
  transform: string;
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
