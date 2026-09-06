import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlaceSearch, SEARCH_DEBOUNCE_MS } from './usePlaceSearch';
import type { GeocodeResult } from './types';

/**
 * The asking half of both place searches in the product. The two components
 * built on it (MapSearch, AddressSearch) cover their own showing of the answer
 * through the DOM; what is pinned down here is the contract between them —
 * when a request goes out, when it doesn't, and what survives each of the
 * three ways of stopping one.
 *
 * Fake timers throughout, so "the debounce" is a fact rather than a wait.
 */
function makePlace(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return { lat: 35.0, lng: 135.78, label: 'Nanzen-ji', kind: 'attraction', placeId: '1', ...overrides };
}

/** Advance past the debounce and let the resolved promise chain settle. */
async function fireDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

describe('usePlaceSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks once, with the trimmed query, after the typing stops', async () => {
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('n'));
    act(() => result.current.search('na'));
    act(() => result.current.search('  nanzenji  '));
    expect(searchFn).not.toHaveBeenCalled();

    await fireDebounce();

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith('nanzenji', { signal: expect.any(AbortSignal) });
    expect(result.current.results).toEqual([makePlace()]);
    expect(result.current.searched).toBe(true);
    expect(result.current.searching).toBe(false);
  });

  it('asks nothing at all for an empty or whitespace-only query', async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('   '));
    await fireDebounce();

    expect(searchFn).not.toHaveBeenCalled();
    // Not "we asked and found none" — we never asked.
    expect(result.current.searched).toBe(false);
    expect(result.current.searching).toBe(false);
  });

  it('reads requestOptions when the search FIRES, not when it was asked for', async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    let viewbox = { north: 1, south: 0, east: 1, west: 0 };
    const { result, rerender } = renderHook(() =>
      usePlaceSearch({ searchFn, requestOptions: () => ({ viewbox }) }),
    );

    act(() => result.current.search('nanzenji'));
    // The map moved during the pause — the request must follow it.
    viewbox = { north: 9, south: 8, east: 9, west: 8 };
    rerender();
    await fireDebounce();

    expect(searchFn.mock.calls[0]![1]).toMatchObject({ viewbox: { north: 9, south: 8, east: 9, west: 8 } });
  });

  it('absorbs a rejecting provider as an empty answer, flagged unreachable', async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error('nominatim is down'));
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();

    expect(result.current.searched).toBe(true);
    expect(result.current.results).toEqual([]);
    expect(result.current.searching).toBe(false);
    expect(result.current.unreachable).toBe(true);
  });

  // The distinction the flag exists for: both leave `results` empty, and only
  // one of them is evidence that there is no such place.
  it('a search that ran and matched nothing is not unreachable', async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();

    expect(result.current.searched).toBe(true);
    expect(result.current.unreachable).toBe(false);
  });

  it('clears the unreachable flag as soon as the next search is asked for', async () => {
    const searchFn = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([makePlace()]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();
    expect(result.current.unreachable).toBe(true);

    act(() => result.current.search('nanzenji temple'));
    expect(result.current.unreachable).toBe(false);

    await fireDebounce();
    expect(result.current.unreachable).toBe(false);
    expect(result.current.results).toEqual([makePlace()]);
  });

  it('does not report an abort as an unreachable provider', async () => {
    let reject: (reason: unknown) => void = () => {};
    const searchFn = vi.fn().mockImplementation(() => new Promise<GeocodeResult[]>((_, r) => (reject = r)));
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();
    act(() => result.current.cancel());

    // An abort rejects the request like any other failure. It is ours, though.
    await act(async () => {
      reject(new DOMException('aborted', 'AbortError'));
    });

    expect(result.current.unreachable).toBe(false);
    expect(result.current.searched).toBe(false);
  });

  it('never lets a superseded answer overwrite the one that replaced it', async () => {
    const slow = makePlace({ label: 'Slow', placeId: 'slow' });
    const fast = makePlace({ label: 'Fast', placeId: 'fast' });
    let releaseSlow: (value: GeocodeResult[]) => void = () => {};
    const searchFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise<GeocodeResult[]>((resolve) => (releaseSlow = resolve)))
      .mockResolvedValueOnce([fast]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('slow'));
    await fireDebounce();
    act(() => result.current.search('fast'));
    await fireDebounce();
    expect(result.current.results).toEqual([fast]);

    // The first request finally answers, long after it stopped being the question.
    await act(async () => {
      releaseSlow([slow]);
    });

    expect(result.current.results).toEqual([fast]);
  });

  it('cancel puts the spinner away and keeps the answers already found', async () => {
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();
    expect(result.current.results).toHaveLength(1);

    act(() => result.current.cancel());

    expect(result.current.results).toEqual([makePlace()]);
    expect(result.current.searched).toBe(true);
    expect(result.current.searching).toBe(false);
  });

  it('cancel discards an answer still in flight instead of letting it land', async () => {
    let release: (value: GeocodeResult[]) => void = () => {};
    const searchFn = vi.fn().mockImplementation(() => new Promise<GeocodeResult[]>((r) => (release = r)));
    const onResults = vi.fn();
    const { result } = renderHook(() => usePlaceSearch({ searchFn, onResults }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();
    act(() => result.current.cancel());

    await act(async () => {
      release([makePlace()]);
    });

    expect(result.current.results).toEqual([]);
    expect(onResults).not.toHaveBeenCalled();
  });

  it('cancel before the debounce fires means no request at all', async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    act(() => result.current.cancel());
    await fireDebounce();

    expect(searchFn).not.toHaveBeenCalled();
  });

  it('clear throws the answers away too', async () => {
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const { result } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();
    expect(result.current.results).toHaveLength(1);

    act(() => result.current.clear());

    expect(result.current.results).toEqual([]);
    expect(result.current.searched).toBe(false);
    expect(result.current.searching).toBe(false);
  });

  it('calls onResults with the answer that landed, once', async () => {
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const onResults = vi.fn();
    const { result } = renderHook(() => usePlaceSearch({ searchFn, onResults }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();

    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledWith([makePlace()]);
  });

  it('hands back the same actions every render, so an effect may depend on them', () => {
    const { result, rerender } = renderHook(() => usePlaceSearch({ searchFn: vi.fn() }));
    const first = result.current;

    rerender();

    expect(result.current.search).toBe(first.search);
    expect(result.current.cancel).toBe(first.cancel);
    expect(result.current.clear).toBe(first.clear);
  });

  it('aborts a request still in flight when the caller unmounts', async () => {
    let seenSignal: AbortSignal | undefined;
    const searchFn = vi.fn().mockImplementation((_q: string, options?: { signal?: AbortSignal }) => {
      seenSignal = options?.signal;
      return new Promise<GeocodeResult[]>(() => {});
    });
    const { result, unmount } = renderHook(() => usePlaceSearch({ searchFn }));

    act(() => result.current.search('nanzenji'));
    await fireDebounce();
    expect(seenSignal?.aborted).toBe(false);

    unmount();

    expect(seenSignal?.aborted).toBe(true);
  });
});
