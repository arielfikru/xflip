import { expect, test } from '@playwright/test';

test.describe('<xflip-card> load lifecycle', () => {
  test('fires xflip-load and renders front face by default', async ({ page }) => {
    await page.goto('/?kind=flat');

    await page.waitForFunction(() =>
      Boolean((window as unknown as { __xflipReady?: Promise<unknown> }).__xflipReady),
    );
    const detail = await page.evaluate(async () => {
      const ready = (
        window as unknown as {
          __xflipReady: Promise<{ file: { versionMajor: number; versionMinor: number } }>;
        }
      ).__xflipReady;
      const d = await ready;
      return { major: d.file.versionMajor, minor: d.file.versionMinor };
    });
    expect(detail).toEqual({ major: 1, minor: 0 });

    const face = await page.evaluate(() => {
      const card = document.getElementById('card') as HTMLElement & { face: string };
      return card.face;
    });
    expect(face).toBe('front');

    const flipperFace = await page.evaluate(() => {
      const card = document.getElementById('card') as HTMLElement;
      const flipper = card.shadowRoot?.querySelector('.flipper') as HTMLElement | null;
      return flipper?.dataset.face ?? null;
    });
    expect(flipperFace).toBe('front');
  });

  test('layered file exposes hEfx CSS vars on host', async ({ page }) => {
    await page.goto('/?kind=layered');
    await page.evaluate(async () => {
      await (window as unknown as { __xflipReady: Promise<unknown> }).__xflipReady;
    });

    const vars = await page.evaluate(() => {
      const card = document.getElementById('card') as HTMLElement;
      const style = card.style;
      return {
        sensitivity: style.getPropertyValue('--xflip-tilt-sensitivity'),
        maxAngle: style.getPropertyValue('--xflip-tilt-max-angle'),
        perspective: style.getPropertyValue('--xflip-perspective'),
        ambient: style.getPropertyValue('--xflip-ambient-intensity'),
      };
    });

    expect(vars.sensitivity).toBe('1.2');
    expect(vars.maxAngle).toBe('12deg');
    expect(vars.perspective).toBe('1000px');
    expect(vars.ambient).toBe('0.4');
  });
});
