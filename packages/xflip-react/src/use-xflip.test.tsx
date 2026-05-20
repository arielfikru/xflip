// @vitest-environment happy-dom

import { encode, type XflipFile } from '@xflip/core';
import { act, type ReactElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UseXflipResult, useXflip } from './use-xflip.js';

// React 18's `act` warns when global isn't set in a test environment.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeFileBytes(): Uint8Array {
  const file: XflipFile = {
    versionMajor: 1,
    versionMinor: 0,
    head: {
      width: 100,
      height: 140,
      frontFormat: 'png',
      backFormat: 'png',
      flipAxis: 'horizontal',
      flags: 0,
    },
    front: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    back: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };
  return encode(file);
}

function mockFetchOk(bytes: Uint8Array): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      init?.signal?.throwIfAborted?.();
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    }),
  );
}

function mockFetchHttpError(status: number, statusText: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status,
      statusText,
      arrayBuffer: async () => new ArrayBuffer(0),
    })),
  );
}

function mockFetchReject(reason: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw reason;
    }),
  );
}

function mockFetchHang(onAbort?: () => void): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          onAbort?.();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }),
  );
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.unstubAllGlobals();
  container.remove();
});

async function captureState(initialSrc: string | undefined): Promise<{
  rerender: (src: string | undefined) => Promise<void>;
  states: UseXflipResult[];
}> {
  const states: UseXflipResult[] = [];
  function Probe({ src }: { src: string | undefined }): ReactElement | null {
    const result = useXflip(src);
    useEffect(() => {
      states.push(result);
    });
    return null;
  }
  async function render(src: string | undefined): Promise<void> {
    await act(async () => {
      root.render(<Probe src={src} />);
    });
  }
  await render(initialSrc);
  return { rerender: render, states };
}

async function waitFor(
  predicate: () => boolean,
  describe = 'condition',
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timeout: ${describe}`);
    }
    // Let pending promises and React renders flush.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

describe('useXflip', () => {
  it('is idle when src is undefined', async () => {
    const { states } = await captureState(undefined);
    expect(states[0]).toEqual({ file: null, error: null, status: 'idle' });
  });

  it('transitions loading → success with the decoded file', async () => {
    mockFetchOk(makeFileBytes());
    const { states } = await captureState('/a.xflip');
    await waitFor(() => states.some((s) => s.status === 'success'), 'success');
    expect(states.some((s) => s.status === 'loading')).toBe(true);
    const last = states[states.length - 1];
    expect(last?.status).toBe('success');
    expect(last?.file?.versionMajor).toBe(1);
    expect(last?.file?.versionMinor).toBe(0);
    expect(last?.error).toBeNull();
  });

  it('reports HTTP errors via status="error"', async () => {
    mockFetchHttpError(404, 'Not Found');
    const { states } = await captureState('/missing.xflip');
    await waitFor(() => states.some((s) => s.status === 'error'), 'error');
    const last = states[states.length - 1];
    expect(last?.status).toBe('error');
    expect(last?.file).toBeNull();
    expect(last?.error?.message).toContain('404');
    expect(last?.error?.message).toContain('Not Found');
  });

  it('reports decode failures via status="error"', async () => {
    mockFetchOk(new Uint8Array([0, 1, 2, 3]));
    const { states } = await captureState('/broken.xflip');
    await waitFor(() => states.some((s) => s.status === 'error'), 'error');
    const last = states[states.length - 1];
    expect(last?.status).toBe('error');
    expect(last?.error).toBeInstanceOf(Error);
  });

  it('wraps non-Error rejections into Error', async () => {
    mockFetchReject('string-reason');
    const { states } = await captureState('/x.xflip');
    await waitFor(() => states.some((s) => s.status === 'error'), 'error');
    const last = states[states.length - 1];
    expect(last?.error?.message).toBe('string-reason');
  });

  it('aborts the in-flight request when src changes', async () => {
    const aborted = vi.fn();
    mockFetchHang(aborted);
    const { rerender } = await captureState('/first.xflip');
    await rerender('/second.xflip');
    await waitFor(() => aborted.mock.calls.length > 0, 'aborted');
    expect(aborted).toHaveBeenCalled();
  });

  it('does not surface AbortError as status="error"', async () => {
    mockFetchHang();
    const { rerender, states } = await captureState('/first.xflip');
    await rerender(undefined);
    // Drain pending microtasks so any abort rejection settles.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(states.every((s) => s.status !== 'error')).toBe(true);
    expect(states[states.length - 1]?.status).toBe('idle');
  });
});
