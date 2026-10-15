/**
 * Unit tests for the pure LaTeX/markdown helpers behind the Doubts tab's
 * math rendering (mobile/src/utils/latexFormat.ts).
 */
import {
  containsLatex,
  hasMathDelimiters,
  convertMathpixToStandard,
  escapeHtml,
  stripLatexToPlainText,
  doubtsMarkdownToHtml,
} from '../utils/latexFormat';

describe('containsLatex', () => {
  it('detects inline dollar math', () => {
    expect(containsLatex('separated by an arrow ($\\rightarrow$).')).toBe(true);
  });

  it('detects chemistry equations with \\text and subscripts', () => {
    expect(containsLatex('$2\\text{Mg} + \\text{O}_2 \\rightarrow 2\\text{MgO}$')).toBe(true);
  });

  it('detects mhchem', () => {
    expect(containsLatex('\\ce{2H2 + O2 -> 2H2O}')).toBe(true);
  });

  it('detects fractions and braces subscripts without dollars', () => {
    expect(containsLatex('F = G \\frac{m_1 m_2}{r^2}')).toBe(true);
    expect(containsLatex('x^{2} + y_{1}')).toBe(true);
  });

  it('does not flag ordinary prose', () => {
    expect(containsLatex('Chemical equations are written using symbols.')).toBe(false);
    expect(containsLatex('Magnesium + Oxygen gives Magnesium oxide')).toBe(false);
  });

  it('does not flag a single unmatched dollar sign', () => {
    expect(containsLatex('This costs $5 only')).toBe(false);
  });
});

describe('hasMathDelimiters', () => {
  it('recognizes $, $$, \\( \\), \\[ \\]', () => {
    expect(hasMathDelimiters('$x$')).toBe(true);
    expect(hasMathDelimiters('$$x$$')).toBe(true);
    expect(hasMathDelimiters('\\(x\\)')).toBe(true);
    expect(hasMathDelimiters('\\[x\\]')).toBe(true);
    expect(hasMathDelimiters('plain')).toBe(false);
  });
});

describe('convertMathpixToStandard', () => {
  it('converts \\( \\) to $ and \\[ \\] to $$', () => {
    expect(convertMathpixToStandard('a \\(x^2\\) b')).toBe('a $x^2$ b');
    expect(convertMathpixToStandard('\\[E=mc^2\\]')).toBe('$$E=mc^2$$');
  });

  it('handles empty input', () => {
    expect(convertMathpixToStandard('')).toBe('');
  });

  it('leaves standard delimiters untouched', () => {
    expect(convertMathpixToStandard('$x$ and $$y$$')).toBe('$x$ and $$y$$');
  });
});

describe('escapeHtml', () => {
  it('escapes angle brackets and converts newlines', () => {
    expect(escapeHtml('a < b > c\nd')).toBe('a &lt; b &gt; c<br>d');
  });

  it('keeps $ and backslashes for KaTeX', () => {
    expect(escapeHtml('$\\frac{a}{b}$')).toBe('$\\frac{a}{b}$');
  });
});

describe('stripLatexToPlainText', () => {
  it('unwraps dollar delimiters', () => {
    expect(stripLatexToPlainText('an arrow ($\\rightarrow$).')).toBe('an arrow (→).');
  });

  it('renders the chemistry example readably', () => {
    const input = 'Example: $2\\text{Mg} + \\text{O}_2 \\rightarrow 2\\text{MgO}$';
    expect(stripLatexToPlainText(input)).toBe('Example: 2Mg + O_2 → 2MgO');
  });

  it('converts fractions', () => {
    expect(stripLatexToPlainText('$\\frac{a}{b}$')).toBe('(a/b)');
  });

  it('preserves newlines and markdown markers', () => {
    const input = '## Heading\n- point with $x^2$\n\n**bold** stays';
    expect(stripLatexToPlainText(input)).toBe('## Heading\n- point with x^2\n\n**bold** stays');
  });

  it('drops unknown commands and braces', () => {
    expect(stripLatexToPlainText('$\\mathbf{F} = ma$')).toBe('F = ma');
  });

  it('handles empty input', () => {
    expect(stripLatexToPlainText('')).toBe('');
  });
});

describe('doubtsMarkdownToHtml', () => {
  it('preserves math delimiters for KaTeX auto-render', () => {
    const html = doubtsMarkdownToHtml('Example: $2\\text{Mg} + \\text{O}_2 \\rightarrow 2\\text{MgO}$');
    expect(html).toContain('$2\\text{Mg} + \\text{O}_2 \\rightarrow 2\\text{MgO}$');
  });

  it('converts **bold** to <strong>', () => {
    expect(doubtsMarkdownToHtml('a **word equation** b')).toContain('<strong>word equation</strong>');
  });

  it('escapes raw HTML in the answer', () => {
    const html = doubtsMarkdownToHtml('watch <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders headings, bullets and numbered items', () => {
    const html = doubtsMarkdownToHtml('# Big\n## Mid\n### Small\n- item\n2. second');
    expect(html).toContain('>Big</div>');
    expect(html).toContain('>Mid</div>');
    expect(html).toContain('>Small</div>');
    expect(html).toContain('>•</span>');
    expect(html).toContain('>2.</span>');
    expect(html).toContain('>item</span>');
    expect(html).toContain('>second</span>');
  });

  it('turns blank lines into spacers', () => {
    const html = doubtsMarkdownToHtml('a\n\nb');
    expect(html).toContain('height:6px');
  });

  it('handles bullets that contain math', () => {
    const html = doubtsMarkdownToHtml('- Mg + O$_2$ $\\rightarrow$ MgO');
    expect(html).toContain('Mg + O$_2$ $\\rightarrow$ MgO');
  });
});
