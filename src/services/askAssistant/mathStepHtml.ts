// The page one worked-solution step is typeset in: every line of working as a KaTeX equation (written in one
// after another), the reason for the move as a gold note, and any other line as plain text. One page per step
// (one WebView), not one per equation, so a long solution stays light.
import { bulletKind, stripWhy, toMathMarkdown } from './lectureMath';

export const INK = '#eef6f4';
export const MINT = '#7ce0c3';
export const GOLD = '#f5c66a';

/** Escapes text for an HTML text node (LaTeX keeps its $ and backslashes). */
export function escapeForHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One bullet as the HTML row it is shown in. `index` staggers the writing-in. */
export function bulletRow(bullet: string, index: number): string {
  const style = `style="--i:${index}"`;
  const markdown = toMathMarkdown(bullet);
  switch (bulletKind(bullet)) {
    case 'equation':
      return `<div class="eq" ${style}>${escapeForHtml(markdown)}</div>`;
    case 'why':
      return `<div class="why" ${style}><b>Why</b><span>${escapeForHtml(stripWhy(markdown))}</span></div>`;
    default:
      return `<div class="line" ${style}>${escapeForHtml(markdown)}</div>`;
  }
}

export function buildMathStepHtml(bullets: string[]): string {
  const rows = bullets.map((bullet, i) => bulletRow(bullet, i)).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{background:transparent;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;}
.work{display:grid;gap:8px;padding:2px 0;}
.eq,.why,.line{animation:w 420ms ease both;animation-delay:calc(var(--i) * 340ms);}
.eq{padding:10px 12px;overflow-x:auto;overflow-y:hidden;border:1px solid rgba(124,224,195,.16);border-radius:12px;background:rgba(7,16,15,.55);text-align:center;}
.eq .katex{font-size:1.35em;}
.eq .katex-display{margin:0;}
.eq .fbox{padding:.18em .45em;border:2px solid ${MINT}!important;border-radius:6px;background:rgba(124,224,195,.12);}
.why{display:flex;gap:10px;align-items:baseline;padding:7px 12px;border-left:3px solid ${GOLD};border-radius:0 10px 10px 0;color:#f0dcae;background:rgba(245,198,106,.08);font-size:14px;}
.why b{flex:none;color:${GOLD};font:700 10px/1 monospace;letter-spacing:.12em;text-transform:uppercase;}
.line{font-size:15px;}
@keyframes w{from{opacity:0;transform:translateY(6px);clip-path:inset(0 100% 0 0);}to{opacity:1;transform:none;clip-path:inset(0 0 0 0);}}
@media (prefers-reduced-motion: reduce){.eq,.why,.line{animation:none;}}
</style>
</head>
<body>
<div class="work">${rows}</div>
<script>
document.addEventListener("DOMContentLoaded",function(){
if(window.renderMathInElement){
renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false,errorColor:"#fb7185",trust:false});
}
function s(){var h=document.body.scrollHeight;if(h>0&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(String(h));}
setTimeout(s,100);setTimeout(s,400);setTimeout(s,900);setTimeout(s,1800);
});
</script>
</body>
</html>`;
}
