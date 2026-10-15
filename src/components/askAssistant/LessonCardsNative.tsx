// The lesson board's cards for the mobile Ask AI screen, in the orb's dark theme: emoji visuals, recap slides and
// worked maths steps, the question to solve, the understanding check and the written answer. Same behaviour as
// the web app's LessonCards.
import React, { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MathText from '../MathText';
import { MathStep } from './MathStep';
import { ask } from './askTheme';
import type { LessonCard } from '../../services/askAssistant/lectureLesson';
import { toInlineMathMarkdown } from '../../services/askAssistant/lectureMath';
import type { QuizItem, VisualData } from '../../services/aiTeacherLiveService';

/** What a card can tell the teacher. */
export interface CardActions {
  reportQuizAnswer: (quiz: QuizItem, optionIndex: number) => void;
  reportUnderstanding: (topic: string | undefined, choice: 'got_it' | 'somewhat' | 'confused') => void;
  answerBigQuestion: (question: string, answer: string) => void;
}

export function CardBody({ item, actions, math }: { item: LessonCard; actions: CardActions; math: boolean }) {
  const card = item.card;
  switch (card.kind) {
    case 'visual':
      return <Visual visual={card.visual} />;
    case 'slide':
      return math ? (
        <MathStep bullets={card.bullets} />
      ) : (
        <View style={styles.bullets}>
          {card.bullets.map((bullet, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      );
    case 'quiz':
      return <Quiz quiz={card.quiz} onAnswer={(i) => actions.reportQuizAnswer(card.quiz, i)} />;
    case 'understand':
      return <Understand topic={card.topic} onChoose={(choice) => actions.reportUnderstanding(card.topic, choice)} />;
    case 'bigq':
      return <BigQuestion question={card.question} hint={card.hint} onSubmit={(answer) => actions.answerBigQuestion(card.question, answer)} />;
    default:
      return null;
  }
}

/** Text that may hold LaTeX: typeset when it does, plain text when it does not. */
function MaybeMath({ text, bold }: { text: string; bold?: boolean }) {
  const md = toInlineMathMarkdown(text);
  if (md.includes('$')) return <MathText content={md} color={ask.ink} />;
  return <Text style={[styles.plain, bold && styles.bold]}>{text}</Text>;
}

// ---------------------------------------------------------------- visuals

function Tile({ emoji, title, text, row = true }: { emoji: string; title: string; text?: string; row?: boolean }) {
  return (
    <View style={[styles.tile, !row && styles.tileColumn]}>
      <Text style={row ? styles.emojiSmall : styles.emoji}>{emoji}</Text>
      <View style={row ? styles.tileText : styles.tileTextColumn}>
        <Text style={[styles.tileTitle, !row && styles.center]}>{title}</Text>
        {!!text && <Text style={[styles.tileSub, !row && styles.center]}>{text}</Text>}
      </View>
    </View>
  );
}

function Visual({ visual }: { visual: VisualData }) {
  const { kind, items, caption } = visual;
  let body: React.ReactElement;

  if (kind === 'scene') {
    body = (
      <View style={styles.scene}>
        {items.map((it, i) => (
          <Fragment key={i}>
            <View style={styles.sceneTile}>
              <Tile emoji={it.emoji} title={it.title} text={it.text} row={false} />
            </View>
            {i < items.length - 1 && <Text style={styles.arrow}>→</Text>}
          </Fragment>
        ))}
      </View>
    );
  } else if (kind === 'timeline') {
    body = (
      <View style={styles.timeline}>
        {items.map((it, i) => (
          <View key={i} style={styles.timelineRow}>
            <View style={styles.node}>
              <Text style={styles.nodeEmoji}>{it.emoji}</Text>
            </View>
            <View style={styles.tileText}>
              <Text style={styles.tileTitle}>{it.title}</Text>
              {!!it.text && <Text style={styles.tileSub}>{it.text}</Text>}
            </View>
          </View>
        ))}
      </View>
    );
  } else if (kind === 'steps') {
    body = (
      <View style={{ gap: 2 }}>
        {items.map((it, i) => (
          <Fragment key={i}>
            <View style={styles.tile}>
              <View style={styles.num}>
                <Text style={styles.numText}>{i + 1}</Text>
              </View>
              <Text style={styles.emojiSmall}>{it.emoji}</Text>
              <View style={styles.tileText}>
                <Text style={styles.tileTitle}>{it.title}</Text>
                {!!it.text && <Text style={styles.tileSub}>{it.text}</Text>}
              </View>
            </View>
            {i < items.length - 1 && <Text style={styles.down}>↓</Text>}
          </Fragment>
        ))}
      </View>
    );
  } else if (kind === 'compare') {
    const groups: string[] = [];
    items.forEach((it) => {
      const g = it.group || '';
      if (!groups.includes(g)) groups.push(g);
    });
    body = (
      <View style={styles.compare}>
        {groups.slice(0, 2).map((g) => (
          <View key={g} style={styles.compareCol}>
            {!!g && <Text style={styles.colTitle}>{g}</Text>}
            {items
              .filter((it) => (it.group || '') === g)
              .map((it, i) => (
                <Tile key={i} emoji={it.emoji} title={it.title} text={it.text} />
              ))}
          </View>
        ))}
      </View>
    );
  } else {
    body = (
      <View style={{ gap: 8 }}>
        {items.map((it, i) => (
          <Tile key={i} emoji={it.emoji} title={it.title} text={it.text} />
        ))}
      </View>
    );
  }

  return (
    <View>
      {body}
      {!!caption && (
        <View style={styles.caption}>
          <Text style={styles.captionText}>💡 {caption}</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- questions

const LETTERS = 'ABCDEFGH';

function Quiz({ quiz, onAnswer }: { quiz: QuizItem; onAnswer: (optionIndex: number) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const right = picked === quiz.correctIndex;

  return (
    <View>
      <View style={styles.question}>
        <MaybeMath text={quiz.question} bold />
      </View>
      <View style={{ gap: 8 }}>
        {quiz.options.map((option, i) => {
          const isCorrect = i === quiz.correctIndex;
          const stateStyle = answered ? (isCorrect ? styles.optRight : picked === i ? styles.optWrong : styles.optDim) : null;
          return (
            <Pressable
              key={i}
              disabled={answered}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked === i }}
              style={[styles.opt, stateStyle]}
              onPress={() => {
                setPicked(i);
                onAnswer(i);
              }}
            >
              <View style={styles.letter}>
                <Text style={styles.letterText}>{LETTERS[i]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <MaybeMath text={option} />
              </View>
              {answered && isCorrect && <Text style={styles.mark}>✓</Text>}
              {answered && picked === i && !isCorrect && <Text style={[styles.mark, { color: ask.rose }]}>✕</Text>}
            </Pressable>
          );
        })}
      </View>
      {answered && (
        <Text style={[styles.feedback, { color: right ? ask.mint : '#ffb4c0' }]}>
          {right ? 'Correct!' : `Not quite. The correct answer is ${LETTERS[quiz.correctIndex]}.`}
          {quiz.explanation ? <Text style={{ color: ask.muted }}> {quiz.explanation}</Text> : null}
        </Text>
      )}
    </View>
  );
}

function Understand({ topic, onChoose }: { topic?: string; onChoose: (choice: 'got_it' | 'somewhat' | 'confused') => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const options = [
    { id: 'got_it' as const, emoji: '👍', label: 'Got it!' },
    { id: 'somewhat' as const, emoji: '🤔', label: 'Somewhat' },
    { id: 'confused' as const, emoji: '😕', label: 'Confused' },
  ];
  return (
    <View>
      <Text style={[styles.plain, styles.bold, { marginBottom: 10 }]}>Are you understanding{topic ? ` “${topic}”` : ''}?</Text>
      <View style={styles.feel}>
        {options.map((o) => (
          <Pressable
            key={o.id}
            disabled={!!picked}
            style={[styles.feelBtn, picked === o.id && styles.feelPicked, !!picked && picked !== o.id && styles.optDim]}
            onPress={() => {
              setPicked(o.id);
              onChoose(o.id);
            }}
          >
            <Text style={styles.feelEmoji}>{o.emoji}</Text>
            <Text style={styles.feelLabel}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function BigQuestion({ question, hint, onSubmit }: { question: string; hint?: string; onSubmit: (answer: string) => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  return (
    <View>
      <View style={styles.question}>
        <MaybeMath text={question} bold />
      </View>
      {!!hint && <Text style={styles.hint}>Hint: {hint}</Text>}
      {sent ? (
        <View style={styles.sent}>
          <Text style={styles.sentLabel}>YOUR ANSWER</Text>
          <Text style={styles.plain}>{sent}</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1200}
            placeholder="Say your answer out loud, or type it here…"
            placeholderTextColor="rgba(145, 167, 163, 0.8)"
          />
          <Pressable
            disabled={text.trim().length < 3}
            style={[styles.send, text.trim().length < 3 && { opacity: 0.4 }]}
            onPress={() => {
              const answer = text.trim();
              setSent(answer);
              onSubmit(answer);
            }}
          >
            <Text style={styles.sendText}>Send my answer</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plain: { color: ask.ink, fontSize: 15, lineHeight: 22 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  bullets: { gap: 8 },
  bullet: { padding: 10, borderRadius: 12, backgroundColor: ask.mintSoft },
  bulletText: { color: ask.ink, fontSize: 15, lineHeight: 22 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: ask.mintSoft, borderWidth: 1, borderColor: 'rgba(124, 224, 195, 0.12)' },
  tileColumn: { flexDirection: 'column', width: 116, paddingVertical: 12, paddingHorizontal: 8 },
  tileText: { flex: 1, minWidth: 0 },
  tileTextColumn: { alignItems: 'center' },
  tileTitle: { color: ask.ink, fontSize: 14, fontWeight: '700' },
  tileSub: { color: ask.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  emoji: { fontSize: 38 },
  emojiSmall: { fontSize: 26 },
  scene: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center', gap: 6 },
  sceneTile: { alignItems: 'center' },
  arrow: { alignSelf: 'center', color: ask.mint, fontSize: 20 },
  timeline: { gap: 14, marginLeft: 6, paddingLeft: 26, borderLeftWidth: 2, borderLeftColor: 'rgba(124, 224, 195, 0.35)' },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  node: { position: 'absolute', left: -44, top: -3, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f2320', borderWidth: 2, borderColor: 'rgba(124, 224, 195, 0.5)' },
  nodeEmoji: { fontSize: 16 },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mint },
  numText: { color: ask.onMint, fontSize: 12, fontWeight: '800' },
  down: { color: ask.mint, fontSize: 14, textAlign: 'center' },
  compare: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  compareCol: { flex: 1, minWidth: 170, gap: 8 },
  colTitle: { color: ask.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  caption: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: ask.goldSoft },
  captionText: { color: '#f6dca4', fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
  question: { marginBottom: 10 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: ask.line, backgroundColor: ask.panel },
  optRight: { borderColor: ask.mint, backgroundColor: ask.mintFill },
  optWrong: { borderColor: ask.rose, backgroundColor: ask.roseSoft },
  optDim: { opacity: 0.55 },
  letter: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ask.line },
  letterText: { color: ask.ink, fontSize: 12, fontWeight: '800' },
  mark: { color: ask.mint, fontSize: 16, fontWeight: '800' },
  feedback: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  feel: { flexDirection: 'row', gap: 8 },
  feelBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: ask.line, backgroundColor: ask.panel },
  feelPicked: { borderColor: ask.mint, backgroundColor: ask.mintFill },
  feelEmoji: { fontSize: 26 },
  feelLabel: { color: ask.ink, fontSize: 13, fontWeight: '700' },
  hint: { color: ask.muted, fontSize: 13, marginTop: -4, marginBottom: 10 },
  input: { minHeight: 76, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: ask.line, backgroundColor: 'rgba(7, 16, 15, 0.6)', color: ask.ink, fontSize: 16, textAlignVertical: 'top' },
  send: { alignSelf: 'flex-start', marginTop: 8, height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mint },
  sendText: { color: ask.onMint, fontSize: 14, fontWeight: '700' },
  sent: { padding: 10, borderRadius: 12, backgroundColor: ask.panelStrong },
  sentLabel: { color: ask.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 3 },
});
