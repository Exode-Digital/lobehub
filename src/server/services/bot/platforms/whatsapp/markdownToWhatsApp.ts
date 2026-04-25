/**
 * Convert CommonMark-ish markdown into the lightweight markup WhatsApp
 * understands.
 *
 * Translation table:
 *   `**bold**` / `__bold__`     -> `*bold*`
 *   `*italic*` / `_italic_`     -> `_italic_`
 *   `~~strike~~`                -> `~strike~`
 *   ```code```                  preserved (WhatsApp uses the same triple backticks)
 *   `inline` code               preserved
 *   Headings (`## title`)       -> `*title*` (WhatsApp has no heading concept)
 *   Bullet lists (`- item`)     kept as-is, WhatsApp renders them literally
 *   Links `[text](url)`         -> `text (url)` — WhatsApp doesn't render link syntax
 *
 * The conversion is intentionally conservative: WhatsApp's renderer is
 * lenient with stray `*` / `_` chars, but we still want a recognizable result
 * for both the user and the LLM.
 */
const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const HEADING_RE = /^#{1,6}[ \t]+(\S(?:.*\S)?)[ \t]*$/gm;
const STAR_BOLD_RE = /\*\*([^*\n]+)\*\*/g;
const UNDERSCORE_BOLD_RE = /__([^_\n]+)__/g;
const ITALIC_RE = /(?<![*\\])\*([^*\n]+)\*(?!\*)/g;
const STRIKE_RE = /~~([^~\n]+)~~/g;
const LINK_RE = /\[([^\]]+)\]\((https?:[^\s)]+)\)/g;
const FENCE_TOKEN_RE = /__FENCE_(\d+)__/g;
const INLINE_TOKEN_RE = /__INLINE_(\d+)__/g;
const BOLD_TOKEN_RE = /__BOLD_(\d+)__/g;

export function markdownToWhatsApp(markdown: string): string {
  if (!markdown) return '';

  const fences: string[] = [];
  let work = markdown.replaceAll(FENCE_RE, (block) => {
    fences.push(block);
    return `__FENCE_${fences.length - 1}__`;
  });

  const inlines: string[] = [];
  work = work.replaceAll(INLINE_CODE_RE, (span) => {
    inlines.push(span);
    return `__INLINE_${inlines.length - 1}__`;
  });

  // Stash bold/heading runs as opaque tokens so the italic pass below can't
  // mistake `*X*` (WhatsApp bold) for an italic. We restore them after italics.
  const bolds: string[] = [];
  const stashBold = (text: string): string => {
    bolds.push(text);
    return `__BOLD_${bolds.length - 1}__`;
  };

  work = work.replaceAll(HEADING_RE, (_m, title) => stashBold(`*${title}*`));
  work = work.replaceAll(STAR_BOLD_RE, (_m, inner) => stashBold(`*${inner}*`));
  work = work.replaceAll(UNDERSCORE_BOLD_RE, (_m, inner) => stashBold(`*${inner}*`));

  work = work.replaceAll(ITALIC_RE, '_$1_');
  work = work.replaceAll(STRIKE_RE, '~$1~');

  work = work.replaceAll(LINK_RE, (_m, text, url) => (text === url ? url : `${text} (${url})`));

  work = work.replaceAll(BOLD_TOKEN_RE, (_m, idx) => bolds[Number(idx)] ?? '');
  work = work.replaceAll(INLINE_TOKEN_RE, (_m, idx) => inlines[Number(idx)] ?? '');
  work = work.replaceAll(FENCE_TOKEN_RE, (_m, idx) => fences[Number(idx)] ?? '');

  return work;
}
