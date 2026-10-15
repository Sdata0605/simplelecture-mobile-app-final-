import { bulletKind, hasMath, stripWhy, toMathMarkdown } from "../askAssistant/lectureMath";

describe("toMathMarkdown: accepts the LaTeX the model actually sends", () => {
  it("leaves $ and $$ maths alone", () => {
    expect(toMathMarkdown("$$2x + 3 = 11$$")).toBe("$$2x + 3 = 11$$");
    expect(toMathMarkdown("Given: $x = 4$")).toBe("Given: $x = 4$");
  });

  it("converts \\[ \\] and \\( \\) delimiters", () => {
    expect(toMathMarkdown("\\[ 2x = 8 \\]")).toBe("$$2x = 8$$");
    expect(toMathMarkdown("so \\( x = 4 \\) here")).toBe("so $x = 4$ here");
  });

  it("treats a bare LaTeX line as a display equation", () => {
    expect(toMathMarkdown("\\frac{8}{2} = 4")).toBe("$$\\frac{8}{2} = 4$$");
    expect(toMathMarkdown("x = \\sqrt{16}")).toBe("$$x = \\sqrt{16}$$");
  });

  it("does not turn ordinary sentences into maths", () => {
    expect(toMathMarkdown("Subtract 3 from both sides")).toBe("Subtract 3 from both sides");
    expect(toMathMarkdown("Why: we want x alone")).toBe("Why: we want x alone");
    // a plain equation with no markup is left for the teacher to wrap; we do not guess
    expect(toMathMarkdown("2x + 3 = 11")).toBe("2x + 3 = 11");
  });

  it("does not match a longer word that merely starts like a command", () => {
    expect(toMathMarkdown("\\textbook is not maths")).toBe("\\textbook is not maths");
  });
});

describe("bulletKind and hasMath", () => {
  it("tells equation lines, reasons and plain notes apart", () => {
    expect(bulletKind("$$2x + 3 = 11$$")).toBe("equation");
    expect(bulletKind("\\[ 2x = 8 \\]")).toBe("equation");
    expect(bulletKind("\\frac{8}{2} = 4")).toBe("equation");
    expect(bulletKind("Why: subtract 3 from both sides")).toBe("why");
    expect(bulletKind("why : the 3 is added, so we undo it")).toBe("why");
    expect(bulletKind("We want to find $x$")).toBe("note"); // inline maths inside a sentence
    expect(bulletKind("Plants make food")).toBe("note");
  });

  it("finds maths anywhere in a line", () => {
    expect(hasMath("Find $x$")).toBe(true);
    expect(hasMath("$$x=4$$")).toBe(true);
    expect(hasMath("\\sqrt{9} = 3")).toBe(true);
    expect(hasMath("Plants make food")).toBe(false);
    expect(hasMath("Costs $5 and $6")).toBe(true); // a known limit: a dollar amount looks like maths
  });

  it("strips the Why label", () => {
    expect(stripWhy("Why: subtract 3 from both sides")).toBe("subtract 3 from both sides");
    expect(stripWhy("why:  because")).toBe("because");
    expect(stripWhy("No label")).toBe("No label");
  });
});

import { normalizeMathDelimiters, toInlineMathMarkdown } from "../askAssistant/lectureMath";

describe("question and option text", () => {
  it("only converts delimiters in a sentence, never wraps a whole question as maths", () => {
    expect(normalizeMathDelimiters("What is \\( \\frac{1}{2} \\) of 10?")).toBe("What is $\\frac{1}{2}$ of 10?");
    expect(normalizeMathDelimiters("What is \\frac{1}{2} of 10?")).toBe("What is \\frac{1}{2} of 10?");
  });

  it("keeps equations inline inside answer options", () => {
    expect(toInlineMathMarkdown("$$x = 4$$")).toBe("$x = 4$");
    expect(toInlineMathMarkdown("\\frac{1}{2}")).toBe("$\\frac{1}{2}$");
    expect(toInlineMathMarkdown("\\[ x = 4 \\]")).toBe("$x = 4$");
    expect(toInlineMathMarkdown("Carbon dioxide")).toBe("Carbon dioxide");
  });
});
