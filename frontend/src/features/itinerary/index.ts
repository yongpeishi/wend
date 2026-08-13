// The itinerary screen's parts. Everything here is presentational: values
// arrive as props, actions leave as callbacks, and nothing fetches. The route
// container (src/routes/TripItinerary.tsx) is what binds them to the API.
//
// Components that take part in dragging — DayRow, DayCard, UnplacedRail — must
// be rendered inside a @dnd-kit <DndContext>.

export {
  buildDayList,
  dayHours,
  daySummary,
  formatDuration,
  formatSpan,
  nextFreeSlot,
  withGaps,
  MIN_GAP_MINUTES,
  UNSAVED_VERSION_ID,
} from './itineraryModel';
export type { ItineraryDay, Row } from './itineraryModel';

export { dayDroppableId, useDayDrop } from './useDayDrop';
export type { ItineraryDragData } from './useDayDrop';

export { DatesGate } from './DatesGate';
export type { DatesGateProps } from './DatesGate';

export { ItineraryHeader } from './ItineraryHeader';
export type { ItineraryHeaderProps } from './ItineraryHeader';

export { DayRow } from './DayRow';
export type { DayRowProps } from './DayRow';

export { DayCard } from './DayCard';
export type { DayCardProps } from './DayCard';

export { DayStateDot } from './DayStateDot';
export type { DayStateDotProps } from './DayStateDot';

export { LodgingPill } from './LodgingPill';
export type { LodgingPillProps } from './LodgingPill';

export { LodgingEditor } from './LodgingEditor';
export type { LodgingEditorProps, LodgingValue } from './LodgingEditor';

export { BundleBand } from './BundleBand';
export type { BundleBandProps } from './BundleBand';

export { ItemLine } from './ItemLine';
export type { ItemLineProps } from './ItemLine';

export { GapRow } from './GapRow';
export type { GapRowProps, GapRowValue } from './GapRow';

export { VersionItems } from './VersionItems';
export type { VersionItemsProps } from './VersionItems';

export { VersionColumns } from './VersionColumns';
export type { VersionColumnsProps } from './VersionColumns';

export { AddPicker } from './AddPicker';
export type { AddPickerProps } from './AddPicker';

export { TimeEditor } from './TimeEditor';
export type { TimeEditorProps } from './TimeEditor';

export { UnplacedRail } from './UnplacedRail';
export type { UnplacedRailProps } from './UnplacedRail';

export { ArchivedPanel } from './ArchivedPanel';
export type { ArchivedPanelProps, ArchivedVersion } from './ArchivedPanel';
