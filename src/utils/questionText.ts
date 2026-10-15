/**
 * Utilities for cleaning up question text before display.
 *
 * Some MCQ questions arrive with the answer choices already listed inline in the
 * question text (e.g. "- (a) OH⁻  - (b) H⁺ ...") AND also as separate selectable
 * options. Showing both is redundant, so we strip the inline enumerated choices
 * from the question text — but only when they clearly match the actual options,
 * so legitimate question content is never removed.
 */

/** Pull plain text values out of any supported options shape. */
function extractOptionTexts(options: any): string[] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((o) =>
      o && typeof o === 'object' ? String((o as any).text ?? '') : String(o ?? ''),
    );
  }
  if (typeof options === 'object') {
    return Object.values(options).map((v) =>
      v && typeof v === 'object' ? String((v as any).text ?? '') : String(v ?? ''),
    );
  }
  return [];
}

/** Reduce a string to comparable letters/numbers only (drops LaTeX, sub/superscripts, spaces, punctuation). */
function normalizeForMatch(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/\\[a-z]+/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// Matches a line that starts with an enumerated option label:
//   "- (a) ...", "(b) ...", "c) ...", "D. ...", "1) ..."
const OPTION_LINE_RE = /^\s*(?:[-*•]\s*)?(?:\(([a-zA-Z0-9])\)|([a-zA-Z0-9])[.)])\s+(.*)$/;

// A bare label line such as "Options:" or "Choose the correct option:".
const OPTION_HEADER_RE = /^\s*(options?|choose[^:]*|select[^:]*)\s*:?\s*$/i;

/**
 * Remove inline enumerated answer choices from an MCQ question's text.
 * Only lines whose content matches one of the provided option values are removed,
 * and only when at least two such lines are found (a real MCQ), so this is a no-op
 * for clean questions and non-MCQ questions.
 */
export function stripEmbeddedOptions(text: string | null | undefined, options?: any): string {
  if (!text) return '';

  const optionSet = new Set(
    extractOptionTexts(options).map(normalizeForMatch).filter(Boolean),
  );
  if (optionSet.size === 0) return text;

  const lines = text.split(/\r?\n/);
  const keep: boolean[] = lines.map(() => true);

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPTION_LINE_RE);
    if (!m) continue;
    const content = normalizeForMatch(m[3] ?? '');
    if (content && optionSet.has(content)) {
      keep[i] = false;
    }
  }

  const removedCount = keep.filter((k) => !k).length;
  if (removedCount < 2) return text;

  // Drop a trailing "Options:" header that directly precedes a removed block.
  for (let i = 0; i < lines.length - 1; i++) {
    if (keep[i] && !keep[i + 1] && OPTION_HEADER_RE.test(lines[i])) {
      keep[i] = false;
    }
  }

  const cleaned = lines
    .filter((_, i) => keep[i])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned || text;
}

// ---------------------------------------------------------------------------
// Markdown image tokens
// ---------------------------------------------------------------------------

export interface QuestionTextParts {
  /** Text with ALL markdown image tokens removed (blank lines collapsed). */
  text: string;
  /** Renderable image URLs extracted from tokens (absolute http/https only). */
  images: string[];
}

/** Pull the URL out of a markdown image target: `url`, `<url>`, or `url "title"`. */
function targetToUrl(target: string): string {
  let t = target.trim();
  if (t.startsWith('<')) {
    const end = t.indexOf('>');
    t = end === -1 ? t.slice(1) : t.slice(1, end);
  } else {
    // Title (if any) starts at the first whitespace followed by a quote.
    const m = t.match(/\s+["'(]/);
    if (m && m.index !== undefined) t = t.slice(0, m.index);
    else t = t.split(/\s+/)[0] ?? '';
  }
  return t.trim();
}

/**
 * Remove markdown image tokens (`![alt](target)`) from question/option/
 * explanation text. Tokens pointing at a real http(s) URL are returned in
 * `images` so the caller can render the actual image; tokens with unusable
 * targets (bare filenames like `aa80c…_img.jpg`, empty, relative paths) are
 * silently dropped — the raw token text must never reach the screen.
 *
 * Uses a small scanner (not a regex) so it correctly handles:
 * - URLs containing parentheses (nested-paren depth tracking)
 * - tokens whose alt/target spans multiple lines
 * - malformed, never-closed tokens (removed to end of line so raw markup
 *   still cannot leak)
 *
 * Display-time only: never mutates stored data.
 */
export function extractImageTokens(text: string | null | undefined): QuestionTextParts {
  const raw = text ?? '';
  if (!raw || raw.indexOf('![') === -1) return { text: raw, images: [] };

  const images: string[] = [];
  let out = '';
  let pos = 0;
  let i = raw.indexOf('![');

  while (i !== -1) {
    out += raw.slice(pos, i);

    const altEnd = raw.indexOf(']', i + 2);
    if (altEnd === -1 || raw[altEnd + 1] !== '(') {
      if (altEnd === -1) {
        // "![" with no closing bracket at all — malformed; drop to end of line.
        const lineEnd = raw.indexOf('\n', i);
        pos = lineEnd === -1 ? raw.length : lineEnd + 1;
      } else {
        // "![alt]" without "(" — not an image token; keep it verbatim.
        out += raw.slice(i, altEnd + 1);
        pos = altEnd + 1;
      }
    } else {
      // Scan the target with paren-depth tracking (URLs may contain parens).
      let depth = 1;
      let j = altEnd + 2;
      while (j < raw.length && depth > 0) {
        if (raw[j] === '(') depth++;
        else if (raw[j] === ')') depth--;
        j++;
      }
      if (depth === 0) {
        const url = targetToUrl(raw.slice(altEnd + 2, j - 1));
        if (/^https?:\/\//i.test(url)) images.push(url);
        pos = j;
      } else {
        // Never-closed "](" — malformed; drop to end of line so it can't leak.
        const lineEnd = raw.indexOf('\n', i);
        pos = lineEnd === -1 ? raw.length : lineEnd + 1;
      }
    }

    i = raw.indexOf('![', pos);
  }
  out += raw.slice(pos);

  const cleaned = out
    // Tidy leftovers: stray spaces around removals, then runs of blank lines.
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: cleaned, images };
}
