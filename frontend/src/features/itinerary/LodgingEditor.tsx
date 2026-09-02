import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Chip } from '../../design/components/core/Chip';
import { Input } from '../../design/components/core/Input';
import { CloseButton } from '../../components/CloseButton';
import type { EntrySummary } from '../../api/types';
import styles from './LodgingEditor.module.css';

/** What the day currently sleeps at, in the two forms the row can hold. */
export interface LodgingValue {
  entryId: number | null;
  label: string | null;
}

export interface LodgingEditorProps {
  /** Kept places to choose from — the trip's lodging entries. */
  choices: EntrySummary[];
  current: LodgingValue | null;
  onPick: (entryId: number) => void;
  onClear: () => void;
  onFreeText: (label: string) => void;
  onClose?: () => void;
}

/**
 * "Same as last night" is offered as words, not as a reference. Resolving it to
 * the previous day's lodging is explicitly out of scope (contract §6), and a
 * label that says what you mean is honest — where a stored pointer that quietly
 * followed a change you made three days later would not be.
 */
const SAME_AS_LAST_NIGHT = 'Same as last night';

/**
 * The panel behind the lodging pill: kept places as chips, or your own words.
 * Free text is a first-class answer — "Sleeping on the plane" is a real answer
 * to where you sleep, and a picker that only accepted saved places would make
 * you invent an entry to record a night bus.
 */
export function LodgingEditor({ choices, current, onPick, onClear, onFreeText, onClose }: LodgingEditorProps) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const isSet = Boolean(current?.entryId || current?.label);

  return (
    <div
      className={styles.editor}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !onClose) return;
        event.stopPropagation();
        onClose();
      }}
    >
      {/* Only when there is somewhere to go back to — the same condition
          Escape answers to, so the X never promises a way out Escape lacks. */}
      {onClose && <CloseButton onClick={onClose} />}
      <p className={styles.title}>Kept places, or your own words</p>

      <div className={styles.choices}>
        {choices.map((choice) => (
          <Chip key={choice.id} selected={current?.entryId === choice.id} onClick={() => onPick(choice.id)}>
            {choice.title}
          </Chip>
        ))}

        <Chip
          selected={current?.label === SAME_AS_LAST_NIGHT}
          onClick={() => onFreeText(SAME_AS_LAST_NIGHT)}
        >
          {SAME_AS_LAST_NIGHT}
        </Chip>

        {isSet && (
          <Button size="small" variant="quiet" onClick={onClear}>
            Clear it
          </Button>
        )}
      </div>

      <Input
        className={styles.freeText}
        value={text}
        placeholder="Or type it — night bus, a friend's sofa"
        aria-label="Where you sleep, in your own words"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !trimmed) return;
          event.preventDefault();
          onFreeText(trimmed);
          setText('');
        }}
      />

      <Button
        size="small"
        className={styles.save}
        disabled={!trimmed}
        onClick={() => {
          onFreeText(trimmed);
          setText('');
        }}
      >
        Use what I wrote
      </Button>
    </div>
  );
}
