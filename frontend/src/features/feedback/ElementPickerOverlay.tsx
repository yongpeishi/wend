import { createPortal } from 'react-dom';
import { PICKER_IGNORE_ATTR } from './useElementPicker';
import type { PickerTarget } from './useElementPicker';
import styles from './ElementPickerOverlay.module.css';

export interface ElementPickerOverlayProps {
  target: PickerTarget | null;
  onCancel: () => void;
}

/**
 * The highlight drawn over whatever the user is pointing at, plus a banner
 * explaining the mode. Everything here is `pointer-events: none` (bar the
 * cancel button) so it cannot itself become the pick target, and every node
 * carries the ignore attribute as a second line of defence.
 */
export function ElementPickerOverlay({ target, onCancel }: ElementPickerOverlayProps) {
  return createPortal(
    <div className={styles.layer} {...{ [PICKER_IGNORE_ATTR]: 'true' }}>
      {target && (
        <>
          <div
            className={styles.highlight}
            style={{
              top: `${target.rect.top}px`,
              left: `${target.rect.left}px`,
              width: `${target.rect.width}px`,
              height: `${target.rect.height}px`,
            }}
          />
          <div
            className={styles.tag}
            style={{
              // Below the element, unless that would fall off the bottom.
              top:
                target.rect.bottom + 28 > window.innerHeight
                  ? `${Math.max(target.rect.top - 26, 4)}px`
                  : `${target.rect.bottom + 4}px`,
              left: `${Math.max(target.rect.left, 4)}px`,
            }}
          >
            {target.label}
          </div>
        </>
      )}

      <div className={styles.banner} role="status">
        <span className={styles.bannerText}>
          Click the part of the page you mean{target ? '' : ' — move over the page to highlight it'}
        </span>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </div>,
    document.body,
  );
}
