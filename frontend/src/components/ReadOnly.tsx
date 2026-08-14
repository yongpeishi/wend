import type { CSSProperties, ReactNode } from 'react';
import { useCanEdit } from '../auth/TripRoleContext';

export interface ReadOnlyProps {
  children: ReactNode;
  /**
   * Override the trip role. Presentational components that already take their
   * capability as a prop pass it here; everything else omits it and the trip
   * context answers.
   */
  canEdit?: boolean;
}

/**
 * A fieldset arrives with a margin, a border, padding and a `min-inline-size`
 * of `min-content` — enough to shift a layout that was not expecting it.
 * `display: contents` takes the box out of the layout altogether so the
 * children sit exactly where they did; the rest is the fallback for a browser
 * that ignores it. Inline rather than a module: four static rules, no token,
 * no theme, nothing here is worth a stylesheet.
 */
const RESET: CSSProperties = {
  display: 'contents',
  margin: 0,
  padding: 0,
  border: 0,
  minInlineSize: 0,
};

/**
 * A `<fieldset>` carries `disabled` down to every form control inside it, which
 * is one attribute instead of one per control. It is the region gate for a
 * viewer.
 *
 * The content itself is untouched and stays on screen — a viewer must be able
 * to read everything. Where a control should disappear rather than go inert
 * (buttons, `⋯` menus, drag handles) do not wrap it, render nothing.
 */
export function ReadOnly({ children, canEdit: canEditProp }: ReadOnlyProps) {
  const contextCanEdit = useCanEdit();
  const editable = canEditProp ?? contextCanEdit;

  if (editable) return <>{children}</>;

  return (
    <fieldset disabled style={RESET}>
      {children}
    </fieldset>
  );
}
