import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeElement } from './describeElement';
import type { ElementCapture } from './describeElement';

/** Marks nodes the picker must never select — its own chrome. */
export const PICKER_IGNORE_ATTR = 'data-feedback-picker-ignore';

export interface PickerTarget extends ElementCapture {
  rect: DOMRect;
}

/**
 * "Point at the thing you mean" mode.
 *
 * Listening happens in the CAPTURE phase and every event is stopped there, so
 * a pick never reaches the page underneath — clicking a nav link to complain
 * about it must not navigate away, which would throw away the half-written
 * message. Escape cancels; blur (alt-tab) cancels too, since a highlight left
 * frozen over the page reads as a broken app.
 */
export function useElementPicker(onPick: (capture: ElementCapture) => void) {
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<PickerTarget | null>(null);

  const start = useCallback(() => setPicking(true), []);
  const cancel = useCallback(() => {
    setPicking(false);
    setTarget(null);
  }, []);

  useEffect(() => {
    if (!picking) return;

    const resolve = (event: Event): Element | null => {
      const node = event.target;
      if (!(node instanceof Element)) return null;
      if (node.closest(`[${PICKER_IGNORE_ATTR}]`)) return null;
      return node;
    };

    const handleMove = (event: MouseEvent) => {
      const element = resolve(event);
      if (!element) {
        setTarget(null);
        return;
      }
      setTarget({ ...describeElement(element), rect: element.getBoundingClientRect() });
    };

    const handleClick = (event: MouseEvent) => {
      const element = resolve(event);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      setPicking(false);
      setTarget(null);
      onPick(describeElement(element));
    };

    // Keyboards pick too: Enter/Space commits whatever has focus.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const focused = document.activeElement;
        if (!(focused instanceof Element) || focused === document.body) return;
        if (focused.closest(`[${PICKER_IGNORE_ATTR}]`)) return;
        event.preventDefault();
        event.stopPropagation();
        setPicking(false);
        setTarget(null);
        onPick(describeElement(focused));
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const element = resolve(event);
      if (!element) return;
      setTarget({ ...describeElement(element), rect: element.getBoundingClientRect() });
    };

    // A scroll moves the page out from under a highlight measured in viewport
    // coordinates, so drop it and let the next mousemove re-measure.
    const handleScroll = () => setTarget(null);

    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('scroll', handleScroll, true);

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';

    return () => {
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('scroll', handleScroll, true);
      document.body.style.cursor = previousCursor;
    };
  }, [picking, onPick, cancel]);

  // Memoised: a fresh object here would change the identity of anything a
  // caller derives from it (a `useCallback` closing over the picker, say),
  // which in turn re-runs the consumer's effects on every keystroke. That
  // once cost this component the ability to type more than one character.
  return useMemo(() => ({ picking, target, start, cancel }), [picking, target, start, cancel]);
}
