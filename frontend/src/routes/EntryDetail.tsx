import { useNavigate, useParams } from 'react-router-dom';
import { Drawer } from '../components/Drawer';

/** /entries/:id — Detail panel, a drawer over the board (architecture.md §6). */
export function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <Drawer open title={`Entry #${id}`} onClose={() => navigate(-1)}>
      <p>The entry detail view is built in Phase 3, on top of this Drawer primitive.</p>
    </Drawer>
  );
}
