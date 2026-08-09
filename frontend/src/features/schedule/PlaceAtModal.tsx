import { useState } from 'react';
import type { Entry } from '../../api/types';
import { useCreateScheduleItem } from '../../api';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Chip } from '../../design/components/core/Chip';
import { Button } from '../../design/components/core/Button';
import type { DayTab } from './scheduleModel';
import styles from './PlaceAtModal.module.css';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: string): number | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface PlaceAtModalProps {
  tripId: number;
  entry: Entry | null;
  /** The day tab active when the tray card's "Place at…" was tapped, or the
   * one a drag was dropped onto — preselected, but changeable. */
  defaultDay: string;
  days: DayTab[];
  onClose: () => void;
}

/**
 * The required non-drag path for placing an idea onto the schedule — a day
 * picker and a plain `HH:MM` time field. Also where a drag-drop lands, since
 * translating a finger position into an exact minute on a phone is fragile;
 * confirming the time here keeps one reliable code path for both.
 */
export function PlaceAtModal({ tripId, entry, defaultDay, days, onClose }: PlaceAtModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createItem = useCreateScheduleItem(tripId);
  const { show } = useToast();

  if (!entry) return null;

  const dayLabel = days.find((d) => d.day === day)?.label ?? day;

  async function handleSubmit() {
    const minutes = time.trim() === '' ? null : parseTime(time);
    if (time.trim() !== '' && minutes === null) {
      setError('Use 24-hour HH:MM, like 09:30.');
      return;
    }
    if (!entry) return;
    const endMinutes =
      minutes !== null && entry.duration_minutes ? minutes + entry.duration_minutes : null;
    try {
      await createItem.mutateAsync({
        entry_id: entry.id,
        day,
        starts_at_minutes: minutes,
        ends_at_minutes: endMinutes,
      });
      show(`Placed on ${dayLabel}.`, 'success');
      onClose();
    } catch {
      show("That didn't save. It's still here — try again.", 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Place "${entry.title}"`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={createItem.isPending}>
            Place it
          </Button>
        </>
      }
    >
      <div className={styles.dayPicker} role="group" aria-label="Day">
        {days.map((d) => (
          <Chip key={d.day} selected={d.day === day} onClick={() => setDay(d.day)}>
            {d.label}
          </Chip>
        ))}
      </div>
      <Field
        label="Time"
        hint="↵"
        placeholder="09:30"
        description="24-hour, e.g. 09:30. Leave blank to place it without a set time."
        error={error ?? undefined}
        value={time}
        onChange={(event) => {
          setError(null);
          setTime(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleSubmit();
        }}
      />
    </Modal>
  );
}
