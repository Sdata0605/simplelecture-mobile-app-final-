import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WordTiming, getKaraokeState } from '../../hooks/useV4Karaoke';

export type SubtitleMode = 'karaoke' | 'full' | 'off';

interface V4SubtitlesProps {
  timings: WordTiming[];
  currentTime: number;
  mode?: SubtitleMode;
}

export default function V4Subtitles({ timings, currentTime, mode = 'karaoke' }: V4SubtitlesProps) {
  const { activeSentenceIndex, activeWordIndex } = useMemo(
    () => getKaraokeState(timings, currentTime),
    [timings, currentTime]
  );

  const sentenceWords = useMemo(
    () => timings.filter(w => w.sentenceIndex === activeSentenceIndex),
    [timings, activeSentenceIndex]
  );

  if (mode === 'off' || sentenceWords.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.row}>
        {sentenceWords.map((wt, i) => {
          const globalIdx = timings.indexOf(wt);
          const isActive = mode === 'karaoke' && globalIdx === activeWordIndex;
          const isSpoken = mode === 'karaoke' && globalIdx < activeWordIndex;
          const isFull = mode === 'full';
          return (
            <React.Fragment key={`${wt.sentenceIndex}-${i}`}>
              <Text
                style={[
                  styles.word,
                  (isSpoken || isFull) && styles.spokenWord,
                  isActive && styles.activeWord,
                ]}
              >
                {wt.word}
              </Text>
              {i < sentenceWords.length - 1 && (
                <Text style={styles.space}> </Text>
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    left: 8,
    right: 8,
    alignItems: 'center',
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  word: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Sora_400Regular',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 22,
  },
  spokenWord: {
    color: '#e6edf3',
  },
  activeWord: {
    fontSize: 15,
    color: '#f6c44e',
    fontFamily: 'Sora_600SemiBold',
    textShadowColor: 'rgba(246,196,78,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  space: {
    color: 'transparent',
    fontSize: 12,
  },
});
