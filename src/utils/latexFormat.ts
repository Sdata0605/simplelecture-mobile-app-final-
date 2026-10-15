/**
 * Pure LaTeX/markdown text helpers shared by chat and content renderers.
 *
 * No React Native imports — this module must stay loadable in the node-only
 * Jest harness. WebView/KaTeX HTML shells live in components (MathText.tsx);
 * only string detection/transforms belong here.
 */

/** True when the text contains LaTeX commands or math delimiters. */
export const containsLatex = (text: string): boolean => {
  const latexPatterns = [
    /\$\$.+?\$\$/s,
    /\$.+?\$/,
    /\\\(.+?\\\)/s,
    /\\\[.+?\\\]/s,
    /\\frac/,
    /\\sqrt/,
    /\\sum/,
    /\\int/,
    /\\ce\{/,
    /\\alpha|\\beta|\\gamma|\\delta|\\theta|\\lambda|\\mu|\\sigma|\\omega/,
    /\\times|\\div|\\pm|\\cdot|\\rightarrow|\\to/,
    /\^{.+?}|_{.+?}/,
    /\\text{/,
    /\\mathbf|\\mathrm|\\mathit/,
    /\\left|\\right/,
    /\\begin|\\end/,
  ];
  return latexPatterns.some(pattern => pattern.test(text));
};

/**
 * Detects whether content already carries math delimiters that KaTeX
 * auto-render understands ($...$, $$...$$, \(...\), \[...\]).
 */
export const hasMathDelimiters = (text: string): boolean =>
  /\$.+?\$|\\\(.+?\\\)|\\\[.+?\\\]/s.test(text);

/** Normalize Mathpix-style \( \) / \[ \] delimiters into $ / $$. */
export function convertMathpixToStandard(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(/\\\(/g, () => '$').replace(/\\\)/g, () => '$');
  // Replacement callbacks avoid replace()'s special '$' handling in strings.
  result = result.replace(/\\\[/g, () => '$$').replace(/\\\]/g, () => '$$');
  return result;
}

/** Escape text for embedding in the KaTeX HTML shell ($ and \ are kept). */
export function escapeHtml(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/**
 * Best-effort plain-text rendering of LaTeX-bearing content — the fallback
 * when the WebView renderer fails or times out, and for suggestion chips.
 * Preserves newlines and markdown markers; only math noise is cleaned up.
 */
export function stripLatexToPlainText(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .map(line =>
      line
        .replace(/\$\$(.*?)\$\$/g, '$1')
        .replace(/\$(.*?)\$/g, '$1')
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\ce\{([^}]*)\}/g, '$1')
        .replace(/\\rightarrow|\\longrightarrow|\\to\b/g, '→')
        .replace(/\\leftarrow/g, '←')
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\cdot/g, '·')
        .replace(/\\pm/g, '±')
        .replace(/\\degree|\\circ/g, '°')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[{}]/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim()
    )
    .join('\n');
}

/** Escape a single inline segment and convert **bold** to <strong>. */
function inlineToHtml(text: string): string {
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

const HTML_STYLES = {
  h1: 'font-size:17px;font-weight:700;margin:4px 0 6px;',
  h2: 'font-size:15px;font-weight:700;margin:4px 0 4px;',
  h3: 'font-size:14px;font-weight:600;margin:3px 0 3px;',
  body: 'font-size:13.5px;line-height:1.5;margin-bottom:2px;',
  bulletRow: 'display:flex;font-size:13.5px;line-height:1.5;margin-bottom:2px;',
  bulletDot: 'margin-right:6px;flex-shrink:0;',
  bulletText: 'flex:1;min-width:0;',
  spacer: 'height:6px;',
};

/**
 * Convert a chat answer's lightweight markdown (headings, bullets, numbered
 * lists, **bold**) into HTML for the KaTeX WebView shell. Math delimiters
 * ($...$, $$...$$) are left intact so KaTeX auto-render picks them up.
 * Mirrors the segment rules of the native markdown renderer in DoubtsTab.
 */
export function doubtsMarkdownToHtml(text: string): string {
  const lines = text.split('\n');
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      parts.push(`<div style="${HTML_STYLES.spacer}"></div>`);
    } else if (trimmed.startsWith('### ')) {
      parts.push(`<div style="${HTML_STYLES.h3}">${inlineToHtml(trimmed.slice(4))}</div>`);
    } else if (trimmed.startsWith('## ')) {
      parts.push(`<div style="${HTML_STYLES.h2}">${inlineToHtml(trimmed.slice(3))}</div>`);
    } else if (trimmed.startsWith('# ')) {
      parts.push(`<div style="${HTML_STYLES.h1}">${inlineToHtml(trimmed.slice(2))}</div>`);
    } else if (/^[-*•]\s/.test(trimmed)) {
      parts.push(
        `<div style="${HTML_STYLES.bulletRow}"><span style="${HTML_STYLES.bulletDot}">•</span><span style="${HTML_STYLES.bulletText}">${inlineToHtml(trimmed.slice(2))}</span></div>`
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        parts.push(
          `<div style="${HTML_STYLES.bulletRow}"><span style="${HTML_STYLES.bulletDot}">${match[1]}.</span><span style="${HTML_STYLES.bulletText}">${inlineToHtml(match[2])}</span></div>`
        );
      }
    } else {
      parts.push(`<div style="${HTML_STYLES.body}">${inlineToHtml(trimmed)}</div>`);
    }
  }

  return parts.join('');
}
