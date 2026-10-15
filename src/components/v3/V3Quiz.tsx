import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Image } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { V3QuizItem } from '../../services/v3PlayerService';
import { V3AvatarRef } from './V3Avatar';

interface V3QuizProps {
  questions: V3QuizItem[];
  jobId: string;
  avatarRef: React.RefObject<V3AvatarRef | null>;
  onComplete: () => void;
  resolveUrl: (path: string, type?: 'avatar' | 'video' | 'image') => string;
  isFullscreen?: boolean;
}

type QuizPhase = 'question' | 'answered' | 'explanation';

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
};

export default function V3Quiz({ questions, jobId, avatarRef, onComplete, resolveUrl, isFullscreen }: V3QuizProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<QuizPhase>('question');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealedOptions, setRevealedOptions] = useState<number>(0);
  const optionAnims = useRef<Animated.Value[]>([]);
  const optionOpacities = useRef<Animated.Value[]>([]);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const currentQ = questions[currentIdx];

  const clearAllTimers = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    revealTimersRef.current.forEach(t => clearTimeout(t));
    revealTimersRef.current = [];
  }, []);

  const initOptionAnims = useCallback((count: number) => {
    optionAnims.current = Array.from({ length: count }, () => new Animated.Value(8));
    optionOpacities.current = Array.from({ length: count }, () => new Animated.Value(0));
    setRevealedOptions(0);
  }, []);

  const advance = useCallback(() => {
    clearAllTimers();
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(i => i + 1);
    } else {
      onComplete();
    }
  }, [currentIdx, questions.length, onComplete, clearAllTimers]);

  const moveToExplanation = useCallback((q: V3QuizItem) => {
    setPhase('explanation');
    const clip = q.avatar_clips?.explanation;
    if (clip) {
      // Clip exists: onEnded is the primary advance trigger.
      // If explanation_visual also exists, wait 900ms after clip ends so user sees the visual.
      // 30s long safety fallback in case onEnded never fires.
      const hasVisual = !!q.explanation_visual;
      avatarRef.current?.loadSection(resolveUrl(clip), 1, {
        onEnded: () => {
          if (hasVisual) {
            advanceTimerRef.current = setTimeout(() => advance(), 900);
          } else {
            advance();
          }
        },
      });
      avatarRef.current?.play();
      advanceTimerRef.current = setTimeout(() => advance(), 30000);
    } else if (q.explanation_visual) {
      // No clip but has a visual — 900ms per spec
      advanceTimerRef.current = setTimeout(() => advance(), 900);
    } else if (q.explanation) {
      // Text-only explanation — give user time to read
      advanceTimerRef.current = setTimeout(() => advance(), 3000);
    } else {
      advanceTimerRef.current = setTimeout(() => advance(), 1500);
    }
  }, [advance, resolveUrl, avatarRef]);

  useEffect(() => {
    if (!currentQ) return;
    clearAllTimers();
    setPhase('question');
    setSelectedOption(null);
    initOptionAnims(currentQ.options.length);

    if (currentQ.avatar_clips?.question) {
      const clipUrl = resolveUrl(currentQ.avatar_clips.question);
      avatarRef.current?.loadSection(clipUrl, 1, { onEnded: () => {} });
      avatarRef.current?.play();
    }

    const reveals = currentQ.option_reveal_seconds
      ?? currentQ.narration?.option_reveal_seconds;

    const timers: ReturnType<typeof setTimeout>[] = [];
    currentQ.options.forEach((_, i) => {
      const delay = reveals?.[i] != null ? reveals[i] * 1000 : 500 + i * 400;
      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(optionAnims.current[i], { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(optionOpacities.current[i], { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
        setRevealedOptions(prev => Math.max(prev, i + 1));
      }, delay);
      timers.push(t);
    });
    revealTimersRef.current = timers;

    return clearAllTimers;
  }, [currentIdx]);

  const handleAnswer = useCallback((idx: number) => {
    if (phase !== 'question') return;
    clearAllTimers();
    setSelectedOption(idx);
    setPhase('answered');

    const isCorrect = currentQ.options[idx]?.is_correct;
    const clipKey = isCorrect ? 'correct' : 'wrong';
    const clip = currentQ.avatar_clips?.[clipKey];
    if (clip) {
      avatarRef.current?.loadSection(resolveUrl(clip), 1, {
        onEnded: () => moveToExplanation(currentQ),
      });
      avatarRef.current?.play();
    } else {
      advanceTimerRef.current = setTimeout(() => moveToExplanation(currentQ), 1500);
    }
  }, [phase, currentQ, moveToExplanation, resolveUrl, avatarRef, clearAllTimers]);

  if (!currentQ) return null;

  const overlayStyle = isFullscreen ? styles.overlayFullscreen : styles.overlayPortrait;

  // Resolve explanation visual URL — images and videos need different normalization
  const expVis = currentQ.explanation_visual;
  const expVisIsVideo = expVis && !!(expVis.video_path || expVis.wan_video_path);
  const expVisRawPath = expVis
    ? (expVis.video_path || expVis.wan_video_path || expVis.image_path || expVis.image_source || '')
    : '';
  const expVisUrl = expVisRawPath
    ? resolveUrl(expVisRawPath, expVisIsVideo ? 'video' : 'image')
    : null;

  return (
    <View style={[styles.overlay, overlayStyle]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.counter}>QUESTION {currentIdx + 1} OF {questions.length}</Text>
        <Text style={styles.question}>{currentQ.question || currentQ.question_text}</Text>

        {currentQ.options.map((opt, i) => {
          if (i >= revealedOptions) return null;
          const anim = optionAnims.current[i];
          const opacity = optionOpacities.current[i];
          const isSelected = selectedOption === i;
          const isCorrect = opt.is_correct;

          let bgColor = C.elevated;
          let borderColor = C.border;
          if (phase !== 'question' && isSelected) {
            bgColor = isCorrect ? 'rgba(126,231,135,0.12)' : 'rgba(255,107,138,0.12)';
            borderColor = isCorrect ? C.green : C.rose;
          } else if (phase !== 'question' && isCorrect) {
            bgColor = 'rgba(126,231,135,0.08)';
            borderColor = C.green;
          }

          return (
            <Animated.View
              key={i}
              style={{ transform: [{ translateY: anim }], opacity }}
            >
              <TouchableOpacity
                style={[styles.option, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleAnswer(i)}
                disabled={phase !== 'question'}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.badge,
                  phase !== 'question' && isCorrect && styles.badgeCorrect,
                  phase !== 'question' && isSelected && !isCorrect && styles.badgeWrong,
                ]}>
                  <Text style={styles.badgeText}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={styles.optionText}>{opt.text}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {/* Explanation visual: video or image */}
        {phase === 'explanation' && expVisUrl && (
          <View style={styles.explanationVisual}>
            {expVisIsVideo ? (
              <Video
                source={{ uri: expVisUrl }}
                style={styles.explanationMedia}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping={false}
                isMuted
              />
            ) : (
              <Image
                source={{ uri: expVisUrl }}
                style={styles.explanationMedia}
                resizeMode="contain"
              />
            )}
          </View>
        )}

        {phase === 'explanation' && currentQ.explanation && (
          <View style={styles.explanationBox}>
            <Text style={styles.explanationLabel}>EXPLANATION</Text>
            <Text style={styles.explanationText}>{currentQ.explanation}</Text>
          </View>
        )}

        {phase !== 'question' && (
          <TouchableOpacity style={styles.nextBtn} onPress={() => advance()}>
            <Text style={styles.nextBtnText}>{currentIdx + 1 < questions.length ? 'Next Question →' : 'Continue'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(13,17,23,0.96)',
    zIndex: 50,
  },
  overlayPortrait: {
    left: 0,
    right: '35%',
  },
  overlayFullscreen: {
    left: 0,
    right: 0,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  counter: {
    fontSize: 10,
    color: 'rgba(230,237,243,0.42)',
    fontFamily: 'JetBrainsMono_400Regular',
    letterSpacing: 0.14,
    marginBottom: 10,
  },
  question: {
    fontSize: 16,
    color: '#e6edf3',
    fontFamily: 'Sora_600SemiBold',
    lineHeight: 24,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  badgeCorrect: {
    backgroundColor: '#7ee787',
    borderColor: '#7ee787',
  },
  badgeWrong: {
    backgroundColor: '#ff6b8a',
    borderColor: '#ff6b8a',
  },
  badgeText: {
    fontSize: 10,
    color: '#fff',
    fontFamily: 'Sora_700Bold',
  },
  optionText: {
    flex: 1,
    fontSize: 13,
    color: '#e6edf3',
    fontFamily: 'Sora_400Regular',
    lineHeight: 20,
  },
  explanationVisual: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  explanationMedia: {
    width: '100%',
    height: 160,
    borderRadius: 8,
  },
  explanationBox: {
    backgroundColor: 'rgba(126,231,135,0.08)',
    borderWidth: 1,
    borderColor: '#7ee787',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  explanationLabel: {
    fontSize: 9,
    color: '#7ee787',
    fontFamily: 'JetBrainsMono_500Medium',
    letterSpacing: 0.12,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 13,
    color: '#e6edf3',
    fontFamily: 'Sora_400Regular',
    lineHeight: 20,
  },
  nextBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(246,196,78,0.1)',
    borderWidth: 1,
    borderColor: '#f6c44e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: 13,
    color: '#f6c44e',
    fontFamily: 'Sora_600SemiBold',
  },
});
