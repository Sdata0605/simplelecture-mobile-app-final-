/**
 * Pure helper for building a safe PDF file name from a topic title.
 *
 * No React Native imports — must stay loadable in the node-only Jest harness.
 */

const MAX_BASE_NAME_LENGTH = 80;

/**
 * Build a sanitized base file name (WITHOUT the .pdf extension) such as
 * "Chemical Reactions and Equations Notes".
 *
 * The extension is intentionally omitted: Android's Storage Access Framework
 * appends the extension from the MIME type, and passing "X.pdf" can yield
 * "X.pdf.pdf" on some document providers.
 */
export function sanitizePdfBaseName(topicTitle: string | null | undefined): string {
  const cleaned = (topicTitle ?? '')
    // Characters invalid or troublesome in file names across providers
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=.]/g, ' ')
    // Control characters
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Leading/trailing dots confuse some providers
    .replace(/^\.+|\.+$/g, '')
    .trim();

  const base = cleaned.length > 0 ? cleaned : 'Study Notes';
  const withSuffix = /notes$/i.test(base) ? base : `${base} Notes`;
  return withSuffix.slice(0, MAX_BASE_NAME_LENGTH).trim();
}
