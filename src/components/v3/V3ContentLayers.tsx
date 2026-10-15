import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { V3Section, resolveV3MediaUrl, getCachedUrl } from '../../services/v3PlayerService';

interface V3ContentLayersProps {
  section: V3Section;
  jobId: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
}

// Each beat entry stores both the cached local URL and the original remote URL.
// If the cached file is corrupt, onSlotError falls back to the remoteUrl.
interface BeatEntry {
  start: number;
  end: number;
  url: string;       // getCachedUrl result: file:// when cached, https:// otherwise
  remoteUrl: string; // always the original https:// URL
}

function normalizeBeatPath(path: string): string {
  if (!path) return path;
  if (path.startsWith('http')) return path;
  const hasFolder = path.includes('videos/') || path.includes('manim/') || path.includes('beats/');
  let p = hasFolder ? path : `videos/${path}`;
  if (!p.match(/\.(mp4|webm|mov)$/i)) p += '.mp4';
  return p;
}

export default function V3ContentLayers({
  section,
  jobId,
  currentTime,
  isPlaying,
  playbackRate,
}: V3ContentLayersProps) {
  // ─── Double-buffer beat video ───────────────────────────────────────────────
  const [urlA, setUrlA] = useState<string | null>(null);
  const [urlB, setUrlB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const videoRefA = useRef<Video>(null);
  const videoRefB = useRef<Video>(null);

  // Refs to avoid stale closures
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const urlARef = useRef<string | null>(null);
  const urlBRef = useRef<string | null>(null);
  // Remote (fallback) URLs for each slot — used if the cached file is corrupt
  const remoteUrlARef = useRef<string | null>(null);
  const remoteUrlBRef = useRef<string | null>(null);
  // Duration refs — stored so drift correction can use (expectedOffset % duration)
  // to avoid overflow on looping videos.
  const durationARef = useRef<number>(0);
  const durationBRef = useRef<number>(0);

  const standbyReadyUrlRef = useRef<string | null>(null);
  const swapOnLoadRef = useRef(false);

  activeSlotRef.current = activeSlot;
  urlARef.current = urlA;
  urlBRef.current = urlB;

  // ─── Other layers ───────────────────────────────────────────────────────────
  const manimVideoRef = useRef<Video>(null);
  const [activeManimUrl, setActiveManimUrl] = useState<string | null>(null);
  const [activeManimRemoteUrl, setActiveManimRemoteUrl] = useState<string | null>(null);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const imageOpacity = useRef(new Animated.Value(0)).current;

  const lastBeatUrlRef = useRef<string | null>(null);
  const lastManimRef = useRef<string | null>(null);
  const lastImageRef = useRef<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard for sparse manim drift correction — tracks last time setPositionAsync
  // was called so we don't correct more often than once per 2 000 ms.
  const lastManimSyncRef = useRef<number>(0);
  const beatScheduleRef = useRef<BeatEntry[]>([]);
  const imageScheduleRef = useRef<BeatEntry[]>([]);
  const currentTimeRef = useRef(currentTime);
  const activeBeatStartRef = useRef<number>(0);

  currentTimeRef.current = currentTime;

  // ─── URL helpers ─────────────────────────────────────────────────────────────
  function makeUrlPair(path: string): { url: string; remoteUrl: string } {
    const remote = resolveV3MediaUrl(jobId, normalizeBeatPath(path));
    return { url: getCachedUrl(remote), remoteUrl: remote };
  }
  function makeImageUrl(path: string): string {
    if (!path) return '';
    const remote = path.startsWith('http') ? path : resolveV3MediaUrl(jobId, path);
    return getCachedUrl(remote);
  }

  // ─── Standby slot helper — stores both URL and its remote fallback ───────────
  function setStandbyUrl(url: string, remoteUrl: string) {
    const standby = activeSlotRef.current === 'A' ? 'B' : 'A';
    if (standby === 'A') {
      setUrlA(url); urlARef.current = url; remoteUrlARef.current = remoteUrl;
    } else {
      setUrlB(url); urlBRef.current = url; remoteUrlBRef.current = remoteUrl;
    }
  }

  // ─── Slot onLoad — swap standby to active when it finishes loading ───────────
  const onSlotLoaded = useCallback((slot: 'A' | 'B', durationMillis?: number) => {
    const slotUrl = slot === 'A' ? urlARef.current : urlBRef.current;
    const isStandby = slot !== activeSlotRef.current;

    // Store duration for future overflow-safe drift correction
    if (durationMillis && durationMillis > 0) {
      if (slot === 'A') durationARef.current = durationMillis;
      else durationBRef.current = durationMillis;
    }

    if (isStandby) {
      standbyReadyUrlRef.current = slotUrl;
      if (swapOnLoadRef.current) {
        swapOnLoadRef.current = false;
        activeSlotRef.current = slot;
        setActiveSlot(slot);
        const ref = slot === 'A' ? videoRefA : videoRefB;
        const dur = slot === 'A' ? durationARef.current : durationBRef.current;
        const rawOffset = Math.max(0, (currentTimeRef.current - activeBeatStartRef.current) * 1000);
        // Use modulo to avoid seeking past end on looping videos
        const offset = dur > 0 ? rawOffset % dur : rawOffset;
        if (offset > 200) {
          ref.current?.setPositionAsync(offset).catch(() => {});
        }
      }
    }
  }, []);

  // ─── Slot onError — retry corrupt cached file with remote URL ────────────────
  const onSlotError = useCallback((slot: 'A' | 'B') => {
    const currentUrl = slot === 'A' ? urlARef.current : urlBRef.current;
    const remoteUrl = slot === 'A' ? remoteUrlARef.current : remoteUrlBRef.current;
    if (remoteUrl && remoteUrl !== currentUrl) {
      console.warn(`[V3ContentLayers] Beat slot ${slot} load error — retrying with remote URL`);
      if (slot === 'A') { setUrlA(remoteUrl); urlARef.current = remoteUrl; }
      else { setUrlB(remoteUrl); urlBRef.current = remoteUrl; }
    }
  }, []);

  // ─── Core: switch to a new beat ──────────────────────────────────────────────
  const switchBeat = useCallback((url: string, beatStart: number, remoteUrl: string) => {
    activeBeatStartRef.current = beatStart;
    lastBeatUrlRef.current = url;

    if (standbyReadyUrlRef.current === url) {
      // Standby already loaded this URL → instant swap
      swapOnLoadRef.current = false;
      const standby = activeSlotRef.current === 'A' ? 'B' : 'A';
      activeSlotRef.current = standby;
      setActiveSlot(standby);
      standbyReadyUrlRef.current = null;
      const ref = standby === 'A' ? videoRefA : videoRefB;
      const dur = standby === 'A' ? durationARef.current : durationBRef.current;
      const rawOffset = Math.max(0, (currentTimeRef.current - beatStart) * 1000);
      const offset = dur > 0 ? rawOffset % dur : rawOffset;
      if (offset > 200) {
        ref.current?.setPositionAsync(offset).catch(() => {});
      }
    } else {
      swapOnLoadRef.current = true;
      standbyReadyUrlRef.current = null;
      setStandbyUrl(url, remoteUrl);
    }
  }, []);

  // ─── Preload NEXT beat into standby without swapping ────────────────────────
  const preloadNextBeat = useCallback((url: string, remoteUrl: string) => {
    const standby = activeSlotRef.current === 'A' ? 'B' : 'A';
    const standbyUrl = standby === 'A' ? urlARef.current : urlBRef.current;
    if (standbyUrl === url || standbyReadyUrlRef.current === url) return;
    if (swapOnLoadRef.current) return;
    setStandbyUrl(url, remoteUrl);
  }, []);

  // ─── Build schedules when section changes ────────────────────────────────────
  useEffect(() => {
    const beats: BeatEntry[] = [];
    const images: BeatEntry[] = [];
    const segs = section.narration?.segments || [];
    const hasStrategyA = (section.visual_beats?.length ?? 0) > 0;

    if (hasStrategyA) {
      for (const vb of (section.visual_beats || [])) {
        const start = vb.beat_start_seconds ?? 0;
        const end = vb.beat_end_seconds ?? 9999;
        const isImg = vb.visual_type === 'image' || vb.visual_type === 'infographic';
        if (isImg) {
          const src = vb.image_source || vb.image_url || vb.video_path;
          if (src) images.push({ start, end, url: makeImageUrl(src), remoteUrl: makeImageUrl(src) });
        } else {
          const src = vb.video_path || vb.video_url;
          if (src) {
            const pair = makeUrlPair(src);
            beats.push({ start, end, ...pair });
          }
        }
      }
    }

    if (!hasStrategyA && (section.beat_video_paths?.length ?? 0) > 0) {
      let cumTime = 0;
      (section.beat_video_paths || []).forEach((path, i) => {
        const seg = segs[i];
        const dur = seg?.duration_seconds ?? seg?.duration ?? 0;
        const start = cumTime;
        const end = cumTime + (dur || 4);
        const pair = makeUrlPair(path);
        beats.push({ start, end, ...pair });
        cumTime += dur || 4;
      });
    }

    if (beats.length === 0) {
      let cumTime = 0;
      for (const seg of segs) {
        const segStart = seg.start_seconds ?? cumTime;
        const segDur = seg.duration_seconds ?? seg.duration ?? 0;
        const segEnd = segStart + (segDur || 4);
        if (seg.beat_videos?.length) {
          const pair = makeUrlPair(seg.beat_videos[0]);
          beats.push({ start: segStart, end: segEnd, ...pair });
        } else if (seg.video_path) {
          const pair = makeUrlPair(seg.video_path);
          beats.push({ start: segStart, end: segEnd, ...pair });
        }
        cumTime = segEnd;
      }
    }

    for (const vb of (section.render_spec?.infographic_beats || [])) {
      const start = vb.beat_start_seconds ?? vb.start_seconds ?? 0;
      const end = vb.beat_end_seconds ?? vb.end_seconds ?? 9999;
      const src = vb.image_url || vb.image_source || vb.video_path;
      if (src) images.push({ start, end, url: makeImageUrl(src), remoteUrl: makeImageUrl(src) });
    }

    beatScheduleRef.current = beats;
    imageScheduleRef.current = images;

    // Reset buffer state for new section
    lastBeatUrlRef.current = null;
    lastImageRef.current = null;
    standbyReadyUrlRef.current = null;
    swapOnLoadRef.current = false;
    activeSlotRef.current = 'A';
    setActiveSlot('A');
    urlARef.current = null;
    urlBRef.current = null;
    remoteUrlARef.current = null;
    remoteUrlBRef.current = null;
    durationARef.current = 0;
    durationBRef.current = 0;
    setUrlA(null);
    setUrlB(null);

    // Load first beat into slot A; preload second beat into slot B immediately
    const first = beats[0];
    if (first) {
      activeBeatStartRef.current = first.start;
      lastBeatUrlRef.current = first.url;
      setUrlA(first.url);
      urlARef.current = first.url;
      remoteUrlARef.current = first.remoteUrl;
      const second = beats[1];
      if (second) {
        setUrlB(second.url);
        urlBRef.current = second.url;
        remoteUrlBRef.current = second.remoteUrl;
      }
    }

    return () => {
      videoRefA.current?.pauseAsync().catch(() => {});
      videoRefB.current?.pauseAsync().catch(() => {});
      manimVideoRef.current?.pauseAsync().catch(() => {});
      lastBeatUrlRef.current = null;
      lastManimRef.current = null;
      lastImageRef.current = null;
    };
  }, [section.section_id]);

  // ─── Time-driven beat + image switching ──────────────────────────────────────
  // NOTE: Per-frame drift correction for beat slots has been intentionally removed.
  // Beat videos use isLooping=true — the "expectedOffset" calculation grows without
  // bound, overflowing the video duration on each loop cycle and triggering a bad
  // setPositionAsync seek past the end of the video (freeze/stutter). The only
  // required sync is the initial seek in switchBeat / onSlotLoaded, which runs
  // once per beat switch. Looping background beats do not need frame-accurate sync.
  useEffect(() => {
    const schedule = beatScheduleRef.current;

    if (schedule.length > 0) {
      const match = schedule.find(b => currentTime >= b.start && currentTime < b.end);
      const beat = match ?? schedule[0];
      const beatUrl = beat?.url ?? null;
      const beatStart = beat?.start ?? 0;
      const beatRemote = beat?.remoteUrl ?? beatUrl ?? '';

      if (beatUrl && beatUrl !== lastBeatUrlRef.current) {
        switchBeat(beatUrl, beatStart, beatRemote);
      }

      // Preload NEXT beat into standby
      if (match) {
        const idx = schedule.indexOf(match);
        const next = schedule[idx + 1];
        if (next) preloadNextBeat(next.url, next.remoteUrl);
      }
    }

    // Images
    const imgMatch = imageScheduleRef.current.find(b => currentTime >= b.start && currentTime < b.end);
    const imageUrl = imgMatch?.url ?? null;
    if (imageUrl !== lastImageRef.current) {
      lastImageRef.current = imageUrl;
      if (imageUrl) {
        setActiveImageUrl(imageUrl);
        Animated.timing(imageOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      } else {
        Animated.timing(imageOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(
          () => setActiveImageUrl(null)
        );
      }
    }
  }, [currentTime, switchBeat, preloadNextBeat]);

  // ─── Manim ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const manimPaths = section.manim_video_paths;
    if (manimPaths?.length) {
      const pair = makeUrlPair(manimPaths[0]);
      if (pair.url !== lastManimRef.current) {
        lastManimRef.current = pair.url;
        lastManimSyncRef.current = 0;
        setActiveManimUrl(pair.url);
        setActiveManimRemoteUrl(pair.remoteUrl);
      }
    } else {
      lastManimRef.current = null;
      setActiveManimUrl(null);
      setActiveManimRemoteUrl(null);
    }
  }, [section.section_id]);

  // Sparse manim drift correction — at most once per 1 000 ms, only if drift
  // exceeds 1 000 ms AND ≥ 2 000 ms have elapsed since the last correction.
  // This matches the old AI Lecture Player's cadence and avoids the 8×/sec
  // getStatusAsync storm that the previous 120 ms interval caused.
  useEffect(() => {
    if (!activeManimUrl || !manimVideoRef.current) return;
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);

    syncIntervalRef.current = setInterval(async () => {
      if (!manimVideoRef.current) return;
      const now = Date.now();
      if (now - lastManimSyncRef.current < 2000) return;
      try {
        const status: AVPlaybackStatus | null = await manimVideoRef.current.getStatusAsync() ?? null;
        if (!status || !status.isLoaded) return;
        const driftMs = Math.abs(status.positionMillis - currentTimeRef.current * 1000);
        if (driftMs > 1000) {
          await manimVideoRef.current.setPositionAsync(currentTimeRef.current * 1000);
          lastManimSyncRef.current = Date.now();
        }
      } catch { }
    }, 1000);

    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [activeManimUrl]);

  if ((section.section_type || '').toLowerCase() === 'quiz') return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Beat slot A — progressUpdateIntervalMillis=0 suppresses expo-av's automatic
          status callbacks; looping background beats need no position reporting. */}
      {urlA && (
        <Video
          ref={videoRefA}
          source={{ uri: urlA }}
          style={[styles.beatVideo, { opacity: activeSlot === 'A' ? 1 : 0 }]}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying && activeSlot === 'A'}
          isLooping
          isMuted
          rate={playbackRate}
          progressUpdateIntervalMillis={0}
          onLoad={(s) => onSlotLoaded('A', s.isLoaded ? s.durationMillis : undefined)}
          onError={() => onSlotError('A')}
        />
      )}
      {/* Beat slot B */}
      {urlB && (
        <Video
          ref={videoRefB}
          source={{ uri: urlB }}
          style={[styles.beatVideo, { opacity: activeSlot === 'B' ? 1 : 0 }]}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying && activeSlot === 'B'}
          isLooping
          isMuted
          rate={playbackRate}
          progressUpdateIntervalMillis={0}
          onLoad={(s) => onSlotLoaded('B', s.isLoaded ? s.durationMillis : undefined)}
          onError={() => onSlotError('B')}
        />
      )}
      {activeManimUrl && (
        <Video
          ref={manimVideoRef}
          source={{ uri: activeManimUrl }}
          style={styles.manimVideo}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying}
          isLooping={false}
          isMuted
          rate={playbackRate}
          progressUpdateIntervalMillis={0}
          onReadyForDisplay={() => {
            // Seek to the current narration time when the manim video first becomes
            // ready — ensures it starts at the correct position rather than t=0.
            const seekTo = currentTimeRef.current * 1000;
            if (seekTo > 200) {
              manimVideoRef.current?.setPositionAsync(seekTo).catch(() => {});
            }
            lastManimSyncRef.current = Date.now();
          }}
          onError={() => {
            if (activeManimRemoteUrl && activeManimRemoteUrl !== activeManimUrl) {
              setActiveManimUrl(activeManimRemoteUrl);
            }
          }}
        />
      )}
      {activeImageUrl && (
        <Animated.View style={[styles.imageLayer, { opacity: imageOpacity }]}>
          <Image source={{ uri: activeImageUrl }} style={styles.image} resizeMode="contain" />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  beatVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  manimVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
