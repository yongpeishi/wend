import { Trail } from '../design/components/brand/Trail';
import type { TrailStopState } from '../design/components/brand/Trail';

export const TRAIL_STEPS = ['brainstorm', 'gather', 'schedule'] as const;
export type TrailStep = (typeof TRAIL_STEPS)[number];

const STEP_LABELS: Record<TrailStep, string> = {
  brainstorm: 'Brainstorm',
  gather: 'Gather',
  schedule: 'Schedule',
};

export interface TrailNavProps {
  /** The step the trip is currently on — rendered with the apricot ring. */
  current: TrailStep;
  /** Omit to render a read-only trail (e.g. inside the design gallery). */
  onSelect?: (step: TrailStep) => void;
  onDark?: boolean;
}

/**
 * Wraps <Trail> as real trip navigation: Brainstorm -> Gather -> Schedule.
 * Steps before `current` are 'decided' (solid green, clickable — "selecting a
 * completed stop returns to that step with everything you kept"); `current` is
 * the apricot ring; steps after are 'waiting' and inert.
 */
export function TrailNav({ current, onSelect, onDark = false }: TrailNavProps) {
  const currentIndex = TRAIL_STEPS.indexOf(current);
  const stops: TrailStopState[] = TRAIL_STEPS.map((_, i) => {
    if (i < currentIndex) return 'decided';
    if (i === currentIndex) return 'open';
    return 'waiting';
  });
  const labels = TRAIL_STEPS.map((step) => STEP_LABELS[step]);

  return (
    <Trail
      stops={stops}
      labels={labels}
      onDark={onDark}
      onSelectStop={onSelect ? (index) => onSelect(TRAIL_STEPS[index] as TrailStep) : undefined}
      aria-label="Trip progress"
    />
  );
}
