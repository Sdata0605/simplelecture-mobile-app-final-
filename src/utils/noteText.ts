/**
 * Text-cleaning utilities for AI Study Notes.
 *
 * These are pure functions with no side effects so they can be unit-tested easily.
 */

/**
 * Strip SSML/HTML-style tags (e.g. <speak>, <break time="1s"/>, <emphasis>)
 * without destroying normal readable text.
 *
 * Preserves text between tags; collapses excess whitespace.
 */
export function stripSpeechMarkup(value: string): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')   // remove all tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ') // collapse inline whitespace
    .trim();
}

/**
 * Safely convert any value to a displayable string.
 * Never returns "[object Object]".
 *
 * - null / undefined → ''
 * - string → stripped
 * - number / boolean → String(value)
 * - array → each element joined with '\n'
 * - object → tries common text fields; falls back to joining string values
 */
export function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return stripSpeechMarkup(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => toDisplayString(item))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Try well-known text-carrier fields first
    for (const key of ['text', 'content', 'title', 'value', 'label', 'name', 'body']) {
      if (typeof obj[key] === 'string' && obj[key]) {
        return stripSpeechMarkup(obj[key] as string);
      }
    }
    // Fallback: join all string leaf values
    const parts = Object.values(obj)
      .filter((v) => typeof v === 'string')
      .map((v) => stripSpeechMarkup(v as string))
      .filter(Boolean);
    return parts.join(' ');
  }
  return '';
}

/**
 * Clean a narration text for on-screen display:
 * - Strip SSML/HTML tags
 * - Preserve paragraph breaks (double newlines)
 * - Split very long paragraphs at sentence boundaries to keep ≤ 400 chars per paragraph
 * - Remove blank paragraphs
 */
export function cleanNarrationText(value: string): string {
  if (!value || typeof value !== 'string') return '';
  const stripped = stripSpeechMarkup(value);

  // Honour existing paragraph breaks
  const rawParagraphs = stripped
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  const result: string[] = [];
  for (const para of rawParagraphs) {
    if (para.length <= 400) {
      result.push(para);
      continue;
    }
    // Split at sentence boundaries (period/exclamation/question followed by space)
    const sentences = para.split(/(?<=[.!?])\s+/);
    let current = '';
    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length <= 400) {
        current = candidate;
      } else {
        if (current) result.push(current.trim());
        // If a single sentence is still > 400 chars, push it whole
        current = sentence;
      }
    }
    if (current.trim()) result.push(current.trim());
  }

  return result.join('\n\n');
}
