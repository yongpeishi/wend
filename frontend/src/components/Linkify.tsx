import { Fragment, type ReactElement } from 'react';
import { linkifyText, truncateUrl } from '../lib/linkify';
import styles from './Linkify.module.css';

export interface LinkifyProps {
  /** The user-typed string to render. */
  children: string;
}

/**
 * Renders a user-typed string with any URLs in it turned into links.
 *
 * Deliberately a bare fragment — text nodes and <a> elements, no wrapper. The
 * caller keeps its own <p> or <span> and that element's class, so wrapping a
 * note in <Linkify> cannot change how a note with no URL in it lays out; the
 * only way to be sure of that is to add no element at all.
 *
 * Segments are React children, never markup: a pasted `<script>` is a string
 * here and stays a string on the page. There is no dangerouslySetInnerHTML in
 * this file and there must never be one — the input is by definition text
 * someone else typed.
 */
export function Linkify({ children }: LinkifyProps): ReactElement {
  return (
    <>
      {linkifyText(children).map((segment, index) => {
        // Index keys are safe here: the list is derived from the string on
        // every render, so a given position always holds the same segment.
        if (segment.kind === 'text') {
          return <Fragment key={index}>{segment.text}</Fragment>;
        }

        const label = truncateUrl(segment.text);
        return (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
            // Only when the label is short of the truth: a title that merely
            // repeats the visible text is a tooltip for nothing.
            title={label === segment.text ? undefined : segment.href}
            // Links live inside rows that are themselves clickable — a todo, an
            // idea. Following the link must not also expand the row behind it.
            onClick={(event) => event.stopPropagation()}
          >
            {label}
          </a>
        );
      })}
    </>
  );
}
