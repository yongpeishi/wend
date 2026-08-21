import { useEffect, useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Field } from '../../components/Field';
import { Card } from '../../components/layout/Card';
import { Row, Stack } from '../../components/layout/Stack';
import { PlaceSearch } from './PlaceSearch';
import type { GeocodeResult } from './types';
import styles from './AddPlaceForm.module.css';

export interface AddPlaceFormProps {
  /** Set when the user clicked the map directly — the manual, geocode-free path. */
  clickedLocation: { lat: number; lng: number } | null;
  onSave: (data: { title: string; lat: number; lng: number;}) => void;
  onCancel: () => void;
  /** Lets the caller draw a pending marker on the map as a location is chosen, before it's saved. */
  onChosenLocationChange?: (location: { lat: number; lng: number } | null) => void;
  saving?: boolean;
}

/**
 * Capturing a located idea, all three first-class paths at once: search a
 * place, click the map, or paste "lat, lng" into the search box. None of
 * them blocks the others — whichever lands a lat/lng first just needs a
 * title to become a real entry.
 */
export function AddPlaceForm({ clickedLocation, onSave, onCancel, onChosenLocationChange, saving = false }: AddPlaceFormProps) {
  const [chosen, setChosen] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!clickedLocation) return;
    setChosen({ ...clickedLocation, label: '' });
    onChosenLocationChange?.(clickedLocation);
    // Only the coordinates identify a new click — onChosenLocationChange is stable enough in practice
    // and re-running this on every parent render would fight the user's own typing below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickedLocation?.lat, clickedLocation?.lng]);

  function pick(result: GeocodeResult) {
    setChosen(result);
    setTitle((current) => current || (result.label.split(',')[0] ?? result.label));
    onChosenLocationChange?.({ lat: result.lat, lng: result.lng });
  }

  function save() {
    const trimmedTitle = title.trim();
    if (!chosen || !trimmedTitle) return;
    onSave({ title: trimmedTitle, lat: chosen.lat, lng: chosen.lng});
  }

  return (
    <Card padding={4} bordered className={styles.form}>
      <p className={styles.heading}>Add a place</p>
      <PlaceSearch onPick={pick} />
      <p className={styles.orHint}>Or click anywhere on the map to drop a pin there instead.</p>

      {chosen && (
        <Stack gap={2}>
          <Field
            label="What is it?"
            placeholder="Name this idea"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <Row gap={2}>
            <Button onClick={save} disabled={!title.trim() || saving}>
              Add to the trip
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          </Row>
        </Stack>
      )}

      {!chosen && (
        <Row gap={2} justify="end">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        </Row>
      )}
    </Card>
  );
}
