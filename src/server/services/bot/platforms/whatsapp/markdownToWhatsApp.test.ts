import { describe, expect, it } from 'vitest';

import { markdownToWhatsApp } from './markdownToWhatsApp';

describe('markdownToWhatsApp', () => {
  it('converts bold markers to single asterisk', () => {
    expect(markdownToWhatsApp('**hello**')).toBe('*hello*');
    expect(markdownToWhatsApp('__hello__')).toBe('*hello*');
  });

  it('converts italic single-asterisk markers to underscore', () => {
    expect(markdownToWhatsApp('*hello*')).toBe('_hello_');
    expect(markdownToWhatsApp('an *emphasized* word')).toBe('an _emphasized_ word');
  });

  it('converts ~~strike~~ to ~strike~', () => {
    expect(markdownToWhatsApp('~~gone~~')).toBe('~gone~');
  });

  it('converts headings to bold', () => {
    expect(markdownToWhatsApp('## Title here')).toBe('*Title here*');
    expect(markdownToWhatsApp('# H1\ncontent')).toBe('*H1*\ncontent');
  });

  it('preserves fenced code blocks verbatim', () => {
    const input = 'before\n```\nconst x = **not bold**\n```\nafter';
    const expected = 'before\n```\nconst x = **not bold**\n```\nafter';
    expect(markdownToWhatsApp(input)).toBe(expected);
  });

  it('preserves inline code spans verbatim', () => {
    expect(markdownToWhatsApp('use `**flag**` here')).toBe('use `**flag**` here');
  });

  it('renders markdown links as `text (url)`', () => {
    expect(markdownToWhatsApp('see [docs](https://example.com)')).toBe(
      'see docs (https://example.com)',
    );
    expect(markdownToWhatsApp('[https://x.com](https://x.com)')).toBe('https://x.com');
  });

  it('returns empty string for empty input', () => {
    expect(markdownToWhatsApp('')).toBe('');
  });
});
