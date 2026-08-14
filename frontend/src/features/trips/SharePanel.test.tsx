import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { server } from '../../mocks/server';
import { db, setRole } from '../../mocks/db';
import { SharePanel } from './SharePanel';

// Integration test: the real hooks against the MSW fixtures, exactly as the app
// runs standalone. The signed-in user is set on the mock store directly — auth
// is not what is under test here, and roles are varied with setRole(), which
// the setup file's resetDb() puts back after every test.

const TRIP = 1;
const DEMO = 1;
const SARAH = 2;

const AMBIGUOUS_ADD =
  'If someone is here under that email, the trip will be waiting for them next time they sign in. If not, nothing happens.';

function renderPanel(onClose: () => void = () => {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SharePanel open onClose={onClose} tripId={TRIP} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function rowFor(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement;
}

async function addSomeone(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Add someone by email'), email);
  await user.click(screen.getByRole('button', { name: 'Add them' }));
}

beforeEach(() => {
  db.currentUserId = DEMO;
});

describe('SharePanel', () => {
  it('lists who is on the trip, what each of them can do, and marks you', async () => {
    setRole(TRIP, SARAH, 'viewer');
    renderPanel();

    const sarah = await screen.findByText('Sarah');
    expect(sarah).toBeInTheDocument();

    const mine = rowFor('Demo Traveler');
    expect(within(mine).getByText('you')).toBeInTheDocument();
    expect(
      within(mine).getByText(
        'Started this trip. Can bring people on, change what they can do, and set the trip aside.',
      ),
    ).toBeInTheDocument();

    expect(
      within(rowFor('Sarah')).getByText('Can read everything here, and leaves it as they found it.'),
    ).toBeInTheDocument();
  });

  it('shows an address when the server sends one', async () => {
    setRole(TRIP, SARAH, 'member');
    renderPanel();

    expect(await screen.findByText('sarah@wend.app')).toBeInTheDocument();
    expect(screen.getByText('demo@wend.app')).toBeInTheDocument();
  });

  it('hides addresses from a viewer without leaving a gap where they were', async () => {
    db.currentUserId = SARAH;
    setRole(TRIP, SARAH, 'viewer');
    renderPanel();

    expect(await screen.findByText('Demo Traveler')).toBeInTheDocument();
    expect(screen.queryByText('demo@wend.app')).not.toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('says so plainly when you are the only one here', async () => {
    renderPanel();
    expect(await screen.findByText('Just you on this so far.')).toBeInTheDocument();
  });

  it('adds someone by email and leaves the outcome on screen, not in a toast', async () => {
    renderPanel();
    await screen.findByText('Just you on this so far.');

    await addSomeone('sarah@wend.app');

    expect(await screen.findByText(AMBIGUOUS_ADD)).toBeInTheDocument();
    // The list is what tells you it worked. The note never does.
    expect(await screen.findByText('Sarah')).toBeInTheDocument();
    expect((screen.getByLabelText('Add someone by email') as HTMLInputElement).value).toBe('');
  });

  it('says exactly the same thing whether the address matched someone or nobody', async () => {
    renderPanel();
    await screen.findByText('Just you on this so far.');

    await addSomeone('sarah@wend.app');
    const matched = (await screen.findByText(AMBIGUOUS_ADD)).textContent;

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Add someone by email'), 'nobody@nowhere.test');
    await user.click(screen.getByRole('button', { name: 'Add them' }));
    const unmatched = (await screen.findByText(AMBIGUOUS_ADD)).textContent;

    expect(unmatched).toBe(matched);
    expect(unmatched).toBe(AMBIGUOUS_ADD);
  });

  it('clears the note as soon as the address it was about is typed over', async () => {
    renderPanel();
    await screen.findByText('Just you on this so far.');

    await addSomeone('sarah@wend.app');
    expect(await screen.findByText(AMBIGUOUS_ADD)).toBeInTheDocument();

    await userEvent.setup().type(screen.getByLabelText('Add someone by email'), 'x');
    expect(screen.queryByText(AMBIGUOUS_ADD)).not.toBeInTheDocument();
  });

  it('asks before it takes someone off, and does nothing until you say so again', async () => {
    setRole(TRIP, SARAH, 'member');
    renderPanel();
    await screen.findByText('Sarah');

    const user = userEvent.setup();
    await user.click(within(rowFor('Sarah')).getByRole('button', { name: 'Take them off' }));

    expect(
      screen.getByText('Take Sarah off this trip? Everything they added stays.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sarah')).toBeInTheDocument();

    // Backing out leaves her exactly where she was.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Take Sarah off this trip? Everything they added stays.')).not.toBeInTheDocument();
    expect(screen.getByText('Sarah')).toBeInTheDocument();

    await user.click(within(rowFor('Sarah')).getByRole('button', { name: 'Take them off' }));
    await user.click(screen.getByRole('button', { name: 'Take them off' }));

    await waitFor(() => expect(screen.queryByText('Sarah')).not.toBeInTheDocument());
  });

  it('asks before handing the trip over, then steps you back to member', async () => {
    setRole(TRIP, SARAH, 'member');
    renderPanel();
    await screen.findByText('Sarah');

    const user = userEvent.setup();
    await user.click(within(rowFor('Sarah')).getByRole('button', { name: 'Hand the trip to them' }));
    expect(
      screen.getByText("Hand this trip to Sarah? You'll stay on as someone who can edit."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hand the trip to them' }));

    await waitFor(() =>
      expect(
        within(rowFor('Sarah')).getByText(
          'Started this trip. Can bring people on, change what they can do, and set the trip aside.',
        ),
      ).toBeInTheDocument(),
    );
    // You are a member now, so leaving is suddenly something you can do.
    expect(within(rowFor('Demo Traveler')).getByRole('button', { name: 'Leave this trip' })).toBeInTheDocument();
  });

  it('lets an owner change what someone can do', async () => {
    setRole(TRIP, SARAH, 'viewer');
    renderPanel();
    await screen.findByText('Sarah');

    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('What Sarah can do'), 'member');

    await waitFor(() =>
      expect(
        within(rowFor('Sarah')).getByText('Can add, change and rearrange everything here, and bring others along.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows a member no owner-only affordances, only their own way out', async () => {
    db.currentUserId = SARAH;
    setRole(TRIP, SARAH, 'member');
    renderPanel();
    await screen.findByText('Demo Traveler');

    expect(screen.queryByRole('button', { name: 'Take them off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hand the trip to them' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('What Demo Traveler can do')).not.toBeInTheDocument();

    expect(within(rowFor('Sarah')).getByRole('button', { name: 'Leave this trip' })).toBeInTheDocument();
    // A member may still bring someone along.
    expect(screen.getByLabelText('Add someone by email')).toBeInTheDocument();
  });

  it('shows a viewer no way to change anything, including who is here', async () => {
    db.currentUserId = SARAH;
    setRole(TRIP, SARAH, 'viewer');
    renderPanel();
    await screen.findByText('Demo Traveler');

    expect(screen.queryByRole('button', { name: 'Take them off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hand the trip to them' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add someone by email')).not.toBeInTheDocument();
    expect(within(rowFor('Sarah')).getByRole('button', { name: 'Leave this trip' })).toBeInTheDocument();
  });

  it('asks before you leave, in your own words', async () => {
    db.currentUserId = SARAH;
    setRole(TRIP, SARAH, 'viewer');
    renderPanel();
    await screen.findByText('Demo Traveler');

    await userEvent.setup().click(within(rowFor('Sarah')).getByRole('button', { name: 'Leave this trip' }));
    expect(
      screen.getByText("Leave this trip? You'll lose sight of it unless someone brings you back."),
    ).toBeInTheDocument();
  });

  it('passes the server refusal on when a removal is not allowed', async () => {
    setRole(TRIP, SARAH, 'member');
    server.use(
      http.delete('/api/trips/:tripId/collaborators/:userId', () =>
        HttpResponse.json(
          { error: 'You started this trip, so it needs you until someone else takes it on.' },
          { status: 403 },
        ),
      ),
    );
    renderPanel();
    await screen.findByText('Sarah');

    const user = userEvent.setup();
    await user.click(within(rowFor('Sarah')).getByRole('button', { name: 'Take them off' }));
    await user.click(screen.getByRole('button', { name: 'Take them off' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You started this trip, so it needs you until someone else takes it on.',
    );
    expect(screen.getByText('Sarah')).toBeInTheDocument();
  });

  it('keeps focus in the email field while you type', async () => {
    renderPanel();
    await screen.findByText('Just you on this so far.');

    const field = screen.getByLabelText('Add someone by email');
    await userEvent.setup().type(field, 'sarah@wend.app');
    expect(document.activeElement).toBe(field);
  });

  it('closes on Escape and clears the draft it was holding', async () => {
    let closed = false;
    renderPanel(() => {
      closed = true;
    });
    await screen.findByText('Just you on this so far.');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Add someone by email'), 'someone@example.com');
    await user.keyboard('{Escape}');

    expect(closed).toBe(true);
    expect((screen.getByLabelText('Add someone by email') as HTMLInputElement).value).toBe('');
  });
});
