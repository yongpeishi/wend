import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { joinMeta } from '../../lib/formatDates';
import type { Entry } from '../../api/types';
import type { GeocodeResult } from './types';
import styles from './PlacePreviewCard.module.css';

export interface PlacePreviewCardProps {
  place: GeocodeResult;
  /** Set → the duplicate state: the idea already on the map at this spot. */
  duplicate?: { idea: Entry };
  /** Bundles, for the Add-to-a-plan popover. */
  plans: Entry[];
  /** Disables the create actions while a create is in flight. */
  busy?: boolean;
  canEdit: boolean;
  onAddAsIdea: () => void;
  onAddToPlan: (planId: number) => void;
  onShowInList: () => void;
  onKeepSeparately: () => void;
  onDismiss: () => void;
}

/**
 * The short name a geocoder result leads with — Nominatim's display_name is
 * "Name, street, town, …", and the card's strong line wants the name while the
 * meta line carries the full label as the address.
 */
function placeName(label: string): string {
  const first = label.split(',')[0].trim();
  return first !== '' ? first : label;
}

/**
 * Preview for a picked place (the parent positions it over the map). Two
 * states: the normal "not yours yet" card offering the capture paths, and the
 * duplicate card — jade chip, "kept already" meta — steering you back to what
 * the map already holds without ever blocking "Keep separately".
 */
export function PlacePreviewCard({
  place,
  duplicate,
  plans,
  busy = false,
  canEdit,
  onAddAsIdea,
  onAddToPlan,
  onShowInList,
  onKeepSeparately,
  onDismiss,
}: PlacePreviewCardProps) {
  const [plansOpen, setPlansOpen] = useState(false);

  const votes = duplicate?.idea.vote_tally.total ?? 0;
  const keptClause = duplicate ? (votes !== 0 ? `kept already, ▲${votes} keen` : 'kept already') : null;
  const meta = joinMeta(place.label, place.kind, keptClause);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <p className={styles.name}>{placeName(place.label)}</p>
        {duplicate && <span className={styles.duplicateChip}>already on your map</span>}
      </div>

      <p className={styles.meta}>{meta}</p>

      {duplicate ? (
        <div className={styles.actions}>
          <Button variant="primary" size="small" disabled={busy} onClick={onShowInList}>
            Show in list
          </Button>
          {canEdit && (
            <Button variant="quiet" size="small" disabled={busy} onClick={onKeepSeparately}>
              Keep separately
            </Button>
          )}
          <button type="button" className={styles.dismiss} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      ) : (
        <>
          {canEdit && (
            <p className={styles.hint}>
              Adding keeps the name and the address. Category, notes and who is keen can wait.
            </p>
          )}
          <div className={styles.actions}>
            {canEdit && (
              <>
                <Button variant="primary" size="small" disabled={busy} onClick={onAddAsIdea}>
                  Add as idea
                </Button>
                <div className={styles.planWrap}>
                  <Button
                    variant="quiet"
                    size="small"
                    disabled={busy}
                    aria-haspopup="true"
                    aria-expanded={plansOpen}
                    onClick={() => setPlansOpen((open) => !open)}
                  >
                    Add to a plan
                  </Button>
                  {plansOpen && (
                    <div className={styles.planPopover}>
                      {plans.length === 0 ? (
                        <p className={styles.planEmpty}>No plans yet.</p>
                      ) : (
                        <ul className={styles.planList}>
                          {plans.map((plan) => (
                            <li key={plan.id}>
                              <button
                                type="button"
                                className={styles.planRow}
                                disabled={busy}
                                onClick={() => {
                                  setPlansOpen(false);
                                  onAddToPlan(plan.id);
                                }}
                              >
                                {plan.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            <button type="button" className={styles.dismiss} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
