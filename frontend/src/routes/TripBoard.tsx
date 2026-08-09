import { useParams } from 'react-router-dom';
import { PlaceholderScreen } from './PlaceholderScreen';

/** /trips/:id — Planning board: idea tree, filters, bundles, votes. Desktop-first. */
export function TripBoard() {
  const { id } = useParams();
  return (
    <PlaceholderScreen
      title={`Trip #${id}`}
      description="The planning board: ideas, bundles, votes."
      message="This one's still a daydream. Add the first thing you'd like to do."
    />
  );
}
