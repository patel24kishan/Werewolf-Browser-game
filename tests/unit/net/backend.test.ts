import { afterEach, describe, expect, it, vi } from 'vitest';

const original = process.env.NEXT_PUBLIC_BACKEND;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_BACKEND;
  else process.env.NEXT_PUBLIC_BACKEND = original;
  vi.resetModules();
});

describe('getBackend', () => {
  it('throws a clear error until the Firebase backend exists', async () => {
    delete process.env.NEXT_PUBLIC_BACKEND;
    const { getBackend } = await import('@/net/backend');
    expect(() => getBackend()).toThrow('Firebase backend not configured yet');
  });

  it('returns one shared MemoryBackend in memory mode', async () => {
    process.env.NEXT_PUBLIC_BACKEND = 'memory';
    const { getBackend } = await import('@/net/backend');
    const { MemoryBackend } = await import('@/net/MemoryBackend');
    const backend = getBackend();
    try {
      expect(backend).toBeInstanceOf(MemoryBackend);
      expect(getBackend()).toBe(backend);
    } finally {
      await (backend as InstanceType<typeof MemoryBackend>).close();
    }
  });
});
