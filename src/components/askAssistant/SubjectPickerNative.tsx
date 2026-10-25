// Shown inside the Ask AI screen when it was opened without a subject (the floating AI button, the tab bar...):
// the student picks what they want to be taught, then the live lesson starts. Native copy of the web app's
// SubjectPicker.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { TeacherSubject } from '../../services/aiTeacherService';
import { ask } from './askTheme';
import { RobotMascot } from './RobotMascot';

export interface SubjectPickerProps {
  /** null while the list is still loading. */
  subjects: TeacherSubject[] | null;
  failed?: boolean;
  /** subject id -> names of the courses it belongs to, shown in small letters under the subject's name. */
  courses?: Record<string, string[]>;
  /** The subject the student was on, when the teacher cannot teach it yet. */
  unknown?: string | null;
  onPick: (subject: TeacherSubject) => void;
  onRetry?: () => void;
}

export function SubjectPicker({ subjects, failed, courses, unknown, onPick, onRetry }: SubjectPickerProps) {
  const { height } = useWindowDimensions();
  const compact = height < 440;
  const cardWidth = compact ? 180 : 220;
  const cardHeight = compact ? 132 : 160;
  if (failed) {
    return (
      <Message title="Could not reach your teacher" text="Please check your internet connection and try again.">
        {!!onRetry && (
          <Pressable style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        )}
      </Message>
    );
  }

  if (subjects === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ask.mint} />
        <Text style={styles.title}>Getting your teacher ready…</Text>
      </View>
    );
  }

  if (subjects.length === 0) {
    return <Message title="Your AI teacher is not ready yet" text="No subjects have been set up for the AI teacher so far. Please check back soon." />;
  }

  return (
    <View style={styles.pickerRoot}>
      <View style={styles.header}>
        <RobotMascot mode="idle" size={compact ? 104 : 140} />
        <Text style={styles.heading}>
          What do you want to <Text style={styles.headingAccent}>study?</Text>
        </Text>
        <Text style={styles.text}>
          {unknown
            ? `Your AI teacher cannot teach ${unknown} yet. Pick one of these subjects.`
            : 'Pick a subject and ask your doubt out loud. Your AI tutor explains it from the basics.'}
        </Text>
      </View>
      <ScrollView horizontal style={styles.list} contentContainerStyle={styles.listContent} showsHorizontalScrollIndicator={false}>
        {subjects.map((subject) => {
          const look = lookFor(subject.name);
          return (
            <Pressable key={subject.id} onPress={() => onPick(subject)} accessibilityRole="button" accessibilityLabel={`Study ${subject.name}`} style={styles.cardPress}>
              <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderColor: look.border, width: cardWidth, height: cardHeight }]}>
                <Ionicons name={look.icon} size={compact ? 64 : 84} color={look.tint} style={styles.cardArt} />
                <View style={styles.cardTop}>
                  <Text style={styles.itemName} numberOfLines={2} ellipsizeMode="tail">
                    {subject.name}
                  </Text>
                  {!!courses?.[subject.id] && (
                    <Text style={styles.itemCourse} numberOfLines={1} ellipsizeMode="tail">
                      {courses[subject.id].join(' · ')}
                    </Text>
                  )}
                </View>
                <View style={styles.cardFoot}>
                  <View style={styles.topicsRow}>
                    <Ionicons name="book-outline" size={15} color={ask.ink} />
                    <Text style={styles.itemTopics}>{subject.topics === 1 ? '1 topic' : `${subject.topics} topics`}</Text>
                  </View>
                  <View style={[styles.arrow, { backgroundColor: look.accent }]}>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface CardLook {
  colors: [string, string];
  border: string;
  accent: string;
  tint: string;
  icon: IconName;
}

// Every subject gets a card: known subjects get their own colors and icon; any other (including subjects added later)
// gets a stable palette + icon picked from its name, so the same subject always looks the same.
const PALETTE: Omit<CardLook, 'icon'>[] = [
  { colors: ['#123a73', '#0a1b3a'], border: '#2f6fd0', accent: '#2f7bea', tint: 'rgba(120,170,255,0.28)' },
  { colors: ['#0f5a4a', '#08261f'], border: '#23b08f', accent: '#17b58f', tint: 'rgba(124,224,195,0.28)' },
  { colors: ['#6b4414', '#2a1a08'], border: '#c98a2e', accent: '#c98a2e', tint: 'rgba(255,200,120,0.28)' },
  { colors: ['#4a2a7a', '#1c0f33'], border: '#8a5fd6', accent: '#8a5fd6', tint: 'rgba(190,160,255,0.28)' },
  { colors: ['#7a2440', '#2e0e1a'], border: '#d6577e', accent: '#d6577e', tint: 'rgba(255,150,180,0.28)' },
  { colors: ['#1d4b52', '#0b1f22'], border: '#3aa0ad', accent: '#2f9aa8', tint: 'rgba(120,220,230,0.26)' },
];
const ICONS: [RegExp, IconName, number][] = [
  [/math|algebra|geometry|calcul|statist|aptitude/, 'calculator-outline', 0],
  [/social|histor|geograph|civic|politic|econom/, 'earth-outline', 2],
  [/physic/, 'magnet-outline', 1],
  [/chem/, 'flask-outline', 1],
  [/bio|botany|zoology|life/, 'leaf-outline', 1],
  [/sci/, 'flask-outline', 1],
  [/pharm|medic|anatomy|nurs|health/, 'medkit-outline', 3],
  [/english|hindi|kannada|tamil|telugu|marathi|sanskrit|language|literature|grammar/, 'language-outline', 4],
  [/comput|program|coding|software|it|data/, 'code-slash-outline', 5],
  [/art|draw|music|design/, 'color-palette-outline', 4],
  [/account|business|commerce|finance/, 'briefcase-outline', 2],
  [/law|legal/, 'scale-outline', 3],
];
const FALLBACK_ICONS: IconName[] = ['library-outline', 'bulb-outline', 'school-outline', 'book-outline', 'rocket-outline', 'telescope-outline'];

function lookFor(name: string): CardLook {
  const n = name.toLowerCase();
  const hit = ICONS.find(([re]) => re.test(n));
  if (hit) return { ...PALETTE[hit[2]], icon: hit[1] };
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return { ...PALETTE[h % PALETTE.length], icon: FALLBACK_ICONS[(h >> 3) % FALLBACK_ICONS.length] };
}

function Message({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  pickerRoot: { flex: 1, justifyContent: 'center', gap: 6 },
  header: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12 },
  title: { color: ask.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heading: { color: ask.ink, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  headingAccent: { color: ask.mint },
  text: { color: ask.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 560 },
  list: { flexGrow: 0 },
  listContent: { gap: 12, paddingHorizontal: 12, paddingVertical: 4, minWidth: '100%', justifyContent: 'center' },
  cardPress: { flexShrink: 0 },
  card: { padding: 14, borderRadius: 18, borderWidth: 1, overflow: 'hidden', justifyContent: 'space-between' },
  cardTop: { gap: 3 },
  cardArt: { position: 'absolute', right: 10, bottom: 46, opacity: 0.4 },
  itemName: { color: ask.ink, fontSize: 18, lineHeight: 22, fontWeight: '800', height: 44 },
  itemCourse: { color: 'rgba(238,246,244,0.8)', fontSize: 11, lineHeight: 15, maxWidth: '100%' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topicsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTopics: { color: ask.ink, fontSize: 13, fontWeight: '600' },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  button: { height: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mint },
  buttonText: { color: ask.onMint, fontSize: 14, fontWeight: '800' },
});
