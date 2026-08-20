import { useEffect, useId, useRef, useState } from 'react';
import type { Entry, EntryCategory } from '../../api/types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './filters';
import { Button } from '../../design/components/core/Button';
import styles from './IdeaComposer.module.css';

/**
 * What the composer hands back on submit — everything the quick-add path
 * (CaptureBar's Enter) cannot say. The board turns it into the create call and
 * the follow-up links; this component never talks to the server itself.
 */
export interface IdeaComposerDraft {
  title: string;
  description: string;
  address: string;
  category: EntryCategory;
  parentIds: number[];
}

export interface IdeaComposerProps {
  open: boolean;
  /** What was typed in the capture bar before Tab promoted it here. */
  initialTitle: string;
  /** Pre-chosen parents — the level the board was showing, usually. */
  initialParentIds: number[];
  /** Every idea the new one could nest inside. Titles are looked up here. */
  parentChoices: Entry[];
  onSubmit: (draft: IdeaComposerDraft) => void;
  onCancel: () => void;
}

/**
 * The capture bar's "tab for details": the same act of keeping an idea, with
 * room to say what kind of thing it is and where it lives. It renders inline
 * where the capture bar sits rather than as a modal, because it is a
 * continuation of typing, not an interruption of it — the name arrives
 * already filled in from the bar, and focus lands on it to carry straight on.
 *
 * Pure and controlled from above: no fetching, no mutations, no toast. The
 * board owns what "submit" means (a create plus zero or more links), so this
 * component's whole job is to gather an `IdeaComposerDraft` and hand it over.
 * That is also why `parentChoices` is a prop — the board already holds every
 * idea on the trip, and a second fetch here would be the same list again.
 *
 * Category defaults to 'place' rather than opening unanswered. The six chips
 * are single-select and one is always lit: the draft's `category` is typed
 * non-null, because the composer is the "full picture" path and a category is
 * the cheapest fact it asks for. (Quick-add stays category-free — that is the
 * other path's whole point.)
 *
 * State resets when `open` flips true — the composer stays mounted across
 * opens the way NewIdeaModal does, so a fresh Tab must not resurrect the
 * half-draft someone cancelled yesterday. While it is open, the initials are
 * deliberately NOT watched: re-seeding mid-edit would overwrite typing.
 *
 * Blank-title submits are refused silently, with one courtesy first: if the
 * name field was emptied but the bar had seeded one, the seed is what gets
 * kept — deleting the prefill and hitting "Add idea" reads as "keep what I
 * tabbed in", not "keep nothing".
 */
export function IdeaComposer({
  open,
  initialTitle,
  initialParentIds,
  parentChoices,
  onSubmit,
  onCancel,
}: IdeaComposerProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<EntryCategory>('place');
  const [parentIds, setParentIds] = useState<number[]>(initialParentIds);
  const [cloudOpen, setCloudOpen] = useState(false);
  const categoryLabelId = useId();
  const insideLabelId = useId();

  // Fresh form on every open — same pattern (and same reasoning) as
  // NewIdeaModal's reset effect. The ref keys the reset to the false→true
  // FLIP rather than to the deps: the initials sit in the array to keep the
  // effect honest about what it reads, but a board re-render that hands down
  // a new `initialParentIds` identity mid-edit must not wipe the typing (see
  // the component comment).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle(initialTitle);
      setDescription('');
      setAddress('');
      setCategory('place');
      setParentIds(initialParentIds);
      setCloudOpen(false);
    }
    wasOpen.current = open;
  }, [open, initialTitle, initialParentIds]);

  if (!open) return null;

  /** The parent's visible name; a bare id if the board handed one we can't see. */
  function titleOf(id: number): string {
    return parentChoices.find((choice) => choice.id === id)?.title ?? `#${id}`;
  }

  const remainingChoices = parentChoices.filter((choice) => !parentIds.includes(choice.id));

  function submit() {
    // The courtesy fallback: an emptied name field keeps the seeded title.
    const kept = title.trim() || initialTitle.trim();
    if (kept === '') return;
    onSubmit({
      title: kept,
      description: description.trim(),
      address: address.trim(),
      category,
      parentIds,
    });
  }

  return (
    <div className={styles.card}>
      {/* 17px/700 — the name is the idea, so it is set like an idea row's
          title while it is being typed. */}
      <input
        type="text"
        className={[styles.input, styles.nameInput].join(' ')}
        value={title}
        placeholder="Name it — even vaguely"
        aria-label="Name"
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
      />

      <input
        type="text"
        className={styles.input}
        value={description}
        placeholder="Short description"
        aria-label="Short description"
        onChange={(event) => setDescription(event.target.value)}
      />

      {/* The placeholder does the explaining, so an idea that is not a place —
          a dish, a warning, a vibe — never meets a required-looking field. */}
      <input
        type="text"
        className={styles.input}
        value={address}
        placeholder="Address — leave empty if it isn't a place"
        aria-label="Address"
        onChange={(event) => setAddress(event.target.value)}
      />

      <div className={styles.section}>
        <p className={styles.sectionLabel} id={categoryLabelId}>
          Category
        </p>
        {/* Single-select pills rather than the design-system Chip: Chip's
            selected state is a multi-select "lit" (aria-pressed), and these
            are one-of-six. A radiogroup in chip clothing. */}
        <div className={styles.pills} role="radiogroup" aria-labelledby={categoryLabelId}>
          {CATEGORY_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={category === option}
              className={[styles.pill, category === option ? styles.pillOn : ''].filter(Boolean).join(' ')}
              onClick={() => setCategory(option)}
            >
              {CATEGORY_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel} id={insideLabelId}>
          Inside
        </p>
        <div className={styles.pills} aria-labelledby={insideLabelId}>
          {/* A chosen parent IS its own remove button — "NAME ✕" — because the
              only thing to do to a chip you added is take it off again. */}
          {parentIds.map((id) => (
            <button
              key={id}
              type="button"
              className={[styles.pill, styles.parentPill].join(' ')}
              aria-label={`Remove from ${titleOf(id)}`}
              onClick={() => setParentIds((current) => current.filter((parentId) => parentId !== id))}
            >
              {titleOf(id)} ✕
            </button>
          ))}
          <button
            type="button"
            className={styles.pill}
            aria-expanded={cloudOpen}
            onClick={() => setCloudOpen((value) => !value)}
          >
            + add parent
          </button>
        </div>

        {/* One pick per opening: choosing a parent closes the cloud, because
            nesting under several parents at once is the rare case and the
            common one should not need a second click to put the list away. */}
        {cloudOpen &&
          (remainingChoices.length === 0 ? (
            <p className={styles.empty}>Every idea it could nest in already holds it.</p>
          ) : (
            <div className={styles.cloud}>
              {remainingChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={styles.cloudChip}
                  onClick={() => {
                    setParentIds((current) => [...current, choice.id]);
                    setCloudOpen(false);
                  }}
                >
                  {choice.title}
                </button>
              ))}
            </div>
          ))}
      </div>

      <div className={styles.footer}>
        <Button size="small" onClick={submit}>
          Add idea
        </Button>
        <Button variant="quiet" size="small" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
