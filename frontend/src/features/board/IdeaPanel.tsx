import type { ReactNode } from 'react';
import type { Entry } from '../../api/types';
import { useDeleteVote, useVote } from '../../api';
import { useToast } from '../../components/Toast';
import { IdeaTodos } from './IdeaTodos';
import { VoteBar } from './VoteBar';
import styles from './IdeaPanel.module.css';

/** The house sentence for a write that did not land. Same words everywhere. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

export interface IdeaPanelProps {
  entry: Entry;
  /**
   * May you change this trip? Governs the ballot and the to-do block; the
   * screen's own verbs govern themselves, in `actions`.
   */
  canEdit: boolean;
  /** The screen's own verbs, rendered after the to-dos. */
  actions?: ReactNode;
  /** For the disclosure's `aria-controls`, when a screen opens this panel. */
  id?: string;
  className?: string;
}

/**
 * The reading half of an open idea: its words, its ballot, its to-dos — and
 * then whatever verbs the screen showing it happens to have.
 *
 * Shared between the board row and the map's pin card, because an idea read on
 * the map must be the same idea read on the board: the same description, the
 * same vote bar wired to the same mutations, the same to-do list. Two copies of
 * this would be two chances to drift.
 *
 * The verbs are a SLOT rather than props, because they are the half that is
 * genuinely different per screen — the board offers "Add to plan / Add an idea
 * inside / Edit / Move to Set aside" and hangs an inline composer under them,
 * and the map has its own shorter set. A prop per verb would make this panel
 * carry every screen's vocabulary; a slot lets it carry none.
 *
 * The vote wiring lives HERE rather than above, unlike the verbs: voting is
 * part of reading an idea, it means the same thing on every screen, and the
 * optimistic write in `useVote`/`useDeleteVote` already keeps the whole cache
 * honest — so a screen that shows this panel gets working votes without
 * knowing there is a mutation involved.
 */
export function IdeaPanel({ entry, canEdit, actions, id, className }: IdeaPanelProps) {
  const { show } = useToast();
  const vote = useVote(entry.id);
  const deleteVote = useDeleteVote(entry.id);

  return (
    <div id={id} className={[styles.panel, className].filter(Boolean).join(' ')}>
      {/* The mockup has one `note`; our model splits the same idea into a
          description and private notes, and both are worth reading here.
          The notes are muted because they are the aside, not the pitch. */}
      {entry.description && <p className={styles.body}>{entry.description}</p>}
      {entry.notes && <p className={[styles.body, styles.notes].join(' ')}>{entry.notes}</p>}

      {/* Data tracking, because an address is read character by character. */}
      {entry.address && <p className={styles.address}>{entry.address}</p>}

      <VoteBar
        myVote={entry.my_vote}
        tally={entry.vote_tally}
        entryTitle={entry.title}
        canVote={canEdit}
        // The optimistic write lives in useVote/useDeleteVote, so the stop
        // fills before the request lands; all this has to do is stop taking
        // a second answer while the first is in the air.
        onVote={(score) => vote.mutate(score, { onError: () => show(SAVE_FAILED, 'error') })}
        onClear={() => deleteVote.mutate(undefined, { onError: () => show(SAVE_FAILED, 'error') })}
        disabled={vote.isPending || deleteVote.isPending}
      />

      <IdeaTodos entryId={entry.id} canEdit={canEdit} />

      {actions}
    </div>
  );
}
