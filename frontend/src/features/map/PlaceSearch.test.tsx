import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlaceSearch } from './PlaceSearch';

describe('PlaceSearch', () => {
  it('debounces typed text into one search call and lets you pick a result', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([{ lat: 35.0116, lng: 135.7681, label: 'Nanzen-ji, Kyoto' }]);
    const onPick = vi.fn();

    render(<PlaceSearch onPick={onPick} searchFn={searchFn} />);
    await user.type(screen.getByRole('textbox'), 'nanzenji');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    expect(searchFn).toHaveBeenCalledWith('nanzenji', expect.anything());

    const result = await screen.findByRole('button', { name: 'Nanzen-ji, Kyoto' });
    await user.click(result);
    expect(onPick).toHaveBeenCalledWith({ lat: 35.0116, lng: 135.7681, label: 'Nanzen-ji, Kyoto' });
  });

  it('never blocks capturing an idea when geocoding returns nothing — offers the manual path instead', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    const onPick = vi.fn();

    render(<PlaceSearch onPick={onPick} searchFn={searchFn} />);
    await user.type(screen.getByRole('textbox'), 'a place nobody has mapped');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    // The empty result is stated plainly, and points at the way to proceed anyway.
    expect(await screen.findByText(/No matches\. Paste coordinates instead, or drop a pin/)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('recognises a pasted "lat, lng" pair as its own first-class path — no geocoding at all', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    const onPick = vi.fn();

    render(<PlaceSearch onPick={onPick} searchFn={searchFn} />);
    await user.type(screen.getByRole('textbox'), '35.0116, 135.7681');

    const useButton = await screen.findByRole('button', { name: 'Use these coordinates' });
    await user.click(useButton);

    expect(onPick).toHaveBeenCalledWith({ lat: 35.0116, lng: 135.7681, label: '35.0116, 135.7681' });
    // Waiting past the debounce window confirms search was genuinely skipped, not just not-yet-fired.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('never throws or shows an error state when the geocode call itself rejects', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const onPick = vi.fn();

    render(<PlaceSearch onPick={onPick} searchFn={searchFn} />);
    await user.type(screen.getByRole('textbox'), 'somewhere remote');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    // The component itself must not crash on a rejected promise — no results, no error text required here,
    // just a component that's still there and still usable.
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });
});
