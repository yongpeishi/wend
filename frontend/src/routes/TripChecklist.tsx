import { useParams } from 'react-router-dom';
import { PlaceholderScreen } from './PlaceholderScreen';

/** /trips/:id/checklist — Unified todo view. Mobile-first. */
export function TripChecklist() {
  const { id } = useParams();
  return (
    <PlaceholderScreen
      title={`Trip #${id} · Checklist`}
      description="Trip-level todos and everything hanging off an idea."
      message="Nothing to check off yet."
    />
  );
}
