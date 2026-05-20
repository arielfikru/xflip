import { expect, test } from '@playwright/test';

async function readTiltVars(
  page: import('@playwright/test').Page,
): Promise<{ x: string; y: string; tilting: boolean }> {
  return page.evaluate(() => {
    const card = document.getElementById('card') as HTMLElement;
    return {
      x: card.style.getPropertyValue('--xflip-tilt-x'),
      y: card.style.getPropertyValue('--xflip-tilt-y'),
      tilting: card.hasAttribute('data-tilting'),
    };
  });
}

test.describe('<xflip-card> pointer tilt', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?kind=flat');
    await page.evaluate(async () => {
      await (window as unknown as { __xflipReady: Promise<unknown> }).__xflipReady;
    });
  });

  test('pointer move sets tilt CSS vars and data-tilting; leave releases them', async ({
    page,
  }) => {
    const card = page.locator('#card');
    const box = await card.boundingBox();
    if (!box) throw new Error('xflip-card has no bounding box');

    // Move to top-left quadrant: nx < 0, ny < 0. tilt-y = nx * tiltMax > -8.
    // Sign convention in xflip-card.ts: tilt-x = -ny*tiltMax, tilt-y = nx*tiltMax.
    // Top-left: ny ≈ -1 → tilt-x ≈ +tiltMax; nx ≈ -1 → tilt-y ≈ -tiltMax.
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
    await expect.poll(async () => (await readTiltVars(page)).tilting).toBe(true);

    const tl = await readTiltVars(page);
    expect(parseFloat(tl.x)).toBeGreaterThan(0);
    expect(parseFloat(tl.y)).toBeLessThan(0);

    // Bottom-right quadrant should flip both signs.
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await expect
      .poll(async () => {
        const v = await readTiltVars(page);
        return parseFloat(v.x) < 0 && parseFloat(v.y) > 0;
      })
      .toBe(true);

    // Move off to release. Use a deliberate point well outside the host rect.
    await page.mouse.move(box.x - 50, box.y - 50);
    await expect
      .poll(async () => {
        const v = await readTiltVars(page);
        return v.tilting === false && v.x === '0deg' && v.y === '0deg';
      })
      .toBe(true);
  });
});
