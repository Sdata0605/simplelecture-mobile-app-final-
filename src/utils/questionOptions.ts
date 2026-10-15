/**
 * Helpers for displaying MCQ options and correct answers.
 *
 * `options` in the Question Bank can be:
 *   - an object keyed by letter:  { A: 'Vein', B: 'Artery' }
 *   - an object of objects:       { A: { text: 'Vein' } }
 *   - an array:                   ['Vein', 'Artery'] or [{ text: 'Vein' }]
 * Normalize on the client (per the Notes data-fetch spec) — never mutate data.
 */

export interface NormalizedOption {
  key: string;
  text: string;
}

/** Normalize MCQ options that may be { A: 'text' }, { A: { text } }, or ['..']. */
export function normalizeOptions(options: any): NormalizedOption[] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((o, i) => ({
      key: String.fromCharCode(65 + i),
      text: typeof o === 'object' && o ? String(o.text ?? '') : String(o),
    }));
  }
  if (typeof options === 'object') {
    return Object.entries(options).map(([key, val]) => ({
      key,
      text: typeof val === 'object' && val ? String((val as any).text ?? '') : String(val),
    }));
  }
  return [];
}

/**
 * Resolve `correct_answer` against normalized options for display.
 *
 * - If it matches an option KEY (case-insensitive): "B. Artery"
 * - If it matches an option TEXT (case-insensitive): "B. Artery"
 * - Otherwise (no options, or no match): the raw correct_answer string.
 * - Empty/missing answer → ''.
 */
export function resolveCorrectAnswer(
  correctAnswer: string | null | undefined,
  options: NormalizedOption[],
): string {
  const raw = String(correctAnswer ?? '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  // Tolerate label decorations: "B.", "(B)", "B)".
  const bareKey = lower.replace(/^\(?\s*([a-z0-9]+)\s*[\.\)]?$/i, '$1');
  const byKey = options.find(
    (o) => o.key.toLowerCase() === lower || o.key.toLowerCase() === bareKey,
  );
  if (byKey) return `${byKey.key}. ${byKey.text}`;

  const byText = options.find((o) => o.text.trim().toLowerCase() === lower);
  if (byText) return `${byText.key}. ${byText.text}`;

  return raw;
}
