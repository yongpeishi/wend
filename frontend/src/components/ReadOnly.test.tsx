import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadOnly } from './ReadOnly';
import { TripRoleProvider } from '../auth/TripRoleContext';

function Fields() {
  return (
    <>
      <p>Six days in Kyoto</p>
      <input aria-label="Title" defaultValue="Nanzen-ji" />
      <button type="button">Save</button>
    </>
  );
}

describe('ReadOnly', () => {
  it('renders a bare fragment when you can edit — no wrapper in the way', () => {
    const { container } = render(
      <ReadOnly canEdit>
        <Fields />
      </ReadOnly>,
    );
    expect(container.querySelector('fieldset')).toBeNull();
    expect(screen.getByLabelText('Title')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('wraps in a disabled fieldset when you cannot', () => {
    const { container } = render(
      <ReadOnly canEdit={false}>
        <Fields />
      </ReadOnly>,
    );
    expect(container.querySelector('fieldset')).toBeDisabled();
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('leaves the content readable — a viewer still sees everything', () => {
    render(
      <ReadOnly canEdit={false}>
        <Fields />
      </ReadOnly>,
    );
    expect(screen.getByText('Six days in Kyoto')).toBeVisible();
    expect(screen.getByLabelText('Title')).toHaveValue('Nanzen-ji');
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('takes the fieldset box out of the layout so nothing shifts', () => {
    const { container } = render(
      <ReadOnly canEdit={false}>
        <Fields />
      </ReadOnly>,
    );
    // `border` is left out: jsdom does not round-trip the shorthand.
    expect(container.querySelector('fieldset')).toHaveStyle({
      display: 'contents',
      margin: '0px',
      padding: '0px',
    });
  });

  it('falls back to the trip role when given no prop', () => {
    const { container } = render(
      <TripRoleProvider role="viewer">
        <ReadOnly>
          <Fields />
        </ReadOnly>
      </TripRoleProvider>,
    );
    expect(container.querySelector('fieldset')).toBeDisabled();
  });

  it('is editable with no provider at all — /library and / are yours', () => {
    const { container } = render(
      <ReadOnly>
        <Fields />
      </ReadOnly>,
    );
    expect(container.querySelector('fieldset')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('lets a member edit and holds a viewer off, through the provider', () => {
    const { container, rerender } = render(
      <TripRoleProvider role="member">
        <ReadOnly>
          <Fields />
        </ReadOnly>
      </TripRoleProvider>,
    );
    expect(container.querySelector('fieldset')).toBeNull();

    rerender(
      <TripRoleProvider role="viewer">
        <ReadOnly>
          <Fields />
        </ReadOnly>
      </TripRoleProvider>,
    );
    expect(container.querySelector('fieldset')).toBeDisabled();
  });
});
