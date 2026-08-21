import { useEffect, useId, useRef, useState } from 'react';
import type { Entry, EntryCategory } from '../../api/types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './filters';
import { pathToIdea } from './tree';
import { Button } from '../../design/components/core/Button';
import styles from './IdeaComposer.module.css';

/** How many picker results are ever drawn at once — see PICKER_LIMIT's note. */
const PICKER_LIMIT = 8;

/**
 * What the composer hands back on submit — everything the quick-add path
 * (CaptureBar's Enter) cannot say. The board turns it into the create call and
 * the follow-up links; this component never talks to the server itself.
 *
 * `category` is nullable because the composer no longer answers that question
 * on the writer's behalf (see the component comment): null means "nobody said",
 * and the board must pass that through as an uncategorised idea rather than
 * substituting a guess of its own.
 */
export interface IdeaComposerDraft {
  title: string;
  description: string;
  address: string;
  category: EntryCategory | null;
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
  /**
   * The whole idea set, read only to draw each picker result's ancestor path.
   * It is separate from `parentChoices` because the two answer different
   * questions: `parentChoices` is what you may nest inside (already filtered by
   * the board — no self, no descendants), while the path has to walk through
   * ideas that are not themselves offerable in order to say where a candidate
   * lives. Defaults to `parentChoices`, which is right whenever the board is
   * not filtering anything out.
   */
  allIdeas?: Entry[];
  /** Seed for the description field — an existing idea's, when editing. */
  initialDescription?: string;
  /** Seed for the address field — an existing idea's, when editing. */
  initialAddress?: string;
  /** Which category chip starts lit; null — nothing lit — unless told otherwise. */
  initialCategory?: EntryCategory | null;
  /**
   * The idea this composer opened inside. Set, it names the host in the
   * heading and wears the nested surface; unset, it is the top-of-list card
   * that has always sat under the capture bar.
   */
  hostTitle?: string;
  /**
   * Open showing only the name and the short description, with a text link in
   * the footer that reveals address, category and parents. Default false —
   * every existing caller keeps today's full card.
   */
  trimmed?: boolean;
  /** The primary footer button's label — "Add idea" unless editing. */
  submitLabel?: string;
  onSubmit: (draft: IdeaComposerDraft) => void;
  onCancel: () => void;
}

/**
 * The capture bar's "tab for details": the same act of keeping an idea, with
 * room to say what kind of thing it is and where it lives. It renders inline
 * directly under the capture bar rather than as a modal, because it is a
 * continuation of typing, not an interruption of it — the name arrives
 * already filled in from the bar, and focus lands on it to carry straight on.
 * The card wears the apricot "you are here" border while open, so the eye
 * follows the promotion from the bar down into the details.
 *
 * The same card also serves as the inline EDIT form for an existing idea:
 * seed every field through the `initial*` props and rename the footer button
 * with `submitLabel`, and it gathers a corrected draft exactly the way it
 * gathers a new one. The board still owns what "submit" means in either case.
 *
 * And it serves a third wearer: opened INSIDE an idea's row. `hostTitle` names
 * the idea it landed in — the heading says so in words, because the card is by
 * then several rows down the page and its position alone no longer says what
 * it will be filed under. That instance also swaps the card's own tone: paper
 * inside leaf, instead of card inside apricot. A second card-toned card
 * bordered like the first would read as a sibling arriving in the list; the
 * inverted tone reads as a pocket opening within the row that holds it. The
 * one knock-on is the parent picker, which was paper-on-card precisely to sit
 * a tone BELOW its container — inside the nested card it flips to card tone to
 * keep that relationship rather than dissolving into its background.
 *
 * `trimmed` is for that inline case: two fields up front, and a text link that
 * unfolds the rest. Adding an idea inside another one is usually the fast half
 * of a thought — the parent is already chosen by where you clicked, and a
 * six-chip category row above the button turns "and one more" into a form. The
 * link is not a progressive-disclosure toy: once opened it stays open for that
 * composing, because taking fields away again from someone who just asked for
 * them is a worse trade than a slightly taller card.
 *
 * Pure and controlled from above: no fetching, no mutations, no toast. The
 * board owns what "submit" means (a create plus zero or more links), so this
 * component's whole job is to gather an `IdeaComposerDraft` and hand it over.
 * That is also why `parentChoices` is a prop — the board already holds every
 * idea on the trip, and a second fetch here would be the same list again.
 *
 * Category starts UNLIT and the draft's `category` is nullable. This card used
 * to open with 'place' already answered, on the argument that a category is
 * the cheapest fact the "full picture" path can ask for. That argument was
 * wrong in one specific way: a pre-lit chip is not a cheap question, it is an
 * answer the writer never gave, and it is wrong for most of what people keep —
 * a dish, a warning, a maybe, a link to look at later. Nothing downstream
 * needs a category to exist, so an unanswered one now travels as null and the
 * six chips stay a genuine question with a legitimate blank answer.
 *
 * The parent picker is a search, not a cloud. A flat list of every remaining
 * idea worked while a trip held six of them; past that it is a wall of chips
 * with no order and, worse, no way to tell two same-named ideas apart. So:
 * type to filter, results as rows, and under each name the path of ideas it
 * lives inside — which is exactly the fact that distinguishes one "Lunch"
 * from another. Only the first few matches are drawn (see PICKER_LIMIT); the
 * search field, not scrolling, is how you reach the rest.
 *
 * State resets when `open` flips true — the composer stays mounted across
 * opens the way NewIdeaModal does, so a fresh Tab must not resurrect the
 * half-draft someone cancelled yesterday. The reset seeds every field from
 * the initials of that moment, and re-folds a trimmed card. While it is open,
 * the initials are deliberately NOT watched: re-seeding mid-edit would
 * overwrite typing.
 *
 * Focus is moved by hand rather than with `autoFocus`, and always with
 * `preventScroll`. The inline instance opens inside a row that is already on
 * screen; a browser scrolling the page to "reveal" a field the reader is
 * looking at throws away the one thing they were sure of, which row they were
 * in. Same reasoning for the picker's search box when it opens.
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
  allIdeas = parentChoices,
  initialDescription = '',
  initialAddress = '',
  initialCategory = null,
  hostTitle,
  trimmed = false,
  submitLabel = 'Add idea',
  onSubmit,
  onCancel,
}: IdeaComposerProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [address, setAddress] = useState(initialAddress);
  const [category, setCategory] = useState<EntryCategory | null>(initialCategory);
  const [parentIds, setParentIds] = useState<number[]>(initialParentIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  // A trimmed card starts folded; every other caller starts with the whole
  // form, so "revealed" is true from the outset and no link is ever drawn.
  const [revealed, setRevealed] = useState(!trimmed);
  const categoryLabelId = useId();
  const insideLabelId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fresh form on every open — same pattern (and same reasoning) as
  // NewIdeaModal's reset effect. The ref keys the reset to the false→true
  // FLIP rather than to the deps: the initials sit in the array to keep the
  // effect honest about what it reads, but a board re-render that hands down
  // a new `initialParentIds` identity mid-edit must not wipe the typing (see
  // the component comment). Focus rides the same flip, for the same reason it
  // cannot be `autoFocus`: it must not scroll the page under the reader.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setAddress(initialAddress);
      setCategory(initialCategory);
      setParentIds(initialParentIds);
      setPickerOpen(false);
      setQuery('');
      setRevealed(!trimmed);
      nameRef.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [
    open,
    initialTitle,
    initialDescription,
    initialAddress,
    initialCategory,
    initialParentIds,
    trimmed,
  ]);

  // The picker is a search first and a list second, so opening it has to put
  // the caret in the search box — otherwise the first keystroke of the name
  // someone is already thinking of goes nowhere.
  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus({ preventScroll: true });
  }, [pickerOpen]);

  if (!open) return null;

  /** The parent's visible name; a bare id if the board handed one we can't see. */
  function titleOf(id: number): string {
    return parentChoices.find((choice) => choice.id === id)?.title ?? `#${id}`;
  }

  const ideaTitleById = new Map(allIdeas.map((entry) => [entry.id, entry.title]));

  /**
   * Where a candidate lives, as "Travel to Busan ›" — the ancestors that
   * would be walked through to reach it, ending in the separator so the row's
   * own name reads as the last step of the path. Empty for a root idea, which
   * has nowhere to be placed and needs no line saying so. `pathToIdea` already
   * carries the visited set that makes a cycle in the links safe, so this is
   * a lookup, never a second walk.
   */
  function ancestorPathOf(id: number): string {
    const chain = pathToIdea(allIdeas, id);
    if (chain.length === 0) return '';
    return `${chain.map((ancestorId) => ideaTitleById.get(ancestorId) ?? `#${ancestorId}`).join(' › ')} ›`;
  }

  const remainingChoices = parentChoices.filter((choice) => !parentIds.includes(choice.id));
  const needle = query.trim().toLowerCase();
  const matches = remainingChoices.filter(
    (choice) => needle === '' || choice.title.toLowerCase().includes(needle),
  );
  const shown = matches.slice(0, PICKER_LIMIT);

  function chooseParent(id: number) {
    setParentIds((current) => [...current, id]);
    setPickerOpen(false);
    setQuery('');
  }

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
    <div className={[styles.card, hostTitle ? styles.cardNested : ''].filter(Boolean).join(' ')}>
      {hostTitle && (
        <div className={styles.heading}>
          {/* Written in capitals rather than left to text-transform, unlike the
              section labels below: this one is a fixed piece of chrome, and the
              string a reader sees is the string a test — or a translator —
              should find in the source. */}
          <p className={styles.sectionLabel}>NEW IDEA INSIDE</p>
          <p className={styles.hostName}>{hostTitle}</p>
        </div>
      )}

      {/* 17px/700 — the name is the idea, so it is set like an idea row's
          title while it is being typed. */}
      <input
        ref={nameRef}
        type="text"
        className={[styles.input, styles.nameInput].join(' ')}
        value={title}
        placeholder="Name it — even vaguely"
        aria-label="Name"
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

      {revealed && (
        <>
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
                are one-of-six. A radiogroup in chip clothing — one that may end
                with none of the six chosen, because an unanswered category is a
                real answer here. */}
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
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((value) => !value)}
              >
                + add parent
              </button>
            </div>

            {/* One pick per opening: choosing a parent closes the picker, because
                nesting under several parents at once is the rare case and the
                common one should not need a second click to put the list away. */}
            {pickerOpen &&
              (remainingChoices.length === 0 ? (
                <p className={styles.empty}>Every idea it could nest in already holds it.</p>
              ) : (
                <div className={styles.picker}>
                  <input
                    ref={searchRef}
                    type="text"
                    className={[styles.input, styles.searchInput].join(' ')}
                    value={query}
                    placeholder="Search ideas"
                    aria-label="Search ideas"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {shown.length === 0 ? (
                    <p className={styles.empty}>Nothing by that name yet.</p>
                  ) : (
                    <div className={styles.results}>
                      {shown.map((choice) => {
                        const path = ancestorPathOf(choice.id);
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            className={styles.result}
                            onClick={() => chooseParent(choice.id)}
                          >
                            <span className={styles.resultName}>{choice.title}</span>
                            {path !== '' && <span className={styles.resultPath}>{path}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      <div className={styles.footer}>
        <Button size="small" onClick={submit}>
          {submitLabel}
        </Button>
        {!revealed && (
          <button type="button" className={styles.reveal} onClick={() => setRevealed(true)}>
            ＋ address, category, parents
          </button>
        )}
        <Button variant="quiet" size="small" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
