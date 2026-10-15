// Maths on the lesson board. When a student asks a maths problem the teacher solves it step by step, writing
// each line of working as LaTeX in a slide bullet; the board typesets it (KaTeX) and lays the steps out like a
// worked solution. These helpers decide what a bullet is and clean up the LaTeX models actually send.

/** LaTeX commands that mean "this line is maths" even when the model forgot the $ signs. */
const LATEX_COMMAND =
  /\\(frac|dfrac|sqrt|times|cdot|div|boxed|pm|le|ge|leq|geq|neq|approx|pi|theta|alpha|beta|sum|int|lim|log|sin|cos|tan|Rightarrow|rightarrow|therefore|angle|triangle|text)(?![a-zA-Z])/;

/** Converts \( \) and \[ \] (which the markdown renderer does not read) to $ and $$. */
export function normalizeMathDelimiters(line: string): string {
  return line
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, inner: string) => "$$" + inner.trim() + "$$")
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, inner: string) => "$" + inner.trim() + "$");
}

/**
 * Markdown with $ / $$ maths, whichever delimiters the model used: \( \) and \[ \] are converted, and a line
 * that is bare LaTeX (a backslash command, no $) is treated as a display equation.
 */
export function toMathMarkdown(line: string): string {
  const text = normalizeMathDelimiters(line.trim());
  return !text.includes("$") && LATEX_COMMAND.test(text) ? "$$" + text + "$$" : text;
}

/** Like toMathMarkdown but for text that sits inside a line (answer options): equations stay inline. */
export function toInlineMathMarkdown(line: string): string {
  return toMathMarkdown(line).replace(/\$\$([\s\S]+?)\$\$/g, (_match, inner: string) => "$" + inner.trim() + "$");
}

/** True when the line contains maths. */
export function hasMath(line: string): boolean {
  return toMathMarkdown(line).includes("$");
}

export type BulletKind = "equation" | "why" | "note";

/** An equation line (shown big, centered), the reason for a move ("Why: ..."), or ordinary text. */
export function bulletKind(line: string): BulletKind {
  const text = toMathMarkdown(line);
  if (/^why\s*:/i.test(text)) return "why";
  return text.includes("$$") ? "equation" : "note";
}

/** The reason text without its "Why:" label. */
export function stripWhy(line: string): string {
  return line.trim().replace(/^why\s*:\s*/i, "");
}
