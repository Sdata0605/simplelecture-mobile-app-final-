import React, { useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

export interface V4MergedVideoCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onLoaded?: (duration: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onError?: (msg: string) => void;
}

// Mirrors V4AvatarRef so the player screen can drive the merged teaching video
// with the same orchestration it used for the chroma-key avatar WebView.
export interface V4MergedVideoRef {
  loadSection: (url: string, playbackRate: number, callbacks: V4MergedVideoCallbacks, fallbackUrl?: string) => void;
  prefetch: (url: string) => void;
  // Unload the current source and release the native AVC decoder. Called when
  // the player switches to WebView-avatar teaching so the two engines never
  // hold the device's single hardware decoder at the same time.
  clear: () => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

interface V4MergedVideoProps {
  style?: object;
}

// ---------------------------------------------------------------------------
// Single-surface native video player.
//
// One <Video> element whose `source` is swapped per section. We deliberately do
// NOT keep a second hidden <Video> mounted: two simultaneous decoder surfaces
// caused Android MediaCodec errors ("setSurface()/queueInputBuffer() is valid
// only at Executing states; currently at Released state") when the standby slot
// released its surface mid-stream. Section transitions stay fast because the
// preload manager downloads upcoming sections to the on-disk cache, so swapping
// the source loads a local file:// URI almost instantly. Native Video (unlike
// the WebView avatar) can play file:// cached URIs directly. The same player is
// reused to render the intro/summary avatar clip directly (no chroma keying).
// ---------------------------------------------------------------------------
export const V4MergedVideo = forwardRef<V4MergedVideoRef, V4MergedVideoProps>(({ style }, ref) => {
  const vidRef = useRef<Video>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [url, setUrl] = useState<string | null>(null);

  const callbacksRef = useRef<V4MergedVideoCallbacks>({});
  const urlRef = useRef<string | null>(null);
  // URL the current source has already reported `onLoaded` for — prevents
  // duplicate onLoaded callbacks across the stream of status updates.
  const loadedUrlRef = useRef<string | null>(null);
  // "The currently-assigned source has finished loading" flag. Driven by
  // onLoadStart (false) / onLoad (true). Gates status updates so a trailing tick
  // from the previous source can't be mistaken for the new source's stream.
  const readyRef = useRef(false);
  // Remote fallback to retry once if the primary (e.g. a cached file://) fails.
  const fallbackUrlRef = useRef<string | null>(null);
  const fallbackTriedRef = useRef(false);
  const mutedRef = useRef(false);

  const applyUrl = useCallback((u: string) => {
    readyRef.current = false;
    loadedUrlRef.current = null;
    urlRef.current = u;
    setUrl(u);
  }, []);

  useImperativeHandle(ref, () => ({
    loadSection(u, playbackRate, cbs, fallbackUrl) {
      callbacksRef.current = cbs;
      fallbackUrlRef.current = fallbackUrl && fallbackUrl !== u ? fallbackUrl : null;
      fallbackTriedRef.current = false;
      setRate(playbackRate);
      setIsPlaying(false);
      if (urlRef.current !== u) {
        applyUrl(u);
        return;
      }
      // Same source already mounted — restart from the top and re-report loaded.
      // This is an explicit reload request, so always re-fire onLoaded once the
      // status confirms the source is loaded; the caller relies on it to clear
      // pendingPlay and resume playback.
      const v = vidRef.current;
      v?.setStatusAsync({
        positionMillis: 0,
        rate: playbackRate,
        shouldCorrectPitch: true,
        isMuted: mutedRef.current,
        shouldPlay: false,
      }).catch(() => {});
      v?.getStatusAsync().then((st) => {
        if (st.isLoaded) {
          loadedUrlRef.current = u;
          callbacksRef.current.onLoaded?.((st.durationMillis ?? 0) / 1000);
        }
      }).catch(() => {});
    },
    // No-op: a single surface can't pre-buffer a second source. The preload
    // manager downloads upcoming sections to disk, so the swap is already fast.
    prefetch() {},
    // Fully release the native AVC decoder before the WebView avatar takes over.
    // Unsetting the source (and unloadAsync) ensures the device's single hardware
    // decoder is never held by both engines at once, in either transition direction.
    clear() {
      setIsPlaying(false);
      readyRef.current = false;
      loadedUrlRef.current = null;
      urlRef.current = null;
      fallbackUrlRef.current = null;
      fallbackTriedRef.current = false;
      vidRef.current?.unloadAsync().catch(() => {});
      setUrl(null);
    },
    play() { setIsPlaying(true); },
    pause() { setIsPlaying(false); },
    seek(seconds) { vidRef.current?.setPositionAsync(seconds * 1000).catch(() => {}); },
    setRate(r) { setRate(r); },
    setVolume(v) { setVolume(Math.max(0, Math.min(1, v))); },
    setMuted(m) { mutedRef.current = m; setMuted(m); },
  }), [applyUrl]);

  const handleLoadStart = useCallback(() => {
    readyRef.current = false;
  }, []);

  const handleLoad = useCallback((status: AVPlaybackStatus) => {
    readyRef.current = true;
    if (!status.isLoaded) return;
    const u = urlRef.current;
    if (u && u !== loadedUrlRef.current) {
      loadedUrlRef.current = u;
      callbacksRef.current.onLoaded?.((status.durationMillis ?? 0) / 1000);
    }
  }, []);

  const tryFallbackOrError = useCallback((msg: string) => {
    const fb = fallbackUrlRef.current;
    if (!fallbackTriedRef.current && fb && fb !== urlRef.current) {
      fallbackTriedRef.current = true;
      applyUrl(fb);
      return;
    }
    callbacksRef.current.onError?.(msg);
  }, [applyUrl]);

  const handleStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) tryFallbackOrError(status.error);
      return;
    }
    if (!readyRef.current) return;
    callbacksRef.current.onBuffering?.(!!status.isBuffering);
    callbacksRef.current.onTimeUpdate?.(
      (status.positionMillis ?? 0) / 1000,
      (status.durationMillis ?? 0) / 1000,
    );
    if (status.didJustFinish && !status.isLooping) {
      callbacksRef.current.onEnded?.();
    }
  }, [tryFallbackOrError]);

  const handleError = useCallback((e: string) => {
    tryFallbackOrError(e);
  }, [tryFallbackOrError]);

  return (
    <View
      style={[styles.container, style]}
      pointerEvents="none"
      onLayout={(e) => {
        const { x, y, width, height } = e.nativeEvent.layout;
        console.log(`[V4MergedVideo] container layout: x=${x} y=${y} w=${width} h=${height}`);
      }}
    >
      <Video
        ref={vidRef}
        style={StyleSheet.absoluteFill}
        source={url ? { uri: url } : undefined}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={isPlaying}
        rate={rate}
        shouldCorrectPitch
        isMuted={muted}
        volume={volume}
        progressUpdateIntervalMillis={100}
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onPlaybackStatusUpdate={handleStatus}
        onError={handleError}
      />
    </View>
  );
});

V4MergedVideo.displayName = 'V4MergedVideo';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
});

export default V4MergedVideo;
