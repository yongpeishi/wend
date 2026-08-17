import { useCallback, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { Button } from '../../design/components/core/Button';
import { Select } from '../../design/components/core/Select';
import { ApiError } from '../../api/client';
import {
  useAddCollaborator,
  useChangeCollaboratorRole,
  useCollaborators,
  useHandOverTrip,
  useRemoveCollaborator,
} from '../../api/collaborators';
import type { GrantableRole } from '../../api/collaborators';
import { canShare } from '../../auth/tripRole';
import type { Collaborator, TripRole } from '../../api/types';
import styles from './SharePanel.module.css';

export interface SharePanelProps {
  open: boolean;
  onClose: () => void;
  /** The trip whose people these are. Trips only — an idea has no collaborators. */
  tripId: number;
}

/** What each role may do, in the product's own words. Doubles as the row's
 * description, so no invented one-word role labels are needed anywhere. */
const ROLE_DESCRIPTION: Record<TripRole, string> = {
  owner: 'Started this trip. Can bring people on, change what they can do, and set the trip aside.',
  member: 'Can add, change and rearrange everything here, and bring others along.',
  viewer: 'Can read everything here, and leaves it as they found it.',
};

const ROLE_OPTIONS: { value: GrantableRole; label: string }[] = [
  { value: 'member', label: 'Add and change things' },
  { value: 'viewer', label: 'Read along only' },
];

/**
 * The whole outcome of an add. It says nothing about whether the address
 * matched an account, because the endpoint deliberately does not know how to
 * tell you — see api/collaborators.ts.
 */
const AMBIGUOUS_ADD =
  'If someone is here under that email, the trip will be waiting for them next time they sign in. If not, nothing happens.';

const ALONE = 'Just you on this so far.';

const REMOVE = 'Take them off';
const LEAVE = 'Leave this trip';
const HAND_OVER = 'Hand the trip to them';

const FALLBACK_ERROR = "That didn't go through. Try again in a moment.";
const LOAD_ERROR = "That list didn't load. Close this and open it again.";

const EMAIL_FIELD_ID = 'share-panel-email';
const ROLE_FIELD_ID = 'share-panel-role';

type PendingKind = 'remove' | 'leave' | 'handOver';

interface Pending {
  kind: PendingKind;
  userId: number;
  name: string;
}

function confirmLine({ kind, name }: Pending): string {
  if (kind === 'leave') return "Leave this trip? You'll lose sight of it unless someone brings you back.";
  if (kind === 'handOver') return `Hand this trip to ${name}? You'll stay on as someone who can edit.`;
  // "they", not "she": the real name goes in, but nobody told us a pronoun and
  // guessing one is worse than the plain word that fits everybody.
  return `Take ${name} off this trip? Everything they added stays.`;
}

function confirmLabel(kind: PendingKind): string {
  if (kind === 'leave') return LEAVE;
  if (kind === 'handOver') return HAND_OVER;
  return REMOVE;
}

/** The same circle the sidebar cluster draws, so the face you clicked and the
 * row you land on are recognisably one person. The dot is for a name that is
 * somehow blank — a circle with nothing in it looks broken. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}

function messageFor(error: unknown): string {
  // The server's refusals are written in this voice already ("You started this
  // trip, so it needs you until someone else takes it on."), so show them as
  // they came rather than flattening every failure into one house sentence.
  return error instanceof ApiError && error.status < 500 && error.message ? error.message : FALLBACK_ERROR;
}

/**
 * Who is on a trip, and the one place you change it.
 *
 * A Modal, not a Drawer: the drawer is the entry-editing surface, and this is a
 * decision you finish and step back out of.
 *
 * Roles are read from the GET response's `my_role`, never from a prop — the
 * server is the only thing that knows, and it can change under you the moment
 * someone hands the trip on.
 *
 * Purely presentational as far as the app is concerned: it mounts nowhere on
 * its own. The caller decides when it is open and where the trigger lives.
 */
export function SharePanel({ open, onClose, tripId }: SharePanelProps) {
  const { show } = useToast();

  // Nothing is fetched until the dialog is actually open, so a caller can mount
  // this alongside a trip header without paying for a request nobody asked for.
  const { data, isLoading, isError } = useCollaborators(tripId, { enabled: open });

  const addCollaborator = useAddCollaborator(tripId);
  const changeRole = useChangeCollaboratorRole(tripId);
  const removeCollaborator = useRemoveCollaborator(tripId);
  const handOver = useHandOverTrip(tripId);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<GrantableRole>('member');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const working =
    addCollaborator.isPending || changeRole.isPending || removeCollaborator.isPending || handOver.isPending;

  // Modal's Escape/Tab effect depends on [open, onClose], and re-runs whenever
  // this identity changes — an unmemoized handler re-fires it and pulls focus
  // out of the email box after the first character typed. See NewTripModal,
  // which learned this the hard way.
  const close = useCallback(() => {
    setEmail('');
    setNote(null);
    setPending(null);
    onClose();
  }, [onClose]);

  const collaborators = data?.collaborators ?? [];
  const myRole = data?.my_role ?? null;
  const iAmOwner = myRole === 'owner';
  const alone = collaborators.length === 1 && collaborators[0]?.is_you === true;

  function submitAdd() {
    const trimmed = email.trim();
    if (!trimmed || addCollaborator.isPending) return;
    addCollaborator.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          setEmail('');
          // Persistent on purpose: this sentence is the entire result of the
          // action, and a Toast would take it away again after four seconds.
          setNote(AMBIGUOUS_ADD);
        },
        onError: (error) => show(messageFor(error), 'error'),
      },
    );
  }

  function runPending() {
    if (!pending || working) return;
    const onError = (error: unknown) => {
      setPending(null);
      show(messageFor(error), 'error');
    };
    const onSuccess = () => setPending(null);

    if (pending.kind === 'handOver') {
      handOver.mutate(pending.userId, { onSuccess, onError });
      return;
    }
    // Leaving and being taken off are the same door; only who may open it differs.
    removeCollaborator.mutate(pending.userId, { onSuccess, onError });
  }

  function renderActions(person: Collaborator) {
    if (pending?.userId === person.user_id) {
      return (
        <div className={styles.confirm}>
          <p className={styles.confirmText}>{confirmLine(pending)}</p>
          <div className={styles.confirmActions}>
            <Button variant="secondary" onClick={runPending} disabled={working}>
              {confirmLabel(pending.kind)}
            </Button>
            <Button variant="quiet" onClick={() => setPending(null)} disabled={working}>
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    const buttons = [];
    if (iAmOwner && !person.is_you) {
      buttons.push(
        <Button
          key="handOver"
          variant="quiet"
          className={styles.action}
          onClick={() => setPending({ kind: 'handOver', userId: person.user_id, name: person.name })}
        >
          {HAND_OVER}
        </Button>,
        <Button
          key="remove"
          variant="quiet"
          className={styles.action}
          onClick={() => setPending({ kind: 'remove', userId: person.user_id, name: person.name })}
        >
          {REMOVE}
        </Button>,
      );
    }
    // The owner cannot leave their own trip — they hand it on first. Everyone
    // else can see themselves out.
    if (person.is_you && person.role !== 'owner') {
      buttons.push(
        <Button
          key="leave"
          variant="quiet"
          className={styles.action}
          onClick={() => setPending({ kind: 'leave', userId: person.user_id, name: person.name })}
        >
          {LEAVE}
        </Button>,
      );
    }
    if (buttons.length === 0) return null;
    return <div className={styles.actions}>{buttons}</div>;
  }

  function renderPerson(person: Collaborator) {
    const canChangeTheirRole = iAmOwner && !person.is_you && person.role !== 'owner';
    return (
      <li key={person.user_id} className={styles.person}>
        {/* Hidden from screen readers: the name is real text an inch to the
            right, and hearing the person twice is worse than not seeing the
            circle at all. */}
        <span className={styles.avatar} aria-hidden="true">
          {initial(person.name)}
        </span>
        <div className={styles.details}>
          <div className={styles.who}>
            <span className={styles.name}>{person.name}</span>
            {person.is_you && <span className={styles.you}>you</span>}
          </div>
          {/* Null for a viewer, who sees who is here without collecting addresses.
              Absent, not the word "null" and not an empty line. */}
          {person.email && <p className={styles.email}>{person.email}</p>}
          {canChangeTheirRole && (
            <Select
              wrapperClassName={styles.roleSelect}
              aria-label={`What ${person.name} can do`}
              value={person.role}
              disabled={working}
              onChange={(e) =>
                changeRole.mutate(
                  { userId: person.user_id, role: e.target.value as GrantableRole },
                  { onError: (error) => show(messageFor(error), 'error') },
                )
              }
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
          <p className={styles.roleDescription}>{ROLE_DESCRIPTION[person.role]}</p>
          {renderActions(person)}
        </div>
      </li>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Who's on this trip">
      <div className={styles.panel}>
        {isLoading && <Spinner label="Loading who's on this trip" />}
        {isError && <p className={styles.loadError}>{LOAD_ERROR}</p>}

        {data &&
          (alone ? (
            <p className={styles.alone}>{ALONE}</p>
          ) : (
            <ul className={styles.people}>{collaborators.map(renderPerson)}</ul>
          ))}

        {data && canShare(myRole) && (
          <div className={styles.addForm}>
            {/* The live region wraps the field rather than sitting inside it:
                <Field> renders its description as a plain <p>, and a region has
                to be in the DOM before its text changes to be announced at all.
                So it is here, empty, from the first render. */}
            <div className={styles.emailLive} role="status">
              <Field
                id={EMAIL_FIELD_ID}
                label="Add someone by email"
                description={note ?? undefined}
                type="email"
                placeholder="Their email address"
                hint="↵"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // A new address makes the last answer stale — it was about
                  // the address that has just been typed over.
                  setNote(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdd();
                }}
              />
            </div>

            <Field id={ROLE_FIELD_ID} label="They can">
              <Select
                wrapperClassName={styles.addRoleSelect}
                value={role}
                onChange={(e) => setRole(e.target.value as GrantableRole)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Button onClick={submitAdd} disabled={!email.trim() || addCollaborator.isPending}>
              {addCollaborator.isPending ? 'One moment' : 'Add them'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
