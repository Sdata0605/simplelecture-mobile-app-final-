// The lesson board: what the student asked, a progress bar, and the teacher's explanation as steps that appear
// one by one (basics, build up, example, answer, then a question to solve). The newest step is open and scrolled
// into view; earlier steps fold into a single line the student can reopen. A maths solution stays open from start
// to finish, like a notebook page. Cards stay mounted while folded so a picked answer is not lost.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardBody, type CardActions } from './LessonCardsNative';
import { ask } from './askTheme';
import type { Lesson, LessonCard } from '../../services/askAssistant/lectureLesson';

const MIN_EXPLAIN_PILLS = 4;

interface Pill {
  key: string;
  label: string;
  state: 'done' | 'now' | 'todo';
  target: string | null;
  turn?: boolean;
}

/** Progress along the usual path: basics, build up, example, answer, your turn. */
function pillsFor(lesson: Lesson): Pill[] {
  const last = lesson.cards[lesson.cards.length - 1];
  const onTurn = last?.role === 'turn';
  const current = last?.step ?? lesson.explainCount;
  const pills: Pill[] = [];
  for (let i = 1; i <= Math.max(MIN_EXPLAIN_PILLS, lesson.explainCount); i++) {
    const target = lesson.cards.find((c) => c.step === i)?.id ?? null;
    pills.push({ key: `s${i}`, label: String(i), target, state: onTurn || i < current ? 'done' : i === current ? 'now' : 'todo' });
  }
  const turn = lesson.cards.find((c) => c.role === 'turn');
  pills.push({ key: 'turn', label: '?', turn: true, target: turn?.id ?? null, state: onTurn ? 'now' : 'todo' });
  return pills;
}

function eyebrow(item: LessonCard): string {
  return item.step !== null ? `STEP ${item.step}` : 'YOUR TURN';
}

function title(item: LessonCard): string {
  return item.role === 'turn' && item.card.kind === 'quiz' ? 'Quick question' : item.label;
}

export function LessonBoard({ lesson, actions }: { lesson: Lesson; actions: CardActions }) {
  const { cards, question } = lesson;
  const latest = cards.length ? cards[cards.length - 1].id : null;
  const [openId, setOpenId] = useState<string | null>(latest);
  const scrollRef = useRef<ScrollView>(null);
  const tops = useRef<Record<string, number>>({});

  const scrollTo = useCallback((id: string) => {
    const y = tops.current[id];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);

  // Follow the teacher: the newest step opens and scrolls into view (after it has been laid out).
  useEffect(() => {
    setOpenId(latest);
    if (latest === null) return;
    const timer = setTimeout(() => scrollTo(latest), 120);
    return () => clearTimeout(timer);
  }, [latest, scrollTo]);

  if (cards.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="sparkles" size={18} color={ask.mint} />
        </View>
        <Text style={styles.emptyTitle}>Ask me anything about this lesson</Text>
        <Text style={styles.emptyText}>I'll explain it from the very basics, one step at a time, so you really understand it.</Text>
        <View style={styles.path}>
          {['1 The basics', '2 Build up', '3 Example', '4 Answer'].map((label) => (
            <Text key={label} style={styles.pathChip}>
              {label}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  const pills = pillsFor(lesson);
  const open = (id: string | null) => {
    if (id === null) return;
    setOpenId(id);
    setTimeout(() => scrollTo(id), 60);
  };

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {!!question && (
        <View style={styles.ask}>
          <Text style={styles.askLabel}>YOU ASKED</Text>
          <Text style={styles.askText}>{question}</Text>
        </View>
      )}

      <View style={styles.progress} accessibilityLabel="Lesson progress">
        {pills.map((pill) => (
          <Pressable
            key={pill.key}
            disabled={pill.target === null}
            accessibilityLabel={pill.turn ? 'Your turn' : `Step ${pill.label}`}
            style={[styles.pill, pill.state === 'done' && styles.pillDone, pill.state === 'now' && styles.pillNow]}
            onPress={() => open(pill.target)}
          >
            {pill.state === 'done' && !pill.turn ? (
              <Ionicons name="checkmark" size={13} color={ask.onMint} />
            ) : pill.turn ? (
              <Ionicons name="help" size={14} color={pill.state === 'now' ? ask.mint : pill.state === 'done' ? ask.onMint : '#5f7773'} />
            ) : (
              <Text style={[styles.pillText, pill.state === 'now' && { color: ask.mint }]}>{pill.label}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {cards.map((item, index) => {
        // A maths solution stays open from start to finish: each line of working follows from the one above.
        const isOpen = lesson.math || openId === item.id;
        const past = index < cards.length - 1;
        const isAnswer = item.role === 'answer';
        const head = (
          <>
            <View style={[styles.badge, past && !lesson.math && styles.badgeDone]}>
              {past && !lesson.math ? (
                <Ionicons name="checkmark" size={15} color={ask.onMint} />
              ) : (
                <Text style={styles.badgeText}>{item.step ?? '?'}</Text>
              )}
            </View>
            <View style={styles.label}>
              <Text style={styles.eyebrow}>{eyebrow(item)}</Text>
              <Text style={[styles.title, past && !isOpen && !lesson.math && { color: ask.muted, fontWeight: '500' }]}>{title(item)}</Text>
            </View>
          </>
        );
        return (
          <View
            key={item.id}
            onLayout={(e) => {
              tops.current[item.id] = e.nativeEvent.layout.y;
            }}
            style={[styles.step, isOpen && styles.stepOpen, isAnswer && isOpen && styles.stepAnswer, lesson.math && past && { opacity: 0.85 }]}
          >
            {lesson.math ? (
              <View style={styles.head}>{head}</View>
            ) : (
              <Pressable style={styles.head} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpenId(isOpen ? null : item.id)}>
                {head}
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={ask.muted} />
              </Pressable>
            )}
            {/* Kept mounted while folded so a picked answer survives. */}
            <View style={[styles.body, !isOpen && styles.bodyHidden]}>
              <CardBody item={item} actions={actions} math={lesson.math} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mintSoft },
  emptyTitle: { color: ask.ink, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: ask.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
  path: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  pathChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', color: ask.mint, backgroundColor: ask.mintSoft, borderWidth: 1, borderColor: 'rgba(124, 224, 195, 0.25)', fontSize: 12, fontWeight: '700' },
  ask: { marginBottom: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: ask.line, backgroundColor: ask.panelStrong },
  askLabel: { color: ask.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  askText: { color: ask.ink, fontSize: 18, lineHeight: 25, fontFamily: undefined, fontWeight: '500' },
  progress: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  pill: { flex: 1, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: ask.line },
  pillDone: { backgroundColor: ask.mint, borderColor: ask.mint },
  pillNow: { borderColor: ask.mint },
  pillText: { color: '#5f7773', fontSize: 11, fontWeight: '800' },
  step: { marginBottom: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(162, 201, 192, 0.14)', backgroundColor: 'rgba(255, 255, 255, 0.03)', overflow: 'hidden' },
  stepOpen: { borderColor: ask.lineStrong, backgroundColor: ask.panelStrong },
  stepAnswer: { borderColor: ask.mint, backgroundColor: 'rgba(124, 224, 195, 0.1)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124, 224, 195, 0.14)' },
  badgeDone: { backgroundColor: ask.mint },
  badgeText: { color: ask.mint, fontSize: 12, fontWeight: '800' },
  label: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { color: ask.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: ask.ink, fontSize: 16, fontWeight: '700' },
  body: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
  bodyHidden: { display: 'none' },
});
