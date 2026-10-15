import { buildMathStepHtml, bulletRow, escapeForHtml } from '../askAssistant/mathStepHtml';

describe('bulletRow: one line of working', () => {
  it('shows an equation as a display-maths row and staggers the writing-in', () => {
    expect(bulletRow('$$2x + 3 = 11$$', 0)).toBe('<div class="eq" style="--i:0">$$2x + 3 = 11$$</div>');
    expect(bulletRow('$$x = 4$$', 3)).toContain('style="--i:3"');
  });

  it('accepts the other LaTeX forms models send', () => {
    expect(bulletRow('\\[ 2x = 8 \\]', 1)).toBe('<div class="eq" style="--i:1">$$2x = 8$$</div>');
    expect(bulletRow('\\frac{8}{2} = 4', 2)).toBe('<div class="eq" style="--i:2">$$\\frac{8}{2} = 4$$</div>');
  });

  it('shows the reason for a move as a Why note without its label', () => {
    expect(bulletRow('Why: subtract 3 from both sides', 4)).toBe(
      '<div class="why" style="--i:4"><b>Why</b><span>subtract 3 from both sides</span></div>',
    );
  });

  it('shows any other line as plain text, keeping inline maths', () => {
    expect(bulletRow('Find the value of $x$', 0)).toBe('<div class="line" style="--i:0">Find the value of $x$</div>');
  });

  it('escapes HTML so a < or & in the working cannot break the page', () => {
    expect(escapeForHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    expect(bulletRow('$$x < 4$$', 0)).toContain('$$x &lt; 4$$');
    expect(bulletRow('Why: x & y are <equal>', 0)).toContain('x &amp; y are &lt;equal&gt;');
  });
});

describe('buildMathStepHtml', () => {
  const html = buildMathStepHtml(['Given: $$2x + 3 = 11$$', '$$2x = 8$$', 'Why: subtract 3 from both sides']);

  it('puts every line in order inside one page, with KaTeX loaded and the height reported back', () => {
    expect(html.indexOf('2x + 3 = 11')).toBeLessThan(html.indexOf('2x = 8'));
    expect(html.indexOf('2x = 8')).toBeLessThan(html.indexOf('subtract 3'));
    expect(html).toContain('katex@0.16.9/dist/katex.min.js');
    expect(html).toContain('auto-render.min.js');
    expect(html).toContain('ReactNativeWebView.postMessage');
    expect(html).toContain('{left:"$$",right:"$$",display:true}');
  });

  it('survives an empty step', () => {
    expect(buildMathStepHtml([])).toContain('<div class="work"></div>');
  });
});
