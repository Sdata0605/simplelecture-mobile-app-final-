import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Animated, PanResponder, LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { V4Section } from '../../services/v4PlayerService';
import { SubtitleMode } from './V4Subtitles';

const C = {
  bg: '#0d1117',
  surface: '#161b22',
  elevated: '#21262d',
  border: 'rgba(255,255,255,0.07)',
  text: '#e6edf3',
  muted: 'rgba(230,237,243,0.42)',
  gold: '#f6c44e',
  amber: '#ff9f43',
  rose: '#ff6b8a',
  sky: '#79c0ff',
  green: '#7ee787',
  teal: '#00d2b4',
};

const BADGE_COLORS: Record<string, string> = {
  intro: C.gold,
  content: C.teal,
  summary: C.sky,
  memory: C.rose,
  memory_infographic: C.rose,
  recap: C.green,
  quiz: C.rose,
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface V4ControlsTopProps {
  title: string;
  sections: V4Section[];
  currentIndex: number;
  onClose: () => void;
  /** Optional Notes action — opens the lecture-note editor. When omitted the
   *  Notes button is not rendered (e.g. preview mode with no note scope). */
  onNotes?: () => void;
  /** Highlights the Notes button while the editor panel is open. */
  notesActive?: boolean;
}

export function V4ControlsTop({ title, sections, currentIndex, onClose, onNotes, notesActive }: V4ControlsTopProps) {
  const currentSection = sections[currentIndex];
  const secType = (currentSection?.section_type || 'content').toLowerCase();
  const badgeColor = BADGE_COLORS[secType] || C.teal;

  return (
    <View style={topStyles.bar}>
      <TouchableOpacity onPress={onClose} style={topStyles.closeBtn} activeOpacity={0.7}>
        <Ionicons name="close" size={16} color={C.rose} />
      </TouchableOpacity>

      <View style={[topStyles.badge, { borderColor: badgeColor }]}>
        <Text style={[topStyles.badgeText, { color: badgeColor }]}>
          {(currentSection?.section_type || 'CONTENT').toUpperCase()}
        </Text>
      </View>

      <Text style={topStyles.title} numberOfLines={1}>{title}</Text>

      {onNotes && (
        <TouchableOpacity
          onPress={onNotes}
          style={[topStyles.notesBtn, notesActive && topStyles.notesBtnActive]}
          activeOpacity={0.7}
        >
          <Ionicons
            name={notesActive ? 'create' : 'create-outline'}
            size={15}
            color={notesActive ? C.gold : C.muted}
          />
        </TouchableOpacity>
      )}

      <View style={topStyles.dots}>
        {sections.map((_, i) => {
          const scale = sections.length > 16 ? 0.5 : sections.length > 12 ? 0.65 : 1;
          const past = i < currentIndex;
          const current = i === currentIndex;
          return (
            <View
              key={i}
              style={[
                topStyles.dot,
                past && topStyles.dotPast,
                current && topStyles.dotCurrent,
                !past && !current && topStyles.dotFuture,
                sections.length > 12 && {
                  width: (current ? 28 : 16) * scale,
                  height: 4 * scale,
                  borderRadius: 2 * scale,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const topStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,20,0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 42,
    gap: 8,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,107,138,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.1,
  },
  title: {
    flex: 1,
    fontSize: 12,
    color: C.text,
    fontFamily: 'Sora_400Regular',
  },
  notesBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notesBtnActive: {
    backgroundColor: 'rgba(246,196,78,0.12)',
    borderColor: 'rgba(246,196,78,0.5)',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  dot: {
    height: 5,
    borderRadius: 3,
    width: 6,
  },
  dotPast: {
    width: 16,
    backgroundColor: 'rgba(246,196,78,0.4)',
  },
  dotCurrent: {
    width: 28,
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  dotFuture: {
    width: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});

interface V4ControlsBottomProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  isMuted: boolean;
  sections: V4Section[];
  currentIndex: number;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolumeToggle: () => void;
  onSpeedChange: (rate: number) => void;
  onSectionSelect: (idx: number) => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  subtitleMode?: SubtitleMode;
  onSubtitleToggle?: () => void;
}

export function V4ControlsBottom({
  currentTime, duration, isPlaying, playbackRate, isMuted,
  sections, currentIndex, onPlayPause, onPrev, onNext,
  onSeek, onVolumeToggle, onSpeedChange, onSectionSelect, onFullscreen, isFullscreen,
  subtitleMode = 'karaoke', onSubtitleToggle,
}: V4ControlsBottomProps) {
  const [showSections, setShowSections] = useState(false);
  const speedIdx = SPEEDS.indexOf(playbackRate);
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const barLayout = useRef({ x: 0, width: 1 });
  const barViewRef = useRef<View>(null);
  const barExpand = useState(new Animated.Value(4))[0];

  const handleBarLayout = useCallback((_e: LayoutChangeEvent) => {
    barViewRef.current?.measure((_fx, _fy, width, _height, pageX) => {
      barLayout.current = { x: pageX, width: Math.max(1, width) };
    });
  }, []);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      Animated.timing(barExpand, { toValue: 6, duration: 100, useNativeDriver: false }).start();
    },
    onPanResponderMove: (_, g) => {
      const ratio = Math.max(0, Math.min(1, (g.moveX - barLayout.current.x) / barLayout.current.width));
      onSeek(ratio * duration);
    },
    onPanResponderRelease: (_, g) => {
      Animated.timing(barExpand, { toValue: 4, duration: 100, useNativeDriver: false }).start();
      const ratio = Math.max(0, Math.min(1, (g.moveX - barLayout.current.x) / barLayout.current.width));
      onSeek(ratio * duration);
    },
  });

  const nextSpeed = () => {
    const next = SPEEDS[(speedIdx + 1) % SPEEDS.length];
    onSpeedChange(next);
  };

  return (
    <>
      <View style={btmStyles.bar}>
        <View style={btmStyles.row1}>
          <Text style={btmStyles.time}>{formatTime(currentTime)}</Text>
          <View ref={barViewRef} style={btmStyles.seekTrack} onLayout={handleBarLayout} {...panResponder.panHandlers}>
            <Animated.View style={[btmStyles.seekInner, { height: barExpand }]}>
              <LinearGradient
                colors={[C.gold, C.amber]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[btmStyles.seekFill, { width: `${progress * 100}%` }]}
              />
            </Animated.View>
          </View>
          <Text style={btmStyles.time}>{formatTime(duration)}</Text>
        </View>

        <View style={btmStyles.row2}>
          <TouchableOpacity style={btmStyles.iconBtn} onPress={onPrev}>
            <Ionicons name="play-skip-back" size={16} color={C.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={btmStyles.playBtnWrapper} onPress={onPlayPause} activeOpacity={0.85}>
            <LinearGradient
              colors={[C.gold, C.amber]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={btmStyles.playBtn}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#1a1000" style={isPlaying ? {} : { marginLeft: 2 }} />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={btmStyles.iconBtn} onPress={onNext}>
            <Ionicons name="play-skip-forward" size={16} color={C.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={btmStyles.iconBtn} onPress={onVolumeToggle}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={16} color={C.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[btmStyles.ccBtn, { opacity: subtitleMode !== 'off' ? 1.0 : 0.4 }]}
            onPress={onSubtitleToggle}
          >
            <Text style={btmStyles.ccText}>CC</Text>
          </TouchableOpacity>

          <TouchableOpacity style={btmStyles.iconBtn} onPress={() => setShowSections(true)}>
            <Ionicons name="list" size={16} color={C.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={btmStyles.speedBtn} onPress={nextSpeed}>
            <Text style={btmStyles.speedText}>{playbackRate % 1 === 0 ? `${playbackRate}×` : `${playbackRate}×`}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={btmStyles.iconBtn} onPress={onFullscreen}>
            <Ionicons name={isFullscreen ? 'contract' : 'expand'} size={16} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showSections} transparent animationType="fade" onRequestClose={() => setShowSections(false)}>
        <TouchableOpacity style={panelStyles.backdrop} onPress={() => setShowSections(false)} activeOpacity={1}>
          <View style={panelStyles.panel}>
            <Text style={panelStyles.panelTitle}>Sections</Text>
            <ScrollView>
              {sections.map((sec, i) => (
                <TouchableOpacity
                  key={sec.section_id}
                  style={[panelStyles.row, i === currentIndex && panelStyles.rowActive]}
                  onPress={() => { onSectionSelect(i); setShowSections(false); }}
                >
                  <View style={[panelStyles.circle, i === currentIndex && panelStyles.circleActive]}>
                    <Text style={panelStyles.circleText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={panelStyles.secName} numberOfLines={1}>{sec.title}</Text>
                    <View style={[panelStyles.typeBadge, { borderColor: BADGE_COLORS[(sec.section_type || '').toLowerCase()] || C.teal }]}>
                      <Text style={[panelStyles.typeText, { color: BADGE_COLORS[(sec.section_type || '').toLowerCase()] || C.teal }]}>
                        {(sec.section_type || '').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={panelStyles.dur}>{formatTime(sec.narration?.total_duration_seconds || 0)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const btmStyles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(8,12,18,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    paddingBottom: 10,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'JetBrainsMono_400Regular',
    minWidth: 32,
    textAlign: 'center',
  },
  seekTrack: {
    flex: 1,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  seekInner: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  seekFill: {
    height: '100%',
    borderRadius: 3,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnWrapper: {
    borderRadius: 18,
    shadowColor: C.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtn: {
    paddingHorizontal: 6,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
  },
  speedText: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'JetBrainsMono_600SemiBold',
    letterSpacing: 0.1,
  },
  ccBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ccText: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'JetBrainsMono_600SemiBold',
    letterSpacing: 0.1,
  },
});

const panelStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: 'rgba(13,17,23,0.96)',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(246,196,78,0.12)',
    width: 240,
    maxHeight: '100%',
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  panelTitle: {
    fontSize: 13,
    color: C.text,
    fontFamily: 'Sora_700Bold',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  rowActive: {
    borderLeftWidth: 2,
    borderLeftColor: C.gold,
    backgroundColor: 'rgba(246,196,78,0.05)',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circleActive: {
    backgroundColor: C.gold,
  },
  circleText: {
    fontSize: 11,
    color: C.text,
    fontFamily: 'JetBrainsMono_500Medium',
  },
  secName: {
    fontSize: 12,
    color: C.text,
    fontFamily: 'Sora_400Regular',
    marginBottom: 2,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 8,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.1,
  },
  dur: {
    fontSize: 10,
    color: C.muted,
    fontFamily: 'JetBrainsMono_400Regular',
  },
});
