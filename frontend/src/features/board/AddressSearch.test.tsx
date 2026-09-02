import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddressSearch } from './AddressSearch';
import type { AddressSearchProps } from './AddressSearch';
import type { GeocodeResult } from '../map/types';

function makePlace(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return {
    lat: 35.0116,
    lng: 135.7681,
    label: 'Nanzen-ji, Kyoto, Japan',
    kind: 'attraction',
    placeId: '101',
    ...overrides,
  };
}

type SearchFn = NonNullable<AddressSearchProps['searchFn']>;

interface HarnessProps {
  initialValue?: string;
  searchFn: SearchFn;
  onPick?: (place: GeocodeResult) => void;
  onChange?: (text: string) => void;
  /** A keydown spy on the wrapper — what Escape does or does not reach. */
  onWrapperKeyDown?: (key: string) => void;
}

/**
 * The component is controlled from above, so a test needs a parent that owns
 * the text the way the composer will — otherwise user.type would write into a
 * field whose value never changes. The harness also mirrors the composer's
 * likely pick behaviour (adopt the label) so the assertions read naturally.
 */
function Harness({ initialValue = '', searchFn, onPick, onChange, onWrapperKeyDown }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <div onKeyDown={(event) => onWrapperKeyDown?.(event.key)}>
      <AddressSearch
        value={value}
        onChange={(text) => {
          setValue(text);
          onChange?.(text);
        }}
        onPick={(place) => {
          setValue(place.label);
          onPick?.(place);
        }}
        searchFn={searchFn}
      />
    </div>
  );
}

function field() {
  return screen.getByRole('combobox', { name: 'Address' });
}

describe('AddressSearch', () => {
  it('renders the controlled value under the default accessible name', () => {
    render(<Harness initialValue="Kyoto" searchFn={vi.fn().mockResolvedValue([])} />);

    const input = field();
    expect(input).toHaveValue('Kyoto');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('takes a custom accessible name and input class', () => {
    render(
      <AddressSearch
        value=""
        onChange={() => undefined}
        onPick={() => undefined}
        aria-label="Where"
        inputClassName="composer-input"
        searchFn={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Where' })).toHaveClass('composer-input');
  });

  it('reports every keystroke to the parent', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness searchFn={vi.fn().mockResolvedValue([])} onChange={onChange} />);

    await user.type(field(), 'abc');

    expect(onChange.mock.calls.map(([text]) => text)).toEqual(['a', 'ab', 'abc']);
  });

  it('debounces typed text into ONE search with the trimmed text', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), '  nanzenji  ');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    expect(searchFn).toHaveBeenCalledWith('nanzenji', { signal: expect.any(AbortSignal) });
  });

  it('lists results as options with the label and the kind as a meta line', async () => {
    const user = userEvent.setup();
    const searchFn = vi
      .fn()
      .mockResolvedValue([makePlace(), makePlace({ label: 'Nanzen-ji Station', kind: undefined, placeId: '102' })]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nanzen');

    const listbox = await screen.findByRole('listbox');
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(field()).toHaveAttribute('aria-controls', listbox.id);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Nanzen-ji, Kyoto, Japan');
    expect(options[0]).toHaveTextContent('attraction');
    expect(options[1]).toHaveTextContent('Nanzen-ji Station');
    expect(options[1]).not.toHaveTextContent('attraction');
  });

  it('shows at most five rows even when the search returns more', async () => {
    const user = userEvent.setup();
    const searchFn = vi
      .fn()
      .mockResolvedValue([1, 2, 3, 4, 5, 6].map((n) => makePlace({ label: `Place ${n}`, lat: n, placeId: `${n}` })));
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'place');

    await screen.findByRole('listbox');
    expect(screen.getAllByRole('option')).toHaveLength(5);
    expect(screen.queryByRole('option', { name: /Place 6/ })).not.toBeInTheDocument();
  });

  it('ArrowDown highlights a row and Enter picks it with the exact GeocodeResult, then closes the list', async () => {
    const user = userEvent.setup();
    const first = makePlace();
    const second = makePlace({ label: 'Nanzen-ji Station', placeId: '102' });
    const searchFn = vi.fn().mockResolvedValue([first, second]);
    const onPick = vi.fn();
    render(<Harness searchFn={searchFn} onPick={onPick} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(field()).toHaveAttribute('aria-activedescendant', options[0]!.id);

    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    await user.keyboard('{Enter}');

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(second);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(field()).toHaveValue('Nanzen-ji Station');
  });

  it('wraps the highlight around in both directions', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace(), makePlace({ label: 'Second', placeId: '2' })]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');

    // Up from nothing lands on the last row; down from the last wraps to the first.
    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter with no highlighted row is left alone for the parent', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const onPick = vi.fn();
    const onWrapperKeyDown = vi.fn();
    render(<Harness searchFn={searchFn} onPick={onPick} onWrapperKeyDown={onWrapperKeyDown} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');

    await user.keyboard('{Enter}');

    expect(onPick).not.toHaveBeenCalled();
    expect(onWrapperKeyDown).toHaveBeenCalledWith('Enter');
    // The list is still there — Enter did not pick, so it did not close.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('clicking an option picks it', async () => {
    const user = userEvent.setup();
    const place = makePlace();
    const searchFn = vi.fn().mockResolvedValue([place]);
    const onPick = vi.fn();
    render(<Harness searchFn={searchFn} onPick={onPick} />);

    await user.type(field(), 'nanzen');
    await user.click(await screen.findByRole('option', { name: /Nanzen-ji, Kyoto, Japan/ }));

    expect(onPick).toHaveBeenCalledWith(place);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape with the list open closes it, keeps the text, and does not reach the parent', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const onWrapperKeyDown = vi.fn();
    render(<Harness searchFn={searchFn} onWrapperKeyDown={onWrapperKeyDown} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field()).toHaveValue('nanzen');
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(onWrapperKeyDown).not.toHaveBeenCalledWith('Escape');
  });

  it('Escape with the list closed reaches the parent untouched', async () => {
    const user = userEvent.setup();
    const onWrapperKeyDown = vi.fn();
    render(<Harness initialValue="Kyoto" searchFn={vi.fn().mockResolvedValue([])} onWrapperKeyDown={onWrapperKeyDown} />);

    await user.click(field());
    await user.keyboard('{Escape}');

    expect(onWrapperKeyDown).toHaveBeenCalledWith('Escape');
  });

  it('ArrowDown after Escape reopens the list without a second search', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp after Escape reopens the list on the LAST row', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace(), makePlace({ label: 'Second', placeId: '2' })]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.keyboard('{ArrowUp}');

    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(field()).toHaveAttribute('aria-activedescendant', options[1]!.id);
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('shows the searching spinner while a request is in flight and clears it when the answer lands', async () => {
    const user = userEvent.setup();
    let resolve: (found: GeocodeResult[]) => void = () => undefined;
    const searchFn = vi.fn(
      () =>
        new Promise<GeocodeResult[]>((res) => {
          resolve = res;
        }),
    );
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nanzen');

    expect(await screen.findByRole('status')).toHaveTextContent('Searching');
    resolve([makePlace()]);

    await screen.findByRole('listbox');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows "No match — kept as typed." after an empty answer, and keeps the text', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nowhere at all');

    expect(await screen.findByText('No match — kept as typed.')).toBeInTheDocument();
    expect(field()).toHaveValue('nowhere at all');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('absorbs a rejecting searchFn as "no match" instead of throwing', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockRejectedValue(new Error('network down'));
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'somewhere remote');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('No match — kept as typed.')).toBeInTheDocument();
    expect(field()).toHaveValue('somewhere remote');
  });

  it('a new keystroke clears the no-match line', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nowhere');
    await screen.findByText('No match — kept as typed.');

    await user.type(field(), 'x');

    expect(screen.queryByText('No match — kept as typed.')).not.toBeInTheDocument();
  });

  it('fires no search for an empty or whitespace-only query', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), '   ');
    // Longer than the debounce, so a scheduled search would have fired by now.
    await new Promise((res) => setTimeout(res, 500));

    expect(searchFn).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('emptying the field cancels the pending search', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'n');
    await user.clear(field());
    await new Promise((res) => setTimeout(res, 500));

    expect(searchFn).not.toHaveBeenCalled();
  });

  it('a stale response never overwrites the results of the newer search', async () => {
    const user = userEvent.setup();
    const pending: Array<{ query: string; resolve: (found: GeocodeResult[]) => void; signal?: AbortSignal }> = [];
    const searchFn = vi.fn(
      (query: string, options?: { signal?: AbortSignal }) =>
        new Promise<GeocodeResult[]>((resolve) => {
          pending.push({ query, resolve, signal: options?.signal });
        }),
    );
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'kyo');
    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));

    // The second burst of typing supersedes the first request while it is
    // still unanswered.
    await user.type(field(), 'to');
    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(2));
    expect(pending[0]!.signal?.aborted).toBe(true);

    pending[1]!.resolve([makePlace({ label: 'Kyoto, Japan', placeId: 'new' })]);
    expect(await screen.findByRole('option', { name: /Kyoto, Japan/ })).toBeInTheDocument();

    // The first answer arrives late — and must change nothing.
    pending[0]!.resolve([makePlace({ label: 'Kyō — stale', placeId: 'old' })]);
    await new Promise((res) => setTimeout(res, 0));

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Kyoto, Japan/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /stale/ })).not.toBeInTheDocument();
  });

  it('blur closes the list but keeps the text', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'nanzen');
    await screen.findByRole('listbox');

    await user.tab();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field()).toHaveValue('nanzen');
  });

  it('blur while a search is in flight discards its answer instead of opening the list', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    let resolve: (found: GeocodeResult[]) => void = () => undefined;
    const searchFn = vi.fn(
      (_query: string, options?: { signal?: AbortSignal }) =>
        new Promise<GeocodeResult[]>((res) => {
          signal = options?.signal;
          resolve = res;
        }),
    );
    render(<Harness searchFn={searchFn} />);

    await user.type(field(), 'fushimi');
    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));

    // Tab away — to a category pill, say — before the geocoder has answered.
    await user.tab();
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // The answer arrives late, under a field nobody is in — and must change nothing.
    resolve([makePlace({ label: 'Fushimi Inari-taisha' })]);
    await new Promise((res) => setTimeout(res, 0));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(field()).toHaveValue('fushimi');
  });
});
