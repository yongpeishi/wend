import { Button } from '../../design/components/core/Button';
import { Input } from '../../design/components/core/Input';
import styles from './DroppedPinCard.module.css';

export interface DroppedPinCardProps {
  /** 'New idea from the map' | `Putting {name} on the map`. */
  heading: string;
  name: string;
  /** True → a text input (labelled "Name"); false → the name as plain text. */
  nameEditable: boolean;
  onNameChange?: (value: string) => void;
  lat: number;
  lng: number;
  /** 'Add as idea' | 'Save the place'. */
  ctaLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * The card that confirms a pin dropped on the map — either naming a brand-new
 * idea, or placing one whose name is already settled. The coordinates are the
 * card's one hard fact, so they get the mono voice; the pin itself stays live
 * ("click again to move it") until the primary action commits it.
 */
export function DroppedPinCard({
  heading,
  name,
  nameEditable,
  onNameChange,
  lat,
  lng,
  ctaLabel,
  onConfirm,
  onCancel,
  busy = false,
}: DroppedPinCardProps) {
  return (
    <div className={styles.card}>
      <h3 className={styles.heading}>{heading}</h3>

      {nameEditable ? (
        <Input aria-label="Name" value={name} onChange={(e) => onNameChange?.(e.target.value)} />
      ) : (
        <p className={styles.name}>{name}</p>
      )}

      <div>
        <div className={styles.whereLabel}>Where</div>
        <p className={styles.coords}>{`${lat.toFixed(5)}, ${lng.toFixed(5)}`}</p>
        <p className={styles.hint}>click again to move it</p>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" size="small" disabled={busy || name.trim() === ''} onClick={onConfirm}>
          {ctaLabel}
        </Button>
        <Button variant="quiet" size="small" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
