import { useState } from 'react';
import type { ReactNode } from 'react';
import { Logo } from '../design/components/brand/Logo';
import { Trail } from '../design/components/brand/Trail';
import { Button } from '../design/components/core/Button';
import { Chip, Tag } from '../design/components/core/Chip';
import { Input } from '../design/components/core/Input';
import { Switch } from '../design/components/core/Switch';
import { Card } from '../components/layout/Card';
import { Stack, Row } from '../components/layout/Stack';
import { EntryRow } from '../components/EntryRow';
import { VoteControl } from '../components/VoteControl';
import { Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';
import { EmptyState } from '../components/EmptyState';
import { Toast } from '../components/Toast';
import { Spinner } from '../components/Spinner';
import { PageHeader } from '../components/PageHeader';
import { TabBar } from '../components/TabBar';
import { TrailNav } from '../components/TrailNav';
import type { TrailStep } from '../components/TrailNav';
import styles from './DesignGallery.module.css';

function Section({ index, label, title, children }: { index: string; label: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`section-${index}`}>
      <p className={styles.sectionLabel}>
        {index} {label}
      </p>
      <h2 className={styles.sectionTitle} id={`section-${index}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className={styles.specimen}>
      <p className={styles.specimenLabel}>{label}</p>
      {children}
      {note && <p className={styles.specimenNote}>{note}</p>}
    </div>
  );
}

const COLOR_SWATCHES: Array<{ name: string; token: string; bg: string; fg: string }> = [
  { name: 'Deep leaf', token: '--wend-deep-leaf', bg: 'var(--wend-deep-leaf)', fg: 'var(--text-on-dark)' },
  { name: 'Leaf green', token: '--wend-leaf', bg: 'var(--wend-leaf)', fg: 'var(--text-on-dark)' },
  { name: 'Apricot (non-text)', token: '--wend-apricot', bg: 'var(--wend-apricot)', fg: 'var(--wend-deep-leaf)' },
  { name: 'Murasaki plum (destinations)', token: '--wend-plum', bg: 'var(--wend-plum)', fg: 'var(--text-on-dark)' },
  // Outside the brand palette: feedback only. Paper reads muddy on rust, so the
  // rust caption uses the white the destructive button's text token already is.
  { name: 'Jade (success)', token: '--wend-jade', bg: 'var(--wend-jade)', fg: 'var(--text-on-dark)' },
  { name: 'Rust (error)', token: '--wend-rust', bg: 'var(--wend-rust)', fg: 'var(--action-destructive-text)' },
  { name: 'Paper', token: '--wend-paper', bg: 'var(--wend-paper)', fg: 'var(--text-strong)' },
  { name: 'Card', token: '--wend-card', bg: 'var(--wend-card)', fg: 'var(--text-strong)' },
];

/**
 * /design — every ported and new component, in every state, on one page. This
 * is how the design system port is verified visually without opening the
 * prototype bundle.
 */
export function DesignGallery() {
  const [chipSelected, setChipSelected] = useState<Record<string, boolean>>({ temples: true, food: false, walks: false });
  const [inputValue, setInputValue] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [kept, setKept] = useState<Record<string, boolean>>({ a: true, b: false });
  const [vote, setVote] = useState<number | null>(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState('board');
  const [following, setFollowing] = useState(true);
  const [trailStep, setTrailStep] = useState<TrailStep>('gather');

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <Logo size={44} />
        <h1 className={styles.introTitle}>Design gallery</h1>
        <p className={styles.introBody}>
          Every ported and newly built component, in every state it supports. Tab through it to check focus rings;
          it renders identically whether the Rails API is running or not (MSW fixtures back the app components below).
        </p>
      </div>

      <Section index="01" label="Colour" title="Palette">
        <div className={styles.specimenGrid}>
          {COLOR_SWATCHES.map((c) => (
            <div key={c.name}>
              <div className={styles.swatch} style={{ background: c.bg }}>
                <span className={styles.swatchCaption} style={{ color: c.fg }}>
                  {c.token}
                </span>
              </div>
              <p className={styles.specimenNote}>{c.name}</p>
            </div>
          ))}
        </div>
        <p className={styles.specimenNote}>
          Jade and rust are feedback hues, not brand colours: jade never fills a control, and rust fills exactly one —
          Button variant=&quot;destructive&quot;. Everywhere else they are a border, an icon or text.
        </p>
      </Section>

      <Section index="02" label="Type" title="Scale">
        <Card>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>Display 700/40/1.2</span>
            <span style={{ fontWeight: 700, fontSize: 40, color: 'var(--text-strong)' }}>Six days in Kyoto</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>Title 700/26/1.3</span>
            <span style={{ fontWeight: 700, fontSize: 26, color: 'var(--text-strong)' }}>Kept nine places so far</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>Body 400/17/1.7</span>
            <span style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--text-body)' }}>
              Start wide with a region, then let the map close in.
            </span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>Data 400/17/0.04em</span>
            <span style={{ fontSize: 17, letterSpacing: '0.04em', color: 'var(--text-strong)' }}>
              10:15–11:40 · Platform 3 · Il1 0O
            </span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>Label 700/12/0.12em</span>
            <span
              style={{
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Narrowing · nine places kept
            </span>
          </div>
          <div className={styles.typeRow} style={{ borderBottom: 'none' }}>
            <span className={styles.typeLabel}>Code · DM Mono 400/13</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-body)' }}>
              35.0116° N, 135.7681° E
            </span>
          </div>
        </Card>
      </Section>

      <Section index="03" label="Space & shape" title="Scale">
        <Card>
          <div className={styles.scaleRow}>
            {[8, 12, 16, 24, 32, 48, 64].map((size) => (
              <div key={size} className={styles.scaleBlock} style={{ width: size, height: size }} />
            ))}
          </div>
          <p className={styles.specimenNote}>8 · 12 · 16 · 24 · 32 · 48 · 64</p>
        </Card>
      </Section>

      <Section index="04" label="Brand" title="Logo">
        <div className={styles.specimenGrid}>
          <Specimen label="Primary, on paper">
            <Logo variant="primary" size={40} />
          </Specimen>
          <Specimen label="Reversed, on deep leaf">
            <div className={styles.darkPanel}>
              <Logo variant="reversed" size={40} />
            </div>
          </Specimen>
          <Specimen label="Small (≤28px), thicker stroke" note="showWordmark=false, mark only, min 24px">
            <Row gap={4}>
              <Logo size={28} showWordmark={false} />
              <Logo size={24} showWordmark={false} />
            </Row>
          </Specimen>
        </div>
      </Section>

      <Section index="05" label="Brand" title="Trail · progress">
        <div className={styles.specimenGrid}>
          <Specimen label="Three stops, decorative" note="decided, open (current), waiting">
            <Trail stops={['decided', 'open', 'waiting']} labels={['Step one', 'Step two', 'Step three']} />
          </Specimen>
          <Specimen label="On deep leaf">
            <div className={styles.darkPanel}>
              <Trail onDark stops={['decided', 'open', 'waiting']} labels={['Step one', 'Step two', 'Step three']} />
            </div>
          </Specimen>
          <Specimen label="With destination stop">
            <Trail stops={['decided', 'decided', 'open', 'waiting', 'destination']} />
          </Specimen>
          <Specimen label="TrailNav — real navigation" note={`current: ${trailStep}. Click a decided step to go back.`}>
            <TrailNav current={trailStep} onSelect={setTrailStep} />
            <Row gap={2}>
              {(['brainstorm', 'gather', 'schedule'] as const).map((step) => (
                <Button key={step} variant="quiet" onClick={() => setTrailStep(step)}>
                  {step}
                </Button>
              ))}
            </Row>
          </Specimen>
        </div>
      </Section>

      <Section index="06" label="Core" title="Buttons">
        {/* Every label here names an outcome, because this page is where the
            rule gets read off the screen rather than out of the readme. The
            personality goes in the specimen notes beside them, which is exactly
            where the system says to put it. */}
        <Specimen label="Variants" note="Labels name the outcome; the softening goes in helper text beside the button.">
          <Row wrap>
            <Button variant="primary">Save trip</Button>
            <Button variant="secondary">Add scenic route</Button>
            <Button variant="quiet">Skip</Button>
          </Row>
        </Specimen>
        <Specimen
          label="Destructive"
          note="The only control the error hue fills — a click that destroys something, never one that is merely important. In the product it is exactly one button: taking someone off a trip."
        >
          <Row wrap>
            <Button variant="destructive">Remove them</Button>
          </Row>
        </Specimen>
        <Specimen label="Disabled" note="Fills with --surface-disabled + muted text, never struck through">
          <Row wrap>
            <Button variant="primary" disabled>
              Save trip
            </Button>
            <Button variant="secondary" disabled>
              Add scenic route
            </Button>
            <Button variant="destructive" disabled>
              Remove them
            </Button>
          </Row>
        </Specimen>
        <Specimen label="On dark">
          <div className={styles.darkPanel}>
            <Button variant="onDark">Save trip</Button>
          </div>
        </Specimen>
        <Specimen label="Focus" note="Tab to this button — :focus-visible renders the real 3px apricot outline, 3px offset">
          <Button variant="primary">Tab to me</Button>
        </Specimen>
      </Section>

      <Section index="07" label="Core" title="Chips, tags & input">
        <Specimen label="Filter chips (toggle)">
          <Row wrap>
            {(['temples', 'food', 'walks'] as const).map((key) => (
              <Chip key={key} selected={chipSelected[key]} onClick={() => setChipSelected((s) => ({ ...s, [key]: !s[key] }))}>
                {key === 'temples' ? 'Temples' : key === 'food' ? 'Food' : 'Walks'}
              </Chip>
            ))}
          </Row>
        </Specimen>
        <Specimen label="Saved tag (static)">
          <Tag tone="saved">Saved · 12</Tag>
        </Specimen>
        <Specimen label="Input — rest, filled, hint">
          <Stack gap={3}>
            <Input placeholder="Where are you going?" hint="↵" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
            <Input value="Kyoto" readOnly hint="↵" />
          </Stack>
        </Specimen>
        {/* Both states side by side, plus one that is live: a switch is read by
            where its knob sits, and that only reads as a pair. */}
        <Specimen
          label="Switch — off, on, live"
          note="A setting that takes effect the moment it is flipped — not a filter (Chip) and not a form value (checkbox)."
        >
          <Stack gap={2}>
            <Switch checked={false} onCheckedChange={() => {}}>
              Follow the map
            </Switch>
            <Switch checked onCheckedChange={() => {}}>
              Follow the map
            </Switch>
            <Switch checked={following} onCheckedChange={setFollowing}>
              Follow the map
            </Switch>
          </Stack>
        </Specimen>
        <Specimen label="Field — labelled, error state">
          <Stack gap={4}>
            <Field label="Destination" placeholder="Where are you going?" value={fieldValue} onChange={(e) => setFieldValue(e.target.value)} />
            <Field label="Destination" placeholder="Where are you going?" error="This one needs a name." />
          </Stack>
        </Specimen>
      </Section>

      <Section index="08" label="App" title="Layout: Card, Stack, Row">
        <Specimen label="Card padding inside a Row">
          <Row gap={4} align="start">
            <Card padding={4} bordered>
              <p style={{ margin: 0, color: 'var(--text-body)' }}>Card tone against page tone — the only elevation.</p>
            </Card>
          </Row>
        </Specimen>
      </Section>

      <Section index="09" label="App" title="Place row (EntryRow)">
        <Card padding={2}>
          <Stack gap={1}>
            <EntryRow
              title="Nanzen-ji"
              metadata={['Temple', 'east', '40 min']}
              kept={kept.a ?? false}
              onToggleKeep={(v) => setKept((s) => ({ ...s, a: v }))}
              onSelect={() => {}}
            />
            <EntryRow
              title="Kiyamachi"
              metadata={['Walk', 'river', 'late']}
              kept={kept.b ?? false}
              onToggleKeep={(v) => setKept((s) => ({ ...s, b: v }))}
              onSelect={() => {}}
            />
          </Stack>
        </Card>
      </Section>

      <Section index="10" label="App" title="Vote control">
        <Specimen label="Desire rating, -2..2" note="Reads without a legend: size = strength of feeling, fill = your vote.">
          <VoteControl value={vote} onChange={setVote} onClear={() => setVote(null)} average={0.8} count={5} />
        </Specimen>
      </Section>

      <Section index="11" label="App" title="Feedback: EmptyState, Toast, Spinner">
        <div className={styles.specimenGrid}>
          <Specimen label="Empty state — library">
            <EmptyState message="Nothing kept yet. Saving something is how a trip starts." action={<Button variant="secondary">Save something</Button>} />
          </Specimen>
          <Specimen label="Toast — tones">
            <Stack gap={3}>
              <Toast message="Kept — it's waiting in your shortlist." tone="success" onDismiss={() => {}} />
              <Toast message="That didn't save. Try again." tone="error" onDismiss={() => {}} />
              <Toast message="Kept nine places so far" tone="neutral" />
            </Stack>
          </Specimen>
          <Specimen label="Spinner">
            <Spinner label="Loading trip" />
          </Specimen>
        </div>
      </Section>

      <Section index="12" label="App" title="PageHeader & TabBar">
        <Specimen label="PageHeader with back + actions">
          <PageHeader
            title="Six days in Kyoto"
            description="2 Nov – 8 Nov"
            onBack={() => {}}
            actions={<Button variant="primary">Add idea</Button>}
          />
        </Specimen>
        <Specimen label="TabBar — segmented control, arrow-key navigable">
          <TabBar
            aria-label="Trip sections"
            tabs={[
              { key: 'board', label: 'Board' },
              { key: 'map', label: 'Map' },
              { key: 'schedule', label: 'Schedule' },
              { key: 'checklist', label: 'Checklist' },
            ]}
            activeKey={tab}
            onChange={setTab}
          />
        </Specimen>
      </Section>

      <Section index="13" label="App" title="Modal & Drawer">
        <Row gap={3}>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
        </Row>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Fork this plan?"
          actions={
            <>
              <Button variant="quiet" onClick={() => setModalOpen(false)}>
                Never mind
              </Button>
              {/* The title may wander ("Fork this plan?"); the button may not.
                  "Keep both for now" is the readme's own example of a heading
                  wearing a button's clothes. */}
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Save both
              </Button>
            </>
          }
        >
          <p>Two versions can sit side by side until someone decides.</p>
        </Modal>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Nanzen-ji">
          <p>The entry detail panel slides in as a drawer over the board — no shadow, card tone against a solid overlay.</p>
        </Drawer>
      </Section>
    </div>
  );
}
