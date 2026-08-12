/**
 * What a board drop target puts in `over.data.current`.
 *
 * There is one kind of drop target on the board now: a bundle that already
 * exists (BundleCard, which writes `{ bundleId, title }` into its droppable
 * data). This used to be a union — the dashed "drop ideas here to start a
 * bundle" box carried `{ newBundle: true }` and TripBoard's `onDragEnd`
 * narrowed on it — and that arm went when the box did. Starting a bundle is now
 * a named act, a form at the top of the rail, rather than a target you can miss
 * by twenty pixels and end up holding a bundle you never asked for.
 *
 * The shape stays a named type in a file of its own rather than an inline
 * annotation inside `onDragEnd`, because it is a contract between two files
 * that never import each other: the card writes it, the board reads it. Spelled
 * out twice, that is exactly the pair that drifts.
 *
 * Both fields are optional on purpose. `over.data.current` is whatever a
 * droppable happened to put there — dnd-kit does not type it for us — so the
 * handler still has to check before it trusts, and a type that promised these
 * were always present would quietly turn that check into dead code.
 */
export interface BundleDropData {
  /** The bundle the idea was dropped on. */
  bundleId?: number;
  /** That bundle's own title, for the confirmation toast. */
  title?: string;
}
