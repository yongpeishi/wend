import { useRef } from 'react';
import styles from './TabBar.module.css';

export interface Tab {
  key: string;
  label: string;
}

export type TabBarVariant = 'nav' | 'compact';

export interface TabBarProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  /**
   * 'nav' (the default) is the trip's own sub-navigation: full height, the
   * selected tab in action green. 'compact' is the same control at a lower
   * voice, for a segmented choice that shares a row with other controls and
   * must not out-shout the primary button next to it.
   */
  variant?: TabBarVariant;
  'aria-label': string;
}

/** Segmented control for trip sub-navigation (Board / Map / Schedule / Checklist),
 * and — in its `compact` variant — for any other three-way choice that wants the
 * same "all the options are visible, none is a dead end" shape.
 *
 * The variant is opt-in and touches nothing but colour and geometry, because the
 * value of this component is the keyboard contract underneath: full
 * roving-tabindex support, Left/Right/Home/End move focus and selection
 * together. A second segmented control built locally somewhere else would be a
 * second, and eventually divergent, copy of that contract. */
export function TabBar({ tabs, activeKey, onChange, variant = 'nav', 'aria-label': ariaLabel }: TabBarProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusAndSelect(key: string) {
    onChange(key);
    refs.current[key]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    const next = tabs[nextIndex];
    if (next) focusAndSelect(next.key);
  }

  return (
    <div
      className={variant === 'compact' ? `${styles.tablist} ${styles.compact}` : styles.tablist}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab, index) => {
        const selected = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[tab.key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
