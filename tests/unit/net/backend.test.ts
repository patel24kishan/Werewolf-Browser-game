import { afterEach, describe, expect, it, vi } from 'vitest';

const original = process.env.NEXT_PUBLIC_BACKEND;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_BACKEND;
  else process.env.NEXT_PUBLIC_BACKEND = original;
  vi.resetModules();
});

describe('getBackend', () => {
  it('throws a clear error when Firebase is selected but not configured', async () => {
    delete process.env.NEXT_PUBLIC_BACKEND;
    const saved = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    try {
      const { getBackend } = await import('@/net/backend');
      expect(() => getBackend()).toThrow('Firebase is not configured');
    } finally {
      if (saved !== undefined) process.env.NEXT_PUBLIC_FIREBASE_API_KEY = saved;
    }
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
