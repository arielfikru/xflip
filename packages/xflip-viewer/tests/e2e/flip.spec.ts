import { expect, test } from '@playwright/test';

async function readFlipperFace(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const card = document.getElementById('card') as HTMLElement;
    const flipper = card.shadowRoot?.querySelector('.flipper') as HTMLElement | null;
    return flipper?.dataset.face ?? null;
  });
}

test.describe('<xflip-card> click-to-flip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?kind=flat');
    await page.evaluate(async () => {
      await (window as unknown as { __xflipReady: Promise<unknown> }).__xflipReady;
    });
  });

  test('click toggles face front -> back -> front', async ({ page }) => {
    expect(await readFlipperFace(page)).toBe('front');

    await page.locator('#card').click();
    await expect.poll(() => readFlipperFace(page)).toBe('back');

    await page.locator('#card').click();
    await expect.poll(() => readFlipperFace(page)).toBe('front');
  });

  test('keyboard does not flip (click is the documented input)', async ({ page }) => {
    await page.locator('#card').focus();
    await page.keyboard.press('Enter');
    // No assertion on attribute change — we only assert that focusing + key
    // press does not silently flip. Spec is "click / tap" per AGENTS.md §5
    // Phase 3; keyboard activation is intentionally out of scope.
    expect(await readFlipperFace(page)).toBe('front');
  });
});
