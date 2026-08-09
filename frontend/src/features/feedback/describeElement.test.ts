import { afterEach, describe, expect, it } from 'vitest';
import { MAX_LABEL_LENGTH, describeElement, labelFor, selectorFor } from './describeElement';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('selectorFor', () => {
  it('stops at an id, because an id makes every ancestor redundant', () => {
    const host = mount('<section><div id="board"><span>Kyoto</span></div></section>');
    const span = host.querySelector('span')!;
    expect(selectorFor(span)).toBe('#board > span:nth-child(1)');
  });

  it('prefers data-testid over positional guessing', () => {
    const host = mount('<div><button data-testid="set-aside">Set aside</button></div>');
    const button = host.querySelector('button')!;
    expect(selectorFor(button)).toBe('button[data-testid="set-aside"]');
  });

  it('falls back to nth-child, which counts siblings of any tag from 1', () => {
    const host = mount('<div id="list"><p>one</p><p>two</p><p>three</p></div>');
    const third = host.querySelectorAll('p')[2]!;
    expect(selectorFor(third)).toBe('#list > p:nth-child(3)');
  });

  it('never emits a CSS-module class name — those are rehashed on every build', () => {
    const host = mount('<div id="root"><button class="_button_a1b2c3 _primary_d4e5">Go</button></div>');
    const button = host.querySelector('button')!;
    const selector = selectorFor(button);
    expect(selector).not.toContain('_button_a1b2c3');
    expect(selector).not.toContain('.');
  });

  it('caps depth so a deep tree yields a locator, not an essay', () => {
    const host = mount('<div><div><div><div><div><div><div><em>deep</em></div></div></div></div></div></div></div>');
    const em = host.querySelector('em')!;
    expect(selectorFor(em).split(' > ')).toHaveLength(5);
  });

  it('produces a selector that actually finds the element again', () => {
    const host = mount('<main id="page"><ul><li>A</li><li>B</li></ul></main>');
    const target = host.querySelectorAll('li')[1]!;
    expect(document.querySelector(selectorFor(target))).toBe(target);
  });

  it('ignores an id that is not a safe bare identifier', () => {
    const host = mount('<div id="outer"><div id="123-starts-with-digit"><b>x</b></div></div>');
    const b = host.querySelector('b')!;
    expect(selectorFor(b)).not.toContain('#123');
  });
});

describe('labelFor', () => {
  it('uses the accessible name for an icon-only control', () => {
    const host = mount('<button aria-label="Dismiss"><svg /></button>');
    expect(labelFor(host.querySelector('button')!)).toBe('Dismiss');
  });

  it('uses visible text when there is no aria-label', () => {
    const host = mount('<button>Set aside</button>');
    expect(labelFor(host.querySelector('button')!)).toBe('Set aside');
  });

  it('collapses the whitespace that JSX indentation leaves behind', () => {
    const host = mount('<div>\n   Nanzen-ji\n   temple\n</div>');
    expect(labelFor(host.querySelector('div')!)).toBe('Nanzen-ji temple');
  });

  it('falls back to a placeholder for an empty input', () => {
    const host = mount('<input placeholder="Where to?" />');
    expect(labelFor(host.querySelector('input')!)).toBe('Where to?');
  });

  it('falls back to the tag name when there is nothing nameable', () => {
    const host = mount('<div><span></span></div>');
    expect(labelFor(host.querySelector('span')!)).toBe('<span>');
  });

  it('truncates a long label with an ellipsis', () => {
    const host = mount(`<p>${'a'.repeat(200)}</p>`);
    const label = labelFor(host.querySelector('p')!);
    expect(label).toHaveLength(MAX_LABEL_LENGTH);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('describeElement', () => {
  it('returns both halves of the capture', () => {
    const host = mount('<div id="wrap"><button>Save</button></div>');
    expect(describeElement(host.querySelector('button')!)).toEqual({
      selector: '#wrap > button:nth-child(1)',
      label: 'Save',
    });
  });
});
