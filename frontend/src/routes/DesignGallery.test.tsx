import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesignGallery } from './DesignGallery';

// A smoke test: every ported/new component renders together on one page
// without throwing, and the section landmarks are all present.
describe('DesignGallery', () => {
  it('renders every section without error', () => {
    render(<DesignGallery />);
    expect(screen.getByRole('heading', { name: 'Design gallery' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trail · progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Buttons' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vote control' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Modal & Drawer' })).toBeInTheDocument();
  });

  it('opens the modal from its trigger button', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<DesignGallery />);
    await userEvent.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(screen.getByRole('dialog', { name: 'Fork this plan?' })).toBeInTheDocument();
  });
});
