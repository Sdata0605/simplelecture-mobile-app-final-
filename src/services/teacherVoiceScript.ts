// The page that plays the teacher's voice. It runs in a hidden WebView (see TeacherVoicePlayer) and uses the same
// Web Audio technique as the website: every chunk of speech Gemini sends is scheduled to start at the exact sample
// where the previous one ends, on one clock, so the speech is one continuous sound with no seams. Playing a file
// per half second of speech cannot do that: each file start-up leaves a gap, and the gaps land mid-word.
//
// It is plain JavaScript in a string because that is what the WebView runs; keep it free of backticks and "${".
// The test loads it into a fake Web Audio to check the scheduling.

export const PLAYER_SCRIPT = `
(function () {
  var RATE = 24000; // Gemini sends 24 kHz, 16-bit, mono PCM
  // Speech does not start until this much is held back, so a chunk that arrives a little late is not heard as a gap.
  var HEAD_START_S = 0.3;
  // ...but a short reply is never held longer than this waiting for more.
  var HOLD_MAX_MS = 250;
  // After running dry, the next sound starts this far ahead of "now".
  var LEAD_S = 0.05;

  var ctx = null;
  var nextAt = 0;          // where the next chunk must start to follow the last one exactly
  var sources = [];        // scheduled and not yet finished
  var held = [];           // chunks waiting out the head start
  var heldSeconds = 0;
  var holdTimer = null;
  var lastSeq = 0;
  var reportedBlocked = false;

  function post(message) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  function audio() {
    if (!ctx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      try {
        ctx = new Ctor({ sampleRate: RATE, latencyHint: 'playback' });
      } catch (e) {
        // A browser that takes no options: it resamples the 24 kHz buffers itself.
        ctx = new Ctor();
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function decode(base64) {
    var bin = atob(base64);
    var count = bin.length >> 1;
    var out = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      out[i] = (v >= 32768 ? v - 65536 : v) / 32768;
    }
    return out;
  }

  function schedule(samples, seq) {
    var c = audio();
    var buffer = c.createBuffer(1, samples.length, RATE);
    buffer.getChannelData(0).set(samples);
    var source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    // Chunks follow each other exactly while speech is under way; after running dry it starts a little ahead of now.
    var at = nextAt > c.currentTime ? nextAt : c.currentTime + LEAD_S;
    source.start(at);
    nextAt = at + buffer.duration;
    lastSeq = seq;
    sources.push(source);
    source.onended = function () {
      var index = sources.indexOf(source);
      if (index >= 0) sources.splice(index, 1);
      if (!sources.length && !held.length) post({ type: 'drained', seq: lastSeq });
    };
  }

  function release() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    var batch = held;
    held = [];
    heldSeconds = 0;
    for (var i = 0; i < batch.length; i++) schedule(batch[i].samples, batch[i].seq);
    if (batch.length && ctx && ctx.state !== 'running' && !reportedBlocked) {
      setTimeout(function () {
        if (ctx && ctx.state !== 'running' && !reportedBlocked) {
          reportedBlocked = true;
          post({ type: 'error', message: 'The phone is not letting the teacher\\'s voice play (' + ctx.state + ').' });
        }
      }, 800);
    }
  }

  function push(base64, seq) {
    try {
      var samples = decode(base64);
      if (!samples.length) return;
      var c = audio();
      if (nextAt > c.currentTime) {
        // Speech is under way: follow the last chunk exactly.
        schedule(samples, seq);
        return;
      }
      // A new stretch of speech (or one that ran dry): hold a little back before it starts.
      held.push({ samples: samples, seq: seq });
      heldSeconds += samples.length / RATE;
      if (heldSeconds >= HEAD_START_S) release();
      else if (!holdTimer) holdTimer = setTimeout(release, HOLD_MAX_MS);
    } catch (e) {
      post({ type: 'error', message: 'Voice playback failed: ' + (e && e.message ? e.message : e) });
    }
  }

  // Start now, whatever the head start: the turn is over, or a card is waiting for the voice to finish.
  function flush() {
    if (held.length) release();
  }

  // Silence at once and forget everything that was queued.
  function stop() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    held = [];
    heldSeconds = 0;
    var playing = sources;
    sources = [];
    for (var i = 0; i < playing.length; i++) {
      playing[i].onended = null;
      try { playing[i].stop(); } catch (e) {}
    }
    nextAt = 0;
  }

  window.__voice = { push: push, flush: flush, stop: stop };

  try {
    var started = audio();
    post({ type: 'ready', state: started.state });
  } catch (e) {
    post({ type: 'error', message: 'Voice playback is not available here: ' + (e && e.message ? e.message : e) });
  }
})();
`;

export const PLAYER_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><script>' +
  PLAYER_SCRIPT +
  '</script></body></html>';
