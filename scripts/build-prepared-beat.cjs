// Dev helper: apply HyperframeAnswerPlayer's prepareBeatHtml transform to a
// real Athena beat page, so the injected viewport + bootstrap can be opened in
// a normal browser and verified before shipping to a device.
//
//   node scripts/build-prepared-beat.cjs <raw-beat.html> <out.html>
const fs = require('fs');
const path = require('path');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/build-prepared-beat.cjs <raw-beat.html> <out.html>');
  process.exit(1);
}

const componentPath = path.join(__dirname, '..', 'src', 'components', 'askAssistant', 'HyperframeAnswerPlayer.tsx');
const src = fs.readFileSync(componentPath, 'utf8');

const bootstrap = src
  .match(/const FRAME_BOOTSTRAP = `([\s\S]*?)`;/)[1]
  .split('${BEAT_WIDTH}')
  .join('1920')
  .split('${BEAT_HEIGHT}')
  .join('1080');
const viewport = src.match(/const BEAT_VIEWPORT =\s*\n?\s*'([^']+)'/)[1];

const html = fs.readFileSync(inPath, 'utf8');
const head = html.match(/<head[^>]*>/i)[0];
const out = html.replace(head, head + viewport + bootstrap);
fs.writeFileSync(outPath, out);

console.log('viewport injected   :', out.includes('width=device-width'));
console.log('bootstrap before gsap:', out.indexOf('ReactNativeWebView') < out.indexOf('gsap.min.js'));
console.log('scale expression     :', /window\.innerWidth \/ 1920/.test(out));
console.log('bytes                :', html.length, '->', out.length);
