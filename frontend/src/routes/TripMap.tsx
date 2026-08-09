import { useParams } from 'react-router-dom';
import { PlaceholderScreen } from './PlaceholderScreen';

/** /trips/:id/map — Map view, filter scheduled vs potential. Desktop-first. */
export function TripMap() {
  const { id } = useParams();
  return (
    <PlaceholderScreen
      title={`Trip #${id} · Map`}
      description="Everywhere you've kept, scheduled and potential."
      message="Nothing on the map yet. Ideas with a place will show up here."
    />
  );
}
