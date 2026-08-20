import React from 'react';
import { Card } from '../core/Card.jsx';
import { Label } from '../core/Label.jsx';
import { KeepToggle } from '../core/KeepToggle.jsx';

export function PlaceCard({ name, meta, note, kept = false, onToggle, ...rest }) {
  return (
    <Card bordered padding="var(--space-3)" {...rest}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-2)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body-size)', color: 'var(--text-strong)', lineHeight: 1.35 }}>{name}</span>
          {meta && <Label>{meta}</Label>}
          {note && <span style={{ fontSize: 'var(--text-small-size)', lineHeight: 1.6, color: 'var(--text-body)' }}>{note}</span>}
        </div>
        <KeepToggle kept={kept} onToggle={onToggle} label={'Keep ' + (name || 'this')} />
      </div>
    </Card>
  );
}
