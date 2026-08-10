import { useRef } from 'react';
import styles from './TabBar.module.css';

export interface Tab {
  key: string;
  label: string;
}

export interface TabBarProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  'aria-label': string;
}

/** Segmented control for trip sub-navigation (Board / Map / Schedule / Checklist).
 * Full roving-tabindex keyboard support: Left/Right/Home/End move focus and selection. */
export function TabBar({ tabs, activeKey, onChange, 'aria-label': ariaLabel }: TabBarProps) {
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
    <div className={styles.tablist} role="tablist" aria-label={ariaLabel}>
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
