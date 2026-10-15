// Shown inside the Ask AI screen when it was opened without a subject (the floating AI button, the tab bar...):
// the student picks what they want to be taught, then the live lesson starts. Native copy of the web app's
// SubjectPicker.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TeacherSubject } from '../../services/aiTeacherService';
import { ask } from './askTheme';

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
        <Ionicons name="sparkles" size={16} color={ask.gold} />
        <Text style={styles.title}>What do you want to study?</Text>
        <Text style={styles.text}>
          {unknown
            ? `Your AI teacher cannot teach ${unknown} yet. Pick one of these subjects.`
            : 'Pick a subject and ask your doubt out loud. Your AI teacher explains it from the basics.'}
        </Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {subjects.map((subject) => (
          <Pressable key={subject.id} style={styles.item} onPress={() => onPick(subject)} accessibilityRole="button" accessibilityLabel={`Study ${subject.name}`}>
            <View style={styles.itemText}>
              <Text style={styles.itemName} numberOfLines={1}>
                {subject.name}
              </Text>
              {!!courses?.[subject.id] && (
                <Text style={styles.itemCourse} numberOfLines={2}>
                  {courses[subject.id].join(' · ')}
                </Text>
              )}
            </View>
            <Text style={styles.itemTopics}>{subject.topics === 1 ? '1 topic' : `${subject.topics} topics`}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
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
  pickerRoot: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 8 },
  header: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  title: { color: ask.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  text: { color: ask.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 360 },
  list: { flex: 1.3, maxHeight: '100%' },
  listContent: { gap: 8, paddingVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: ask.line, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  itemText: { flex: 1, minWidth: 0, gap: 3 },
  itemName: { color: ask.ink, fontSize: 15, fontWeight: '700' },
  itemCourse: { color: ask.muted, fontSize: 11, lineHeight: 15 },
  itemTopics: { color: ask.muted, fontSize: 12 },
  button: { height: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mint },
  buttonText: { color: ask.onMint, fontSize: 14, fontWeight: '800' },
});
