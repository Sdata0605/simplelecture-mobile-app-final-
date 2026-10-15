import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width: SCREEN_W } = Dimensions.get('window');

export interface V3AvatarCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onLoaded?: (duration: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onError?: (msg: string) => void;
}

export interface V3AvatarRef {
  loadSection: (avatarUrl: string, playbackRate: number, callbacks: V3AvatarCallbacks, fallbackUrl?: string) => void;
  prefetch: (url: string) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

interface V3AvatarProps {
  style?: object;
  sectionType?: string;
  isFullscreen?: boolean;
}

// ---------------------------------------------------------------------------
// AVATAR_HTML — double-buffer pointer swap.
//
// Root cause fix (Task #34):
// WebView JS fetch() cannot access Expo's private cache directory
// (file:///data/user/0/.../cache/v3_cache/) on Android — hard OS restriction.
// The old AILecturePlayerScreen already knew this and always used remote HTTPS
// for ChromaKeyVideo. We do the same: exec('prefetch') now sets standbyRef.src
// directly to the remote HTTPS URL (no fetch, no blob), mirroring ChromaKeyVideo's
// <source src="..."> approach. The video element's native Android media framework
// loads remote HTTPS without restriction. Canvas getImageData works because
// allowUniversalAccessFromFileURLs=true disables same-origin checks for file:// pages.
//
// standbyLoadedFor: plain JS string set when standby's loadeddata fires.
// Cleared in doSwap and fallback path. Replaces unreliable src===url comparison.
// ---------------------------------------------------------------------------
const AVATAR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;background:transparent}
#vid0{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;background:transparent}
#vid1{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;}
#live{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;background:transparent}
#prev{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;background:transparent;pointer-events:none}
</style>
</head>
<body>
<div id="wrap">
  <video id="vid0" playsinline crossorigin="anonymous"></video>
  <video id="vid1" playsinline muted crossorigin="anonymous"></video>
  <canvas id="prev"></canvas>
  <canvas id="live"></canvas>
</div>
<script>
var vid0=document.getElementById('vid0');
var vid1=document.getElementById('vid1');
var vidRef=vid0;
var standbyRef=vid1;
var liveCanvas=document.getElementById('live');
var prevCanvas=document.getElementById('prev');
var liveCtx=liveCanvas.getContext('2d',{willReadFrequently:true});
var prevCtx=prevCanvas.getContext('2d');
var rafId=null;
var isReady=false;
var prevOpacity=0;
var prevFadeStart=0;
var FADE_MS=450;
var pendingCmds=[];
var canvasTainted=false;
var lastStatusTime=0;
var currentFallbackUrl='';
var fallbackAttempted=false;
// standbyLoadedFor: the remote HTTPS URL fully buffered in standbyRef.
// Set when standby's loadeddata fires in exec('prefetch').
// Cleared in doSwap and fallback reset.
var standbyLoadedFor=null;
var onStandbyLoaded=null;
var standbyPendingUrl=null;

const HUE_MIN=70,HUE_MAX=170,SAT_MIN=0.10,LIGHT_MIN=0.05,LIGHT_MAX=0.90,EDGE=15;
const SENS=0.92;

function msg(type,data){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type,...data}));}
function log(m){msg('log',{message:m});}

function getStatus(){return{positionMillis:Math.floor(vidRef.currentTime*1000),durationMillis:Math.floor((vidRef.duration||0)*1000),isPlaying:!vidRef.paused&&!vidRef.ended,isBuffering:vidRef.readyState<3,didJustFinish:vidRef.ended,rate:vidRef.playbackRate};}

function onEnded(){msg('ended',getStatus());}
function onWaiting(){msg('buffering',{isBuffering:true});}
function onPlaying(){msg('buffering',{isBuffering:false});}
function onError(){
  if(!fallbackAttempted&&currentFallbackUrl){
    fallbackAttempted=true;
    applyVideoSrc(currentFallbackUrl,vidRef.playbackRate,undefined,vidRef.muted);
  }else{
    msg('error',{message:vidRef.error?vidRef.error.message:'video error'});
  }
}
function listenPlayback(el){
  el.addEventListener('ended',onEnded);
  el.addEventListener('waiting',onWaiting);
  el.addEventListener('playing',onPlaying);
  el.addEventListener('error',onError);
}
function unlistenPlayback(el){
  el.removeEventListener('ended',onEnded);
  el.removeEventListener('waiting',onWaiting);
  el.removeEventListener('playing',onPlaying);
  el.removeEventListener('error',onError);
}
listenPlayback(vidRef);

function chromaKey(ctx,w,h){
  if(canvasTainted){liveCanvas.style.display='none';return;}
  if(w===0||h===0)return;
  try{
    const id=ctx.getImageData(0,0,w,h);
    const d=id.data;
    for(let i=0;i<d.length;i+=4){
      const r=d[i],g=d[i+1],b=d[i+2];
      if(g<10)continue;
      const mx=r>b?r:b;
      if(g<mx*0.85)continue;
      const rn=r/255,gn=g/255,bn=b/255;
      const cmax=Math.max(rn,gn,bn),cmin=Math.min(rn,gn,bn);
      const delta=cmax-cmin;
      if(delta<0.02)continue;
      let h=0;
      if(cmax===gn)h=60*(((bn-rn)/delta)+2);
      else if(cmax===rn)h=60*(((gn-bn)/delta)%6);
      else h=60*(((rn-gn)/delta)+4);
      if(h<0)h+=360;
      if(h<HUE_MIN-EDGE||h>HUE_MAX+EDGE)continue;
      const l=(cmax+cmin)/2;
      if(l<LIGHT_MIN||l>LIGHT_MAX)continue;
      const s=delta/(1-Math.abs(2*l-1));
      if(s<SAT_MIN)continue;
      const inCore=h>=HUE_MIN&&h<=HUE_MAX;
      const satStr=s>0.30?1.0:(s-SAT_MIN)/0.20;
      let alpha;
      if(inCore){
        const hd=Math.min(h-HUE_MIN,HUE_MAX-h)/((HUE_MAX-HUE_MIN)/2);
        alpha=Math.round(255*(1-satStr*(0.85+hd*0.15)*SENS));
      }else{
        const ed=h<HUE_MIN?HUE_MIN-h:h-HUE_MAX;
        const ef=1-(ed/EDGE);
        alpha=Math.round(255*(1-ef*ef*satStr*0.6*SENS));
      }
      d[i+3]=Math.max(0,Math.min(255,alpha));
      if(alpha>0&&alpha<220){const avg=(r+b)/2;if(g>avg)d[i+1]=Math.round(avg+(g-avg)*(alpha/255)*0.6);}
    }
    ctx.putImageData(id,0,0);
  }catch(e){
    if(e&&e.name==='SecurityError'){canvasTainted=true;liveCanvas.style.display='none';}
  }
}

function renderFrame(){
  if(vidRef.readyState<2){rafId=requestAnimationFrame(renderFrame);return;}
  const w=vidRef.videoWidth||liveCanvas.width;
  const h=vidRef.videoHeight||liveCanvas.height;
  if(liveCanvas.width!==w){liveCanvas.width=w;prevCanvas.width=w;}
  if(liveCanvas.height!==h){liveCanvas.height=h;prevCanvas.height=h;}
  liveCtx.clearRect(0,0,w,h);
  liveCtx.drawImage(vidRef,0,0,w,h);
  chromaKey(liveCtx,w,h);
  const now=performance.now();
  if(prevOpacity>0){
    const elapsed=now-prevFadeStart;
    const op=Math.max(0,1-(elapsed/FADE_MS));
    prevCanvas.style.opacity=String(op);
    prevOpacity=op;
    if(op<=0){prevCtx.clearRect(0,0,prevCanvas.width,prevCanvas.height);}
  }
  if(now-lastStatusTime>100){msg('timeUpdate',getStatus());lastStatusTime=now;}
  rafId=requestAnimationFrame(renderFrame);
}

function stampPrev(){
  prevCanvas.width=liveCanvas.width;
  prevCanvas.height=liveCanvas.height;
  prevCtx.drawImage(liveCanvas,0,0);
  prevCanvas.style.opacity='1';
  prevOpacity=1;
  prevFadeStart=performance.now();
}

function applyVideoSrc(src,rate,vol,mute){
  vidRef.src=src;
  vidRef.playbackRate=rate||1;
  if(vol!==undefined)vidRef.volume=Math.max(0,Math.min(1,vol));
  vidRef.muted=!!mute;
  vidRef.load();
}

function doSwap(rate,vol,mute){
  log('[WV-SWAP] start dur='+Math.round((standbyRef.duration||0)*1000)+'ms rdy='+standbyRef.readyState);
  unlistenPlayback(vidRef);
  var oldActive=vidRef;
  vidRef=standbyRef;
  standbyRef=oldActive;
  standbyRef.pause();
  try{standbyRef.removeAttribute('src');}catch(e){}
  listenPlayback(vidRef);
  standbyLoadedFor=null;
  standbyPendingUrl=null;
  vidRef.currentTime=0;
  vidRef.playbackRate=rate||1;
  if(vol!==undefined)vidRef.volume=Math.max(0,Math.min(1,vol));
  vidRef.muted=!!mute;
  isReady=true;
  if(!rafId)rafId=requestAnimationFrame(renderFrame);
  var durMs=Math.floor((vidRef.duration||0)*1000);
  log('[WV-SWAP] done newDur='+durMs+'ms rdy='+vidRef.readyState);
  msg('loaded',{durationMillis:durMs});
  while(pendingCmds.length){var c=pendingCmds.shift();exec(c.cmd,c.p);}
}

function exec(cmd,p){
  p=p||{};
  switch(cmd){
    case'play':
      vidRef.play().catch(function(){});
      break;
    case'pause':
      vidRef.pause();
      break;
    case'seek':
      vidRef.currentTime=(p.s||0);
      break;
    case'rate':
      vidRef.playbackRate=p.r||1;
      break;
    case'vol':
      if(p.v!==undefined)vidRef.volume=Math.max(0,Math.min(1,p.v));
      if(p.mute!==undefined)vidRef.muted=!!p.mute;
      break;
    case'load':
      stampPrev();
      vidRef.pause();
      isReady=false;
      pendingCmds=[];
      canvasTainted=false;
      liveCanvas.style.display='';
      fallbackAttempted=false;
      var loadUrl=p.url||'';
      var loadRate=p.rate||1;
      var loadVol=p.volume;
      var loadMute=!!p.mute;
      currentFallbackUrl=p.fallbackUrl||'';
      // Cancel any in-progress standby listener
      if(onStandbyLoaded){
        standbyRef.removeEventListener('loadeddata',onStandbyLoaded);
        onStandbyLoaded=null;
      }
      if(!loadUrl){break;}
      log('[WV-LOAD] url='+loadUrl.slice(-40)+' sbyFor='+(standbyLoadedFor?standbyLoadedFor.slice(-20):'null')+' sbyPend='+(standbyPendingUrl?standbyPendingUrl.slice(-20):'null')+' match='+(standbyLoadedFor===loadUrl));
      if(standbyLoadedFor===loadUrl){
        // Fast path: standby already buffered this URL — swap instantly
        log('[WV-LOAD] path:fast → doSwap');
        doSwap(loadRate,loadVol,loadMute);
      }else if(standbyPendingUrl===loadUrl){
        // Slow path: standby is still buffering — wait for loadeddata then swap.
        // Error listener ensures we degrade to direct load rather than stalling.
        log('[WV-LOAD] path:slow (standby buffering) url='+loadUrl.slice(-40));
        var capturedRate=loadRate;
        var capturedVol=loadVol;
        var capturedMute=loadMute;
        var capturedFallback=currentFallbackUrl||loadUrl;
        var onSlowError=function(){
          log('[WV-STANDBY] slow-path error → fallback direct load');
          standbyRef.removeEventListener('loadeddata',onStandbyLoaded);
          onStandbyLoaded=null;
          standbyPendingUrl=null;
          standbyLoadedFor=null;
          applyVideoSrc(capturedFallback,capturedRate,capturedVol,capturedMute);
        };
        onStandbyLoaded=function(){
          log('[WV-STANDBY] slow-path ready → doSwap');
          standbyRef.removeEventListener('error',onSlowError);
          onStandbyLoaded=null;
          standbyPendingUrl=null;
          standbyLoadedFor=null;
          doSwap(capturedRate,capturedVol,capturedMute);
        };
        standbyRef.addEventListener('loadeddata',onStandbyLoaded,{once:true});
        standbyRef.addEventListener('error',onSlowError,{once:true});
      }else{
        // Fallback: standby has wrong/no video — cancel standby and load directly
        log('[WV-LOAD] path:fallback url='+loadUrl.slice(-40));
        standbyPendingUrl=null;
        standbyLoadedFor=null;
        try{standbyRef.removeAttribute('src');}catch(e){}
        var srcToLoad=currentFallbackUrl||loadUrl;
        applyVideoSrc(srcToLoad,loadRate,loadVol,loadMute);
      }
      break;
    case'prefetch':
      // exec('prefetch') — direct remote HTTPS URL into standbyRef.
      // No fetch() used: WebView JS fetch() cannot access Expo cache (file:///).
      // Mirror ChromaKeyVideo: set video.src = remoteUrl directly.
      // Android media framework loads HTTPS without restriction.
      var pfUrl=p.url||'';
      if(!pfUrl||standbyPendingUrl||standbyLoadedFor===pfUrl)break;
      log('[WV-PREFETCH] loading standby url='+pfUrl.slice(-40));
      standbyRef.src=pfUrl;
      standbyRef.load();
      standbyPendingUrl=pfUrl;
      onStandbyLoaded=function(){
        // stale guard: if standbyPendingUrl changed, this load is obsolete
        if(standbyPendingUrl!==pfUrl)return;
        onStandbyLoaded=null;
        standbyPendingUrl=null;
        standbyLoadedFor=pfUrl;
        log('[WV-STANDBY] ready for='+pfUrl.slice(-40));
      };
      standbyRef.addEventListener('loadeddata',onStandbyLoaded,{once:true});
      break;
  }
}

window.handleV3Cmd=function(cmd,p){
  if(!isReady&&cmd!=='load'){pendingCmds.push({cmd,p});return;}
  exec(cmd,p);
};

function onLoadedData(e){
  if(e.currentTarget!==vidRef)return;
  isReady=true;
  msg('loaded',{durationMillis:Math.floor(vidRef.duration*1000)});
  if(!rafId)rafId=requestAnimationFrame(renderFrame);
  while(pendingCmds.length){var c=pendingCmds.shift();exec(c.cmd,c.p);}
}
vid0.addEventListener('loadeddata',onLoadedData);
vid1.addEventListener('loadeddata',onLoadedData);
msg('ready',{});
</script>
</body>
</html>`;

export const V3Avatar = forwardRef<V3AvatarRef, V3AvatarProps>(({ style, sectionType, isFullscreen }, ref) => {
  const webRef = useRef<WebView>(null);
  const callbacksRef = useRef<V3AvatarCallbacks>({});
  const volumeRef = useRef(1);
  const mutedRef = useRef(false);
  const webViewReadyRef = useRef(false);
  const pendingCmdsRef = useRef<Array<{ cmd: string; p: object }>>([]);

  useEffect(() => {
    console.log('[V3Avatar] ── MOUNT isFullscreen:', isFullscreen);
    return () => {
      console.log('[V3Avatar] ── UNMOUNT isFullscreen:', isFullscreen);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const injectCmd = useCallback((cmd: string, p: object) => {
    const js = `window.handleV3Cmd('${cmd}',${JSON.stringify(p)});true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  const sendCmd = useCallback((cmd: string, p: object = {}) => {
    if (!webViewReadyRef.current) {
      pendingCmdsRef.current.push({ cmd, p });
      return;
    }
    injectCmd(cmd, p);
  }, [injectCmd]);

  useImperativeHandle(ref, () => ({
    loadSection(avatarUrl: string, playbackRate: number, cbs: V3AvatarCallbacks, fallbackUrl?: string) {
      callbacksRef.current = cbs;
      sendCmd('load', { url: avatarUrl, rate: playbackRate, volume: volumeRef.current, mute: mutedRef.current, fallbackUrl: fallbackUrl ?? '' });
    },
    prefetch(url: string) { sendCmd('prefetch', { url }); },
    play() { sendCmd('play'); },
    pause() { sendCmd('pause'); },
    seek(seconds: number) { sendCmd('seek', { s: seconds }); },
    setRate(r: number) { sendCmd('rate', { r }); },
    setVolume(v: number) {
      volumeRef.current = Math.max(0, Math.min(1, v));
      sendCmd('vol', { v: volumeRef.current });
    },
    setMuted(muted: boolean) {
      mutedRef.current = muted;
      sendCmd('vol', { mute: muted });
    },
  }), [sendCmd]);

  const handleMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(e.nativeEvent.data) as {
        type: string;
        positionMillis?: number;
        durationMillis?: number;
        isBuffering?: boolean;
        message?: string;
      };
      switch (data.type) {
        case 'ready':
          webViewReadyRef.current = true;
          while (pendingCmdsRef.current.length > 0) {
            const c = pendingCmdsRef.current.shift()!;
            injectCmd(c.cmd, c.p);
          }
          break;
        case 'log':
          console.log('[WV]', data.message);
          break;
        case 'timeUpdate':
          callbacksRef.current.onTimeUpdate?.(
            (data.positionMillis ?? 0) / 1000,
            (data.durationMillis ?? 0) / 1000
          );
          break;
        case 'loaded':
          callbacksRef.current.onLoaded?.((data.durationMillis ?? 0) / 1000);
          break;
        case 'ended':
          callbacksRef.current.onEnded?.();
          break;
        case 'buffering':
          callbacksRef.current.onBuffering?.(data.isBuffering ?? false);
          break;
        case 'error':
          callbacksRef.current.onError?.(data.message ?? 'Unknown error');
          break;
      }
    } catch { /* ignore parse errors */ }
  }, [injectCmd]);

  const avatarStyle = sectionType === 'intro'
    ? styles.intro
    : isFullscreen
    ? styles.fullscreen
    : styles.defaultPos;

  return (
    <View style={[styles.container, avatarStyle, style]} pointerEvents="none">
      <WebView
        ref={webRef}
        source={{ html: AVATAR_HTML, baseUrl: 'file:///android_asset/' }}
        style={[styles.webview, { backgroundColor: 'transparent' }]}
        onMessage={handleMessage}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        scrollEnabled={false}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
      />
    </View>
  );
});

V3Avatar.displayName = 'V3Avatar';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  defaultPos: {
    right: 0,
    bottom: 0,
    height: '65%',
    width: '55%',
    transform: [{ translateX: Math.round(SCREEN_W * 0.55 * 0.20) }],
  },
  intro: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fullscreen: {
    right: 0,
    bottom: 0,
    height: '65%',
    width: '45%',
  },
});
