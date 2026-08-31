import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistedFlag } from './usePersistedFlag';

const KEY = 'wend.test.flag';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('usePersistedFlag', () => {
  it('uses the default when storage is empty', () => {
    const { result } = renderHook(() => usePersistedFlag(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it("reads a stored 'true'", () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => usePersistedFlag(KEY, false));
    expect(result.current[0]).toBe(true);
  });

  it("reads a stored 'false'", () => {
    localStorage.setItem(KEY, 'false');
    const { result } = renderHook(() => usePersistedFlag(KEY, true));
    expect(result.current[0]).toBe(false);
  });

  it('falls back to the default on a garbage value', () => {
    localStorage.setItem(KEY, 'maybe');
    const { result } = renderHook(() => usePersistedFlag(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it('toggle flips the value and writes it back', () => {
    const { result } = renderHook(() => usePersistedFlag(KEY, false));

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('falls back to the default when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const { result } = renderHook(() => usePersistedFlag(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it('still flips state when writing to storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    const { result } = renderHook(() => usePersistedFlag(KEY, false));

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });
});
