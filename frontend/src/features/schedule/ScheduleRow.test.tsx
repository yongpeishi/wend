import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlanRow } from './dayPlan';
import { ScheduleRow } from './ScheduleRow';
import styles from './ScheduleRow.module.css';

function planRow(over: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 1,
    time: '13:00–15:40',
    dur: '2 hr 40 min',
    title: 'Fushimi Inari',
    meta: 'sight · Fushimi',
    state: 'upcoming',
    tone: 'decided',
    entryId: 7,
    bundleId: null,
    chosenEntryId: null,
    startsAtMinutes: 780,
    endsAtMinutes: 940,
    ...over,
  };
}

/** The dot carries no text and no role — it is decoration, and the only thing
 *  worth asserting about it is which of the five marks was drawn. */
function dot(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>(`.${styles.dot}`);
  if (!found) throw new Error('no dot rendered');
  return found;
}

describe('ScheduleRow', () => {
  it('prints the four already-formatted fields as they arrive', () => {
    render(<ScheduleRow row={planRow()} />);
    expect(screen.getByText('13:00–15:40')).toBeInTheDocument();
    expect(screen.getByText('2 hr 40 min')).toBeInTheDocument();
    expect(screen.getByText('Fushimi Inari')).toBeInTheDocument();
    expect(screen.getByText('sight · Fushimi')).toBeInTheDocument();
  });

  it('says an upcoming row’s state with nothing at all', () => {
    const { container } = render(<ScheduleRow row={planRow({ state: 'upcoming' })} />);
    expect(container.querySelector(`.${styles.srOnly}`)).toBeNull();
    expect(dot(container)).toHaveClass(styles.dotDecided);
  });

  it('says "done" behind you, and steps the time back', () => {
    const { container } = render(<ScheduleRow row={planRow({ state: 'past' })} />);
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('13:00–15:40')).toHaveClass(styles.timePast);
    expect(dot(container)).toHaveClass(styles.dotDecided);
  });

  it('says "now" for the row you are standing in, and draws the apricot halo', () => {
    const { container } = render(<ScheduleRow row={planRow({ state: 'now' })} />);
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText('13:00–15:40')).not.toHaveClass(styles.timePast);
    expect(dot(container)).toHaveClass(styles.dotNow);
  });

  it('says "not decided" for an open choice, and draws the ring', () => {
    const { container } = render(
      <ScheduleRow row={planRow({ state: 'open', dur: 'open', time: '', bundleId: 3 })} />,
    );
    expect(screen.getByText('not decided')).toBeInTheDocument();
    expect(dot(container)).toHaveClass(styles.dotOpen);
  });

  // 'open' and 'now' are drawn by the question and the clock; the tone only
  // colours the stops the clock has no opinion about.
  it('takes the dot colour from the tone when the state does not claim it', () => {
    const waiting = render(<ScheduleRow row={planRow({ tone: 'waiting', dur: 'transport' })} />);
    expect(dot(waiting.container)).toHaveClass(styles.dotWaiting);
    waiting.unmount();

    const bed = render(<ScheduleRow row={planRow({ tone: 'destination' })} />);
    expect(dot(bed.container)).toHaveClass(styles.dotDestination);
    bed.unmount();

    const openBed = render(<ScheduleRow row={planRow({ tone: 'destination', state: 'open' })} />);
    expect(dot(openBed.container)).toHaveClass(styles.dotOpen);
    expect(dot(openBed.container)).not.toHaveClass(styles.dotDestination);
  });

  it('leaves out an empty time, duration or meta rather than drawing an empty line', () => {
    const { container } = render(<ScheduleRow row={planRow({ time: '', dur: '', meta: '' })} />);
    expect(container.querySelector(`.${styles.time}`)).toBeNull();
    expect(container.querySelector(`.${styles.dur}`)).toBeNull();
    expect(container.querySelector(`.${styles.meta}`)).toBeNull();
    expect(screen.getByText('Fushimi Inari')).toBeInTheDocument();
  });

  // With no time, no duration and no state word there is nothing for the clock
  // cell to hold, so it goes too and the title rides up beside the dot.
  it('drops the whole clock cell when it would be empty, but keeps it for the state word', () => {
    const bare = render(<ScheduleRow row={planRow({ time: '', dur: '', state: 'upcoming' })} />);
    expect(bare.container.querySelector(`.${styles.when}`)).toBeNull();
    bare.unmount();

    const open = render(<ScheduleRow row={planRow({ time: '', dur: '', state: 'open' })} />);
    expect(open.container.querySelector(`.${styles.when}`)).not.toBeNull();
    expect(screen.getByText('not decided')).toBeInTheDocument();
  });

  it('renders the caller’s options under the meta line', () => {
    render(<ScheduleRow row={planRow()} options={<button type="button">Kiyamachi</button>} />);
    expect(screen.getByRole('button', { name: 'Kiyamachi' })).toBeInTheDocument();
  });

  // jsdom evaluates no media queries, so this pins the markup the two layouts
  // share — one row, one of every string — not that the 861px rule fires.
  it('draws one row of markup for both widths, never two', () => {
    const { container } = render(<ScheduleRow row={planRow()} />);
    expect(container.querySelectorAll(`.${styles.row}`)).toHaveLength(1);
    expect(screen.getAllByText('Fushimi Inari')).toHaveLength(1);
  });
});
