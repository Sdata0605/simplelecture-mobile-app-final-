import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { WebView } from 'react-native-webview';

interface MicStreamerProps {
  isStreaming: boolean;
  isMuted: boolean;
  onAudioChunk: (pcmBase64: string, rms: number) => void;
  onError?: (error: string) => void;
  onReady?: () => void;
}

const MIC_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MicStreamer</title>
</head>
<body style="background:transparent;margin:0;padding:0;">
<script>
  window.audioCtx = null;
  window.mediaStream = null;
  window.workletNode = null;
  window.scriptNode = null;
  window.sourceNode = null;
  window.gainNode = null;
  window.isRunning = false;
  window.muted = false;
  window.chunkCount = 0;

  function postMsg(data) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
  }

  function b64FromBuffer(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  const WORKLET_SRC = \`
class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0; this.acc = 0; this.cnt = 0;
    this.out = new Int16Array(1600); this.n = 0; this.sumSq = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        const v = this.acc / this.cnt;
        this.pos -= this.ratio; this.acc = 0; this.cnt = 0;
        const s = Math.max(-1, Math.min(1, v));
        this.sumSq += s * s;
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === 1600) {
          this.port.postMessage({ pcm: this.out.buffer.slice(0), rms: Math.sqrt(this.sumSq / 1600) });
          this.n = 0; this.sumSq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCapture);
\`;

  async function startMic() {
    if (window.isRunning) return;
    try {
      const getMedia = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        ? function(c) { return navigator.mediaDevices.getUserMedia(c); }
        : (navigator.webkitGetUserMedia || navigator.getUserMedia)
        ? function(c) {
            return new Promise(function(resolve, reject) {
              (navigator.webkitGetUserMedia || navigator.getUserMedia).call(navigator, c, resolve, reject);
            });
          }
        : null;

      postMsg({
        type: 'debug',
        isSecure: window.isSecureContext,
        origin: window.location.origin,
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetMedia: !!getMedia,
      });

      if (!getMedia) {
        throw new Error('Microphone mediaDevices API not available in WebView');
      }

      const stream = await getMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      window.mediaStream = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext not supported');
      }

      window.audioCtx = new AudioContextClass();
      if (window.audioCtx.state === 'suspended') {
        await window.audioCtx.resume();
      }

      const source = window.audioCtx.createMediaStreamSource(stream);
      window.sourceNode = source;

      let usedWorklet = false;
      if (window.audioCtx.audioWorklet) {
        try {
          const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await window.audioCtx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          const worklet = new AudioWorkletNode(window.audioCtx, 'pcm-capture');
          window.workletNode = worklet;
          worklet.port.onmessage = function(ev) {
            if (window.muted) return;
            const b64 = b64FromBuffer(ev.data.pcm);
            postMsg({
              type: 'audio',
              pcm: b64,
              rms: ev.data.rms
            });
          };

          source.connect(worklet);
          const gain = window.audioCtx.createGain();
          gain.gain.value = 0;
          window.gainNode = gain;
          worklet.connect(gain);
          gain.connect(window.audioCtx.destination);
          usedWorklet = true;
          console.log('[Mic] AudioWorklet active');
        } catch (workletErr) {
          console.warn('[Mic] AudioWorklet failed, falling back to ScriptProcessor:', workletErr);
        }
      }

      if (!usedWorklet) {
        // Fallback ScriptProcessor
        const ratio = (window.audioCtx.sampleRate || 48000) / 16000;
        const script = window.audioCtx.createScriptProcessor(2048, 1, 1);
        window.scriptNode = script;

        const gain = window.audioCtx.createGain();
        gain.gain.value = 0;
        window.gainNode = gain;

        script.onaudioprocess = function(e) {
          if (window.muted) return;
          const input = e.inputBuffer.getChannelData(0);
          const outLen = Math.floor(input.length / ratio);
          const pcm16 = new Int16Array(outLen);
          let sumSq = 0;

          for (let i = 0; i < outLen; i++) {
            const srcIdx = Math.floor(i * ratio);
            const s = Math.max(-1, Math.min(1, input[srcIdx] || 0));
            sumSq += s * s;
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          const rms = Math.sqrt(sumSq / Math.max(1, outLen));
          const b64 = b64FromBuffer(pcm16.buffer);
          postMsg({
            type: 'audio',
            pcm: b64,
            rms: rms
          });
        };

        source.connect(script);
        script.connect(gain);
        gain.connect(window.audioCtx.destination);
      }

      window.isRunning = true;
      postMsg({ type: 'ready' });
    } catch (err) {
      postMsg({ type: 'error', message: err.message || String(err) });
    }
  }

  function stopMic() {
    window.isRunning = false;
    if (window.workletNode) {
      try { window.workletNode.disconnect(); } catch (e) {}
      window.workletNode = null;
    }
    if (window.scriptNode) {
      try { window.scriptNode.disconnect(); } catch (e) {}
      window.scriptNode = null;
    }
    if (window.sourceNode) {
      try { window.sourceNode.disconnect(); } catch (e) {}
      window.sourceNode = null;
    }
    if (window.gainNode) {
      try { window.gainNode.disconnect(); } catch (e) {}
      window.gainNode = null;
    }
    if (window.mediaStream) {
      try {
        window.mediaStream.getTracks().forEach(function(t) { t.stop(); });
      } catch (e) {}
      window.mediaStream = null;
    }
    if (window.audioCtx) {
      try { window.audioCtx.close(); } catch (e) {}
      window.audioCtx = null;
    }
    postMsg({ type: 'stopped' });
  }

  function setMuted(val) {
    window.muted = !!val;
  }

  window.addEventListener('message', function(ev) {
    try {
      const data = JSON.parse(ev.data);
      if (data.action === 'start') startMic();
      else if (data.action === 'stop') stopMic();
      else if (data.action === 'setMuted') setMuted(data.muted);
      else if (data.action === 'resume') {
        if (window.audioCtx && window.audioCtx.state === 'suspended') {
          window.audioCtx.resume();
        }
      }
    } catch (e) {}
  });

  window.addEventListener('load', function() {
    startMic();
  });
</script>
</body>
</html>
`;

export const MicStreamer: React.FC<MicStreamerProps> = ({
  isStreaming,
  isMuted,
  onAudioChunk,
  onError,
  onReady,
}) => {
  const webViewRef = useRef<WebView>(null);
  const chunkCountRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!webViewRef.current) return;
    const action = isStreaming ? 'start' : 'stop';
    webViewRef.current.postMessage(JSON.stringify({ action }));
  }, [isStreaming]);

  useEffect(() => {
    if (!webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ action: 'setMuted', muted: isMuted }));
  }, [isMuted]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'audio' && data.pcm) {
        chunkCountRef.current++;
        if (chunkCountRef.current % 15 === 1) {
          console.log(
            `[MicStreamer] Audio chunk #${chunkCountRef.current} captured (RMS: ${(data.rms || 0).toFixed(3)})`
          );
        }
        onAudioChunk(data.pcm, typeof data.rms === 'number' ? data.rms : 0);
      } else if (data.type === 'ready') {
        console.log('[MicStreamer] Microphone audio capture ACTIVE and streaming to Gemini!');
        if (onReady) onReady();
      } else if (data.type === 'debug') {
        console.log('[MicStreamer] WebRTC environment:', JSON.stringify(data));
      } else if (data.type === 'error') {
        console.warn('[MicStreamer] Error from WebView mic:', data.message);
        if (onError) onError(data.message);
      }
    } catch (err) {
      console.warn('[MicStreamer] Failed to parse WebView message:', err);
    }
  };

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: MIC_HTML, baseUrl: 'https://localhost' }}
        style={styles.hiddenWebView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        mixedContentMode="always"
        {...({
          onPermissionRequest: (request: any) => {
            if (request && typeof request.grant === 'function') {
              request.grant(request.resources || []);
            }
          },
        } as any)}
        onMessage={handleMessage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    height: 2,
    opacity: 0.01,
  },
  hiddenWebView: {
    width: 2,
    height: 2,
  },
});
