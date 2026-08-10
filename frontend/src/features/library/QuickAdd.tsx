import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Input } from '../../design/components/core/Input';
import { Row, Stack } from '../../components/layout/Stack';
import { useToast } from '../../components/Toast';
import { useCreateEntry } from '../../api';
import styles from './QuickAdd.module.css';

/**
 * The library's quick-add: paste a link, title it yourself. No unfurling —
 * doc/assumptions.md A0b cuts that from the MVP — so the URL is stored
 * exactly as pasted and the title is always typed, never guessed.
 */
export function QuickAdd() {
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    createEntry.mutate(
      { entry: { kind: 'idea', title: trimmedTitle, source_url: url.trim() || null } },
      {
        onSuccess: () => {
          setUrl('');
          setTitle('');
          show('Kept.', 'success');
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  return (
    <Stack gap={2} className={styles.wrap}>
      <Row gap={2} wrap>
        <Input
          className={styles.urlInput}
          placeholder="Paste a link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Paste a link"
        />
        <Input
          className={styles.titleInput}
          placeholder="Give it a title"
          hint="↵"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          aria-label="Give it a title"
        />
      </Row>
      <Button onClick={save} disabled={!title.trim() || createEntry.isPending}>
        Keep it
      </Button>
    </Stack>
  );
}
