import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './CaptureBar.module.css';

export interface CaptureBarProps {
  /** From the board, because the bar sits at every drill level: "Add an idea
      to Kyoto…" three levels down, "Add an idea…" at the top. */
  placeholder: string;
  /** Enter with words in the box — create it now, exactly as typed. */
  onQuickAdd: (title: string) => void;
  /** Tab — open the composer, seeded with whatever was typed so far. */
  onOpenComposer: (draft: string) => void;
}

/**
 * The board's always-there capture line: one input above the idea list, where
 * collection mode's whole bargain — saving something costs almost nothing —
 * gets its price printed on it. Enter keeps the words as an idea; Tab trades
 * up to the composer for the find that deserves a category and a home.
 *
 * The Tab hijack is deliberate and the hint says so ("tab for details"): on
 * this one input, Tab is the promotion gesture from the design, not focus
 * traversal. It hands the current text to the composer — which takes focus
 * itself, so the keyboard still lands somewhere sensible. Shift+Tab is left
 * alone: backwards is navigation, and a bar that trapped both directions
 * would seal the keyboard in.
 *
 * A blank Enter does nothing at all — not a toast, not a shake. Nothing typed
 * is not a failed save; it is someone who leaned on the key, and the honest
 * response is no response (the same reasoning as IdeaTodos' submit).
 *
 * State is one string and it is local: the draft belongs to nobody until one
 * of the two callbacks hands it to the board, and both hand it TRIMMED — the
 * server should never learn about the trailing space someone typed before
 * hitting Enter. Both also clear the bar: the words have gone somewhere (a
 * created idea, the composer's name field), so keeping them here would show
 * the same idea twice.
 */
export function CaptureBar({ placeholder, onQuickAdd, onOpenComposer }: CaptureBarProps) {
  const [value, setValue] = useState('');

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      const title = value.trim();
      if (title === '') return;
      onQuickAdd(title);
      setValue('');
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // Even empty: Tab is "I want the full form", and an empty draft just
      // means the composer opens with a blank name to fill in.
      event.preventDefault();
      onOpenComposer(value.trim());
      setValue('');
    }
  }

  return (
    <div className={styles.bar}>
      <input
        type="text"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {/* Decorative keyboard legend. pointer-events: none so a click on it
          lands in the input underneath — it looks like part of the field and
          must behave like it. Hidden from readers: the aria-label above is the
          field's name, and "enter to add · tab for details" read aloud mid-form
          is noise, not help. */}
      <span className={styles.hint} aria-hidden="true">
        enter to add · tab for details
      </span>
    </div>
  );
}
