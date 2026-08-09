import { useParams } from 'react-router-dom';
import { PlaceholderScreen } from './PlaceholderScreen';

/** /trips/:id/schedule — Hourly day plan. Mobile-first, high contrast for outdoor reading. */
export function TripSchedule() {
  const { id } = useParams();
  return (
    <PlaceholderScreen
      title={`Trip #${id} · Schedule`}
      description="The hour-by-hour plan for each day."
      message="Nothing placed yet. Drag something over from your ideas."
    />
  );
}
