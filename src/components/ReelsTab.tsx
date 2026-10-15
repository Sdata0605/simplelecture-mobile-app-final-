import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Pressable,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';
import { supabase as supabaseService, PublishedReel } from '../services/supabase';

const colors = {
  primary: '#2BBD6E',
  primaryLight: '#DCFCE7',
  white: '#FFFFFF',
  text: '#1F2937',
  textLight: '#9CA3AF',
  black: '#000000',
};

interface ReelsTabProps {
  topicId?: string;
  chapterId?: string;
  all?: boolean;
  filterChapterIds?: string[] | null;
  filterTopicIds?: string[] | null;
}

interface ReelItemProps {
  reel: PublishedReel;
  index: number;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  height: number;
}

function ReelItem({ reel, index, isActive, muted, onToggleMute, height }: ReelItemProps) {
  const videoRef = useRef<Video>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [errored, setErrored] = useState(false);
  const wasBuffering = useRef(false);

  // Single-decoder rule (Android): only the ACTIVE reel gets a source, so at
  // most one expo-av Video decoder is ever live at a time. Mounting 2-3 live
  // decoders (the old active +/- 1 preload) stalls/crashes MediaCodec on
  // Android and the videos "just load forever".
  const hasSource = isActive;

  // When this reel becomes active, restart from the top and play. When it
  // becomes inactive, pause and reset so nothing plays in the background.
  useEffect(() => {
    const v = videoRef.current;
    if (isActive) {
      setPaused(false);
      setErrored(false);
      console.log(`[Reels] activate idx=${index} id=${reel.id} url=${reel.video_url}`);
      v?.setPositionAsync(0).catch(() => {});
      v?.playAsync().catch((e) => console.log(`[Reels] playAsync rejected idx=${index}`, e?.message || e));
    } else {
      setBuffering(false);
      v?.pauseAsync().catch(() => {});
      v?.setPositionAsync(0).catch(() => {});
    }
  }, [isActive, index, reel.id, reel.video_url]);

  // Pause on unmount.
  useEffect(() => {
    return () => {
      videoRef.current?.pauseAsync().catch(() => {});
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) {
      v.playAsync().catch(() => {});
      setPaused(false);
    } else {
      v.pauseAsync().catch(() => {});
      setPaused(true);
    }
  }, [paused]);

  const handleStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.log(`[Reels] status error idx=${index} id=${reel.id} url=${reel.video_url} err=${status.error}`);
        setErrored(true);
      }
      return;
    }
    if (status.isBuffering !== wasBuffering.current) {
      wasBuffering.current = status.isBuffering;
      console.log(`[Reels] buffering=${status.isBuffering} idx=${index} id=${reel.id} pos=${status.positionMillis ?? '?'} dur=${status.durationMillis ?? '?'}`);
    }
    setBuffering(!!status.isBuffering);
  }, [index, reel.id, reel.video_url]);

  return (
    <Pressable
      style={[styles.slide, { height }]}
      onPress={togglePlayPause}
      testID={`reel-slide-${reel.id}`}
    >
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFill}
        source={hasSource ? { uri: reel.video_url } : undefined}
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        isMuted={muted}
        shouldPlay={isActive && !paused}
        progressUpdateIntervalMillis={500}
        onLoadStart={() => console.log(`[Reels] loadStart idx=${index} id=${reel.id} url=${reel.video_url}`)}
        onLoad={(s) => console.log(`[Reels] loaded idx=${index} id=${reel.id} dur=${(s as any)?.durationMillis ?? '?'}`)}
        onError={(e) => {
          console.log(`[Reels] onError idx=${index} id=${reel.id} url=${reel.video_url} err=${typeof e === 'string' ? e : JSON.stringify(e)}`);
          setErrored(true);
        }}
        onPlaybackStatusUpdate={handleStatus}
      />

      {errored && isActive && (
        <View style={styles.centerOverlay}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.white} />
          <Text style={styles.errorText}>Couldn't play this reel</Text>
        </View>
      )}

      {buffering && isActive && !errored && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      )}

      {paused && isActive && !buffering && !errored && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.playBadge}>
            <Ionicons name="play" size={36} color={colors.white} />
          </View>
        </View>
      )}

      {!!reel.title && (
        <View style={styles.titleBar} pointerEvents="none">
          <Text style={styles.titleText} numberOfLines={2}>{reel.title}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.muteButton}
        onPress={onToggleMute}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        testID="button-toggle-mute"
      >
        <Ionicons
          name={muted ? 'volume-mute' : 'volume-high'}
          size={20}
          color={colors.white}
        />
      </TouchableOpacity>
    </Pressable>
  );
}

export default function ReelsTab({
  topicId,
  chapterId,
  all,
  filterChapterIds,
  filterTopicIds,
}: ReelsTabProps) {
  const [reels, setReels] = useState<PublishedReel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [containerHeight, setContainerHeight] = useState(
    Dimensions.get('window').height
  );

  // When the screen this feed lives on is not focused (e.g. the user switched
  // to another bottom tab), no reel should be considered active. Tab screens
  // stay mounted, so without this the active reel keeps playing in the
  // background. Funneling focus through `isActive` also releases the single
  // video source, fully stopping all reel playback off-screen.
  const isFocused = useIsFocused();

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        console.log(`[Reels] viewable -> activeIndex=${viewableItems[0].index}`);
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfigCallbackPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged },
  ]).current;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!all && !topicId && !chapterId) {
        console.log('[Reels] no topicId/chapterId -> empty');
        setReels([]);
        setIsLoading(false);
        return;
      }
      console.log(`[Reels] fetching ${all ? 'ALL (global)' : `topicId=${topicId ?? '-'} chapterId=${chapterId ?? '-'}`}`);
      setIsLoading(true);
      setError(null);
      const result = all
        ? await supabaseService.getPublishedReels()
        : await supabaseService.getPublishedReels(topicId, chapterId);
      if (cancelled) return;
      if (result.success) {
        const list = result.reels || [];
        console.log(`[Reels] fetched ${list.length} reels; first url=${list[0]?.video_url ?? '(none)'}`);
        setReels(list);
        setActiveIndex(0);
      } else {
        console.log(`[Reels] fetch failed: ${result.error}`);
        setError(result.error || 'Could not load reels.');
        setReels([]);
      }
      setIsLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [topicId, chapterId, all]);

  const isFiltered = !!(filterChapterIds || filterTopicIds);

  const visibleReels = useMemo(() => {
    if (!isFiltered) return reels;
    const chSet = new Set(filterChapterIds ?? []);
    const tpSet = new Set(filterTopicIds ?? []);
    return reels.filter(
      (r) =>
        (r.chapter_id != null && chSet.has(r.chapter_id)) ||
        (r.topic_id != null && tpSet.has(r.topic_id))
    );
  }, [reels, isFiltered, filterChapterIds, filterTopicIds]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filterChapterIds, filterTopicIds]);

  if (isLoading) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.stateText}>Loading reels...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
        <Text style={styles.stateTitle}>Couldn't load reels</Text>
        <Text style={styles.stateText}>{error}</Text>
      </View>
    );
  }

  if (visibleReels.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="film-outline" size={48} color={colors.textLight} />
        <Text style={styles.stateTitle}>No reels yet</Text>
        <Text style={styles.stateText}>
          {isFiltered
            ? 'No reels found for this selection. Try a different course, subject, or chapter.'
            : all
            ? 'No reels have been published yet. Check back soon!'
            : 'There are no reels published for this topic yet. Check back soon!'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        console.log(`[Reels] container height=${h}`);
        setContainerHeight(h);
      }}
    >
      <FlatList
        data={visibleReels}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            index={index}
            isActive={index === activeIndex && isFocused}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            height={containerHeight}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  slide: {
    width: '100%',
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  playBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBar: {
    position: 'absolute',
    left: 16,
    right: 64,
    bottom: 24,
  },
  titleText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  muteButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
    backgroundColor: colors.white,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
  },
  stateText: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
});
