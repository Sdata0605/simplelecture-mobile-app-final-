import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';

// Tunable green-removal settings. All optional; defaults match the shared
// baseline used app-wide. Per-subject profiles pass overrides here.
export interface ChromaKeySettings {
  sensitivity?: number;          // overall key strength multiplier (0..1)
  hueMin?: number;               // core green hue range (degrees)
  hueMax?: number;
  satMin?: number;               // saturation floor for keyable pixels
  lightMin?: number;             // lightness clamp
  lightMax?: number;
  edgeRange?: number;            // soft hue band outside core range (degrees)
  greenDominance?: number;       // green must exceed max(r,b) * this factor
  detectMinGreenFraction?: number; // border green fraction to enable keying
  // Edge cleanup (all OFF by default - other subjects are bit-identical).
  // Runs a second pass ONLY on opaque pixels that touch transparency
  // (the silhouette rim), so it can never punch holes in the body interior.
  edgeCleanRadius?: number;      // px radius to look for transparency; 0 = off
  edgeDespill?: number;          // 0..1: suppress green tint on rim pixels
  edgeRimStrength?: number;      // 0..1: fade out green-dominant rim pixels
  edgeErode?: number;            // px: unconditionally remove this many edge
                                 // pixels at the silhouette (blend line), 0 = off
}

export const DEFAULT_CHROMA_SETTINGS: Required<ChromaKeySettings> = {
  sensitivity: 0.95,
  hueMin: 80,
  hueMax: 160,
  satMin: 0.25,
  lightMin: 0.08,
  lightMax: 0.90,
  edgeRange: 10,
  greenDominance: 1.05,
  detectMinGreenFraction: 0.35,
  edgeCleanRadius: 0,
  edgeDespill: 0,
  edgeRimStrength: 0,
  edgeErode: 0,
};

export interface ChromaKeyVideoRef {
  playAsync: () => Promise<AVPlaybackStatus>;
  pauseAsync: () => Promise<AVPlaybackStatus>;
  setPositionAsync: (positionMillis: number) => Promise<AVPlaybackStatus>;
  getStatusAsync: () => Promise<AVPlaybackStatus>;
}

interface ChromaKeyVideoProps {
  source: { uri: string };
  style?: any;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  onLoad?: () => void;
  onError?: (error: string) => void;
  greenThreshold?: number;
  greenMultiplier?: number;
  chromaSettings?: ChromaKeySettings;
}

const generateChromaKeyHTML = (
  videoUrl: string,
  isLooping: boolean,
  isMuted: boolean,
  greenThreshold: number,
  greenMultiplier: number,
  cs: Required<ChromaKeySettings>
) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      overflow: hidden; 
      background: transparent;
    }
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
    }
    #video {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 1px;
      height: 1px;
    }
    #canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div id="container">
    <video id="video" playsinline ${isMuted ? 'muted' : ''} ${isLooping ? 'loop' : ''}>
      <source src="${videoUrl}" type="video/mp4">
    </video>
    <canvas id="canvas"></canvas>
  </div>
  <script>
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const SENSITIVITY = ${cs.sensitivity};
    
    // Tightened key range: only strongly-green pixels are keyed so desaturated
    // suit/skin/shadow tones are never eaten. Values are injected per profile.
    const HUE_MIN = ${cs.hueMin};
    const HUE_MAX = ${cs.hueMax};
    const SAT_MIN = ${cs.satMin};
    const LIGHT_MIN = ${cs.lightMin};
    const LIGHT_MAX = ${cs.lightMax};
    const EDGE_RANGE = ${cs.edgeRange};
    const GREEN_DOMINANCE = ${cs.greenDominance};
${cs.edgeCleanRadius > 0 && (cs.edgeDespill > 0 || cs.edgeRimStrength > 0 || cs.edgeErode > 0) ? `
    // Rim cleanup (emitted only for profiles that enable it).
    const EDGE_CLEAN_RADIUS = ${cs.edgeCleanRadius};
    const EDGE_DESPILL = ${cs.edgeDespill};
    const EDGE_RIM_STRENGTH = ${cs.edgeRimStrength};
    const EDGE_ERODE = ${cs.edgeErode};
    // Reused across frames; resized only when video dimensions change.
    let rimAlphaSnap = null;
` : ''}
    
    // Green-screen auto-detection: keying only runs if the video's border
    // regions are dominated by chroma green. Videos without a green screen
    // render untouched (no patches / bitten edges).
    // null = undecided, true = key, false = no keying.
    // Enabling requires 2 consecutive green frames (guards against a single
    // greenish flash in normal footage). "false" is not permanent early on:
    // we keep re-checking periodically for ~10s so dark/fade-in intros or a
    // late-revealed green screen still get keyed.
    let keyingEnabled = null;
    let detectFramesChecked = 0;
    let greenStreak = 0;
    const DETECT_DENSE_FRAMES = 30;    // check every frame for the first ~1s
    const DETECT_RECHECK_INTERVAL = 15;
    const DETECT_GIVE_UP_FRAMES = 300; // ~10s: after this, lock keying off
    const DETECT_MIN_GREEN_FRACTION = ${cs.detectMinGreenFraction};
    const DETECT_STREAK_NEEDED = 2;
    
    function isChromaGreen(r, g, b) {
      // Strongly green: green channel clearly dominates both red and blue.
      if (g < 60) return false;
      if (g < r * 1.15 || g < b * 1.15) return false;
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const cmax = Math.max(rn, gn, bn), cmin = Math.min(rn, gn, bn);
      const delta = cmax - cmin;
      if (delta < 0.1) return false;
      let h = 60 * (((bn - rn) / delta) + 2); // cmax is green here
      if (h < HUE_MIN || h > HUE_MAX) return false;
      const l = (cmax + cmin) / 2;
      const s = delta / (1 - Math.abs(2 * l - 1));
      return s >= 0.30;
    }
    
    function detectGreenScreen(data, w, h) {
      // Zone 1: top band + left/right edge columns (background in typical
      // green-screen footage where the avatar stands center/bottom).
      let green = 0, total = 0;
      const stepX = Math.max(2, Math.floor(w / 40));
      const stepY = Math.max(2, Math.floor(h / 40));
      const bandH = Math.max(2, Math.floor(h * 0.12));
      const bandW = Math.max(2, Math.floor(w * 0.08));
      function sample(x, y) {
        const i = (y * w + x) * 4;
        total++;
        if (isChromaGreen(data[i], data[i + 1], data[i + 2])) green++;
      }
      for (let y = 0; y < bandH; y += stepY)
        for (let x = 0; x < w; x += stepX) sample(x, y);
      for (let y = bandH; y < h; y += stepY) {
        for (let x = 0; x < bandW; x += stepX) sample(x, y);
        for (let x = w - bandW; x < w; x += stepX) sample(x, y);
      }
      if (total > 0 && (green / total) >= DETECT_MIN_GREEN_FRACTION) return true;
      // Zone 2: sparse full-frame grid, for tight crops where the subject
      // touches the borders. Needs a higher fraction since the subject
      // legitimately occupies much of the frame.
      let gGreen = 0, gTotal = 0;
      const gStepX = Math.max(4, Math.floor(w / 24));
      const gStepY = Math.max(4, Math.floor(h / 24));
      for (let y = 0; y < h; y += gStepY) {
        for (let x = 0; x < w; x += gStepX) {
          const i = (y * w + x) * 4;
          gTotal++;
          if (isChromaGreen(data[i], data[i + 1], data[i + 2])) gGreen++;
        }
      }
      return gTotal > 0 && (gGreen / gTotal) >= 0.45;
    }
    
    let animationId = null;
    let isPlaying = false;
    let isVideoReady = false;
    let lastStatusTime = 0;
    let pendingCommands = [];
    let canvasIsTainted = false;
    
    function sendMessage(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
      }
    }
    
    function getStatus() {
      return {
        positionMillis: Math.floor(video.currentTime * 1000),
        durationMillis: Math.floor((video.duration || 0) * 1000),
        isPlaying: !video.paused && !video.ended,
        isBuffering: video.readyState < 3,
        didJustFinish: video.ended,
        shouldPlay: isPlaying,
        rate: 1,
        volume: video.muted ? 0 : 1,
        isMuted: video.muted
      };
    }
    
    function renderFrame() {
      if (video.readyState < 2) {
        animationId = requestAnimationFrame(renderFrame);
        return;
      }
      
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Enter while keying is on OR while detection may still flip it on
      // (provisional-off videos keep re-checking until the give-up frame).
      // Detection frame bookkeeping happens outside getImageData so
      // provisional-off videos only pay the pixel-read cost on check frames.
      let runDetection = false;
      if (keyingEnabled !== true && detectFramesChecked < DETECT_GIVE_UP_FRAMES) {
        detectFramesChecked++;
        runDetection = detectFramesChecked <= DETECT_DENSE_FRAMES ||
          detectFramesChecked % DETECT_RECHECK_INTERVAL === 0;
        if (keyingEnabled === null && detectFramesChecked >= DETECT_DENSE_FRAMES) {
          // Provisionally off; periodic re-checks can still flip it on
          // until DETECT_GIVE_UP_FRAMES.
          keyingEnabled = false;
          sendMessage('debug', { event: 'greenscreen_not_detected_provisional', frames: detectFramesChecked });
        }
      }
      
      if (!canvasIsTainted && (keyingEnabled === true || runDetection || keyingEnabled === null)) {
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const len = data.length;
          
          // Decide whether this video actually has a green screen.
          if (runDetection && keyingEnabled !== true) {
              if (detectGreenScreen(data, canvas.width, canvas.height)) {
                greenStreak++;
                if (greenStreak >= DETECT_STREAK_NEEDED) {
                  keyingEnabled = true;
                  sendMessage('debug', { event: 'greenscreen_detected', frames: detectFramesChecked });
                }
              } else {
                greenStreak = 0;
              }
          }
          
          if (keyingEnabled === true) {
          for (let i = 0; i < len; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            if (g < 30) continue;
            const maxRB = r > b ? r : b;
            // Require green to clearly dominate red AND blue - gray suit,
            // skin, and shadow tones never pass this.
            if (g < maxRB * GREEN_DOMINANCE) continue;
            
            const rn = r / 255;
            const gn = g / 255;
            const bn = b / 255;
            const cmax = rn > gn ? (rn > bn ? rn : bn) : (gn > bn ? gn : bn);
            const cmin = rn < gn ? (rn < bn ? rn : bn) : (gn < bn ? gn : bn);
            const delta = cmax - cmin;
            
            if (delta < 0.02) continue;
            
            let h = 0;
            if (cmax === gn) {
              h = 60 * (((bn - rn) / delta) + 2);
            } else if (cmax === rn) {
              h = 60 * (((gn - bn) / delta) % 6);
            } else {
              h = 60 * (((rn - gn) / delta) + 4);
            }
            if (h < 0) h += 360;
            
            if (h < HUE_MIN - EDGE_RANGE || h > HUE_MAX + EDGE_RANGE) continue;
            
            const l = (cmax + cmin) / 2;
            if (l < LIGHT_MIN || l > LIGHT_MAX) continue;
            
            const s = delta / (1 - Math.abs(2 * l - 1));
            if (s < SAT_MIN) continue;
            
            const inCoreHue = h >= HUE_MIN && h <= HUE_MAX;
            const satStrength = s > 0.45 ? 1.0 : (s - SAT_MIN) / 0.20;
            
            let alpha;
            if (inCoreHue) {
              const hueCenter = (HUE_MIN + HUE_MAX) / 2;
              const hueDistFromEdge = Math.min(h - HUE_MIN, HUE_MAX - h);
              const hueDepth = hueDistFromEdge / ((HUE_MAX - HUE_MIN) / 2);
              const baseKey = 0.85 + hueDepth * 0.15;
              const keyStrength = satStrength * baseKey * SENSITIVITY;
              alpha = Math.round(255 * (1 - keyStrength));
            } else {
              const edgeDist = h < HUE_MIN ? HUE_MIN - h : h - HUE_MAX;
              const edgeFactor = 1 - (edgeDist / EDGE_RANGE);
              alpha = Math.round(255 * (1 - edgeFactor * edgeFactor * satStrength * 0.6 * SENSITIVITY));
            }
            
            if (alpha < 0) alpha = 0;
            if (alpha > 255) alpha = 255;
            data[i + 3] = alpha;
            
            if (alpha > 0 && alpha < 220) {
              const spillFactor = (1 - alpha / 255);
              const avg = (r + b) / 2;
              if (g > avg) {
                data[i + 1] = Math.round(avg + (g - avg) * (alpha / 255) * 0.6);
              }
            }
          }
          
${cs.edgeCleanRadius > 0 && (cs.edgeDespill > 0 || cs.edgeRimStrength > 0 || cs.edgeErode > 0) ? `
          // Rim cleanup pass: remove the dark-green border left on the
          // silhouette. Only touches near-opaque pixels that have a
          // transparent pixel within EDGE_CLEAN_RADIUS, and each frame is
          // recomputed from the source video, so erosion never accumulates.
          {
            const w = canvas.width;
            const hgt = canvas.height;
            const n = w * hgt;
            // Snapshot alpha so rim edits don't cascade inward. Buffer is
            // reused across frames to avoid per-frame allocation/GC churn.
            if (!rimAlphaSnap || rimAlphaSnap.length !== n) rimAlphaSnap = new Uint8Array(n);
            const alphaSnap = rimAlphaSnap;
            for (let p = 0; p < n; p++) alphaSnap[p] = data[p * 4 + 3];
            const R = EDGE_CLEAN_RADIUS;
            for (let y = 0; y < hgt; y++) {
              const row = y * w;
              for (let x = 0; x < w; x++) {
                const p = row + x;
                const a0 = alphaSnap[p];
                // Fully transparent = background, nothing to clean.
                if (a0 < 40) continue;
                // Near transparency? Check a cross + diagonal at radius R,
                // remembering the CLOSEST hole distance for falloff.
                let holeDist = 0;
                for (let d = 1; d <= R && holeDist === 0; d++) {
                  const hit =
                    (x - d >= 0 && alphaSnap[p - d] < 40) ||
                    (x + d < w && alphaSnap[p + d] < 40) ||
                    (y - d >= 0 && alphaSnap[p - d * w] < 40) ||
                    (y + d < hgt && alphaSnap[p + d * w] < 40) ||
                    (x - d >= 0 && y - d >= 0 && alphaSnap[p - d * w - d] < 40) ||
                    (x + d < w && y - d >= 0 && alphaSnap[p - d * w + d] < 40) ||
                    (x - d >= 0 && y + d < hgt && alphaSnap[p + d * w - d] < 40) ||
                    (x + d < w && y + d < hgt && alphaSnap[p + d * w + d] < 40);
                  if (hit) holeDist = d;
                }
                if (holeDist === 0) continue;
                const i = p * 4;
                // Semi-transparent pixel next to true background: this is a
                // keyed-green body/background blend the main pass only
                // half-faded (the surviving visible band). Wipe it entirely.
                // Identical-alpha speckle deep inside the body has no
                // transparent neighbor within R and is never touched.
                if (a0 < 200) {
                  data[i + 3] = 0;
                  continue;
                }
                // Geometric erode: the outermost EDGE_ERODE pixels of the
                // silhouette are ALWAYS a body/background blend (that's what
                // the surviving thin green line is made of), so remove them
                // unconditionally - no color test can be trusted there.
                if (EDGE_ERODE > 0) {
                  if (holeDist <= EDGE_ERODE) {
                    data[i + 3] = 0;
                    continue;
                  }
                  // Feather the next 2px inward so the new edge is soft
                  // rather than a hard staircase.
                  if (holeDist === EDGE_ERODE + 1) {
                    data[i + 3] = Math.round(data[i + 3] * 0.45);
                  } else if (holeDist === EDGE_ERODE + 2) {
                    data[i + 3] = Math.round(data[i + 3] * 0.8);
                  }
                }
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const maxRB = r > b ? r : b;
                const minRB = r < b ? r : b;
                // Greenish/teal rim test: green clearly beats red, and is at
                // least close to blue (dark teal fringe qualifies). Gray suit
                // (g barely = r = b) and skin/hair (r >= g) never pass.
                if (g >= 25 && g >= r * 1.05 && g >= b * 0.92) {
                  // Falloff: pixels hugging the silhouette get full strength,
                  // outer ring fades gently so no visible step remains.
                  const falloff = 1 - (holeDist - 1) / R;
                  // Strength scales with how green/teal the pixel actually is
                  // (chroma above the weakest channel), so a barely-green suit
                  // edge is barely touched while the dark green rim is erased.
                  const chromaAmt = g - minRB; // 0..255
                  if (EDGE_RIM_STRENGTH > 0) {
                    const fade = Math.min(1, chromaAmt / 40) * falloff * EDGE_RIM_STRENGTH;
                    data[i + 3] = Math.round(data[i + 3] * (1 - fade));
                  }
                  // Neutralize remaining green tint so any surviving rim
                  // pixel blends with the suit/hair instead of glowing green.
                  if (EDGE_DESPILL > 0 && g > maxRB) {
                    data[i + 1] = Math.round(g - (g - maxRB) * EDGE_DESPILL * falloff);
                  }
                }
              }
            }
          }
` : ''}
          
          ctx.putImageData(imageData, 0, 0);
          }
        } catch (e) {
          canvasIsTainted = true;
          sendMessage('debug', { event: 'canvas_tainted', message: e.message });
        }
      }
      
      const now = performance.now();
      if (now - lastStatusTime > 100) {
        sendMessage('timeUpdate', getStatus());
        lastStatusTime = now;
      }
      
      animationId = requestAnimationFrame(renderFrame);
    }
    
    function processPendingCommands() {
      while (pendingCommands.length > 0) {
        const cmd = pendingCommands.shift();
        executeCommand(cmd.commandId, cmd.command, cmd.params);
      }
    }
    
    function executeCommand(commandId, command, params) {
      params = params || {};
      
      switch (command) {
        case 'play':
          isPlaying = true;
          video.play()
            .then(() => {
              sendMessage('commandResult', { commandId, command: 'play', success: true, status: getStatus() });
            })
            .catch(e => {
              sendMessage('commandResult', { commandId, command: 'play', success: false, error: e.message, status: getStatus() });
            });
          break;
          
        case 'pause':
          isPlaying = false;
          video.pause();
          sendMessage('commandResult', { commandId, command: 'pause', success: true, status: getStatus() });
          break;
          
        case 'seek':
          const targetTime = (params.positionMs || 0) / 1000;
          const beforeTime = video.currentTime;
          let seekResolved = false;
          video.currentTime = targetTime;
          // Wait for seeked event before resolving
          const onSeeked = () => {
            if (seekResolved) return;
            seekResolved = true;
            video.removeEventListener('seeked', onSeeked);
            sendMessage('commandResult', { commandId, command: 'seek', success: true, via: 'seeked', requestedMs: params.positionMs || 0, beforeMs: Math.floor(beforeTime * 1000), status: getStatus() });
          };
          video.addEventListener('seeked', onSeeked);
          // Timeout fallback: report success=false with via:'timeout' so the
          // native side knows the seek was NOT confirmed and can retry.
          setTimeout(() => {
            if (seekResolved) return;
            seekResolved = true;
            video.removeEventListener('seeked', onSeeked);
            const landed = Math.abs(video.currentTime - targetTime) < 1.0;
            sendMessage('commandResult', { commandId, command: 'seek', success: landed, via: 'timeout', requestedMs: params.positionMs || 0, beforeMs: Math.floor(beforeTime * 1000), status: getStatus() });
          }, 1000);
          break;
          
        case 'setMuted':
          video.muted = !!params.muted;
          sendMessage('commandResult', { commandId, command: 'setMuted', success: true, status: getStatus() });
          break;
          
        case 'getStatus':
          sendMessage('commandResult', { commandId, command: 'getStatus', success: true, status: getStatus() });
          break;
      }
    }
    
    let loadTimeout = null;
    
    video.addEventListener('loadstart', () => {
      sendMessage('debug', { event: 'loadstart', src: video.currentSrc || video.src || 'unknown' });
      if (loadTimeout) clearTimeout(loadTimeout);
      loadTimeout = setTimeout(() => {
        if (!isVideoReady) {
          sendMessage('error', { 
            message: 'Video load timeout - no data received after 8s', 
            code: -2, 
            src: video.currentSrc || 'unknown',
            readyState: video.readyState,
            networkState: video.networkState
          });
        }
      }, 8000);
    });

    video.addEventListener('loadeddata', () => {
      if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
      isVideoReady = true;
      sendMessage('loaded', { 
        durationMillis: Math.floor(video.duration * 1000),
        width: video.videoWidth,
        height: video.videoHeight
      });
      animationId = requestAnimationFrame(renderFrame);
      processPendingCommands();
      if (isPlaying) {
        video.play().catch(e => sendMessage('error', { message: e.message }));
      }
    });

    video.addEventListener('stalled', () => {
      sendMessage('debug', { event: 'stalled', readyState: video.readyState, networkState: video.networkState });
      sendMessage('statusUpdate', getStatus());
    });

    video.addEventListener('waiting', () => {
      sendMessage('debug', { event: 'waiting', readyState: video.readyState, currentTime: video.currentTime });
      sendMessage('statusUpdate', getStatus());
    });

    video.addEventListener('playing', () => {
      sendMessage('statusUpdate', getStatus());
    });
    
    video.addEventListener('play', () => {
      sendMessage('statusUpdate', getStatus());
    });
    
    video.addEventListener('pause', () => {
      sendMessage('statusUpdate', getStatus());
    });
    
    video.addEventListener('ended', () => {
      sendMessage('ended', getStatus());
    });
    
    video.addEventListener('error', (e) => {
      var errCode = video.error ? video.error.code : -1;
      var errMsg = video.error ? video.error.message : 'Unknown video error';
      sendMessage('error', { message: errMsg, code: errCode, src: video.currentSrc || 'unknown' });
    });
    
    // Global command handler for React Native
    window.handleCommand = function(commandId, command, params) {
      if (!isVideoReady) {
        pendingCommands.push({ commandId, command, params });
        return;
      }
      executeCommand(commandId, command, params);
    };
    
    sendMessage('debug', { event: 'calling_video_load', src: '${videoUrl}'.substring(0, 120) });
    video.load();
  </script>
</body>
</html>
`;

export const ChromaKeyVideo = forwardRef<ChromaKeyVideoRef, ChromaKeyVideoProps>(({
  source,
  style,
  shouldPlay = false,
  isLooping = false,
  isMuted = false,
  onPlaybackStatusUpdate,
  onLoad,
  onError,
  greenThreshold = 0.95,
  greenMultiplier = 1.3,
  chromaSettings,
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const lastPlayState = useRef(false);
  const commandResolvers = useRef<Map<string, (status: AVPlaybackStatus) => void>>(new Map());
  const lastStatusRef = useRef<AVPlaybackStatus>({ isLoaded: false } as AVPlaybackStatus);
  const commandIdCounter = useRef(0);

  const createStatus = useCallback((data: any): AVPlaybackStatus => {
    const status: AVPlaybackStatusSuccess = {
      isLoaded: true,
      uri: source.uri,
      progressUpdateIntervalMillis: 100,
      positionMillis: data.positionMillis || 0,
      durationMillis: data.durationMillis || 0,
      playableDurationMillis: data.durationMillis || 0,
      shouldPlay: data.shouldPlay ?? data.isPlaying,
      isPlaying: data.isPlaying,
      isBuffering: data.isBuffering || false,
      rate: data.rate || 1,
      shouldCorrectPitch: false,
      volume: data.volume ?? (isMuted ? 0 : 1),
      isMuted: data.isMuted ?? isMuted,
      isLooping: isLooping,
      didJustFinish: data.didJustFinish || false,
      audioPan: 0,
    };
    lastStatusRef.current = status;
    return status;
  }, [source.uri, isMuted, isLooping]);

  const sendCommand = useCallback((command: string, params?: any): Promise<AVPlaybackStatus> => {
    return new Promise((resolve) => {
      if (!webViewRef.current) {
        resolve(lastStatusRef.current);
        return;
      }
      
      // Generate unique command ID
      const commandId = `cmd_${++commandIdCounter.current}_${Date.now()}`;
      commandResolvers.current.set(commandId, resolve);
      
      const paramsStr = params ? JSON.stringify(params) : '{}';
      webViewRef.current.injectJavaScript(`
        window.handleCommand('${commandId}', '${command}', ${paramsStr});
        true;
      `);
      
      // Timeout fallback - commands should resolve within 2 seconds
      setTimeout(() => {
        if (commandResolvers.current.has(commandId)) {
          commandResolvers.current.delete(commandId);
          resolve(lastStatusRef.current);
        }
      }, 2000);
    });
  }, []);

  useImperativeHandle(ref, () => ({
    playAsync: () => sendCommand('play'),
    pauseAsync: () => sendCommand('pause'),
    setPositionAsync: (positionMillis: number) => sendCommand('seek', { positionMs: positionMillis }),
    getStatusAsync: () => sendCommand('getStatus'),
  }), [sendCommand]);

  useEffect(() => {
    console.log('[ChromaKey] Source URI set:', source.uri?.substring(0, 150));
  }, [source.uri]);

  useEffect(() => {
    if (lastPlayState.current !== shouldPlay) {
      lastPlayState.current = shouldPlay;
      const command = shouldPlay ? 'play' : 'pause';
      console.log('[ChromaKey] Sending command:', command, 'isReady:', isReady);
      sendCommand(command);
    }
  }, [shouldPlay, sendCommand]);

  // When video becomes ready, send play command if shouldPlay is true
  useEffect(() => {
    if (isReady && shouldPlay) {
      console.log('[ChromaKey] Video ready, auto-starting playback');
      sendCommand('play');
    }
  }, [isReady, shouldPlay, sendCommand]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'loaded':
          console.log('[ChromaKey] Video loaded:', data);
          setIsReady(true);
          onLoad?.();
          break;
          
        case 'timeUpdate':
        case 'statusUpdate':
          const status = createStatus(data);
          onPlaybackStatusUpdate?.(status);
          break;
          
        case 'ended':
          const endStatus = createStatus({ ...data, didJustFinish: true, isPlaying: false });
          onPlaybackStatusUpdate?.(endStatus);
          break;
          
        case 'commandResult':
          if (data.commandId && data.status) {
            const resultStatus = createStatus(data.status);
            // Resolve the specific command by its ID
            const resolver = commandResolvers.current.get(data.commandId);
            if (resolver) {
              commandResolvers.current.delete(data.commandId);
              resolver(resultStatus);
            }
            // Also emit status update for timing sync
            onPlaybackStatusUpdate?.(resultStatus);
          }
          break;
          
        case 'debug':
          console.log('[ChromaKey] Debug:', data.event, data);
          break;

        case 'error':
          console.log('[ChromaKey] Video error:', data.message, 'code:', data.code);
          onError?.(data.message);
          break;
      }
    } catch (e) {
      console.log('[ChromaKey] Message parse error:', e);
    }
  }, [createStatus, onLoad, onPlaybackStatusUpdate, onError]);

  // Serialize the merged settings so an identical profile object never
  // triggers a WebView reload (JSON key comparison, not reference).
  const mergedSettingsJson = useMemo(() => JSON.stringify({
    ...DEFAULT_CHROMA_SETTINGS,
    sensitivity: greenThreshold,
    ...(chromaSettings || {}),
  }), [greenThreshold, chromaSettings && JSON.stringify(chromaSettings)]);

  const html = useMemo(() => generateChromaKeyHTML(
    source.uri,
    isLooping,
    isMuted,
    greenThreshold,
    greenMultiplier,
    JSON.parse(mergedSettingsJson)
  ), [source.uri, isLooping, isMuted, greenThreshold, greenMultiplier, mergedSettingsJson]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: 'file:///' }}
        style={styles.webView}
        originWhitelist={['*']}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        renderError={() => (
          <View style={{ flex: 1, backgroundColor: 'transparent' }} />
        )}
        onHttpError={(e) => {
          console.log('[ChromaKey] WebView HTTP error:', e.nativeEvent.statusCode, e.nativeEvent.url);
        }}
        onError={(e) => {
          console.log('[ChromaKey] WebView error:', e.nativeEvent);
          onError?.('WebView error');
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default ChromaKeyVideo;
