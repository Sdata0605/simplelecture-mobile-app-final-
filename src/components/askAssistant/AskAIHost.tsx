// Mounted once in App. Shows the Ask AI screen whenever something in the app calls openAskAI() (see
// services/askAIStore.ts): the same screen the lecture player's Ask AI button opens, so every Ask AI button leads
// to one place instead of the AI Teacher screens. The lecture player keeps its own copy of the screen, because it
// hands it the paused lecture and manages its own video and orientation.
import React, { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as ScreenOrientation from 'expo-screen-orientation';
import { navigationRef } from '../../navigation/AppNavigator';
import { getSubjects } from '../../services/aiTeacherService';
import { SUPABASE_ANON_KEY, SUPABASE_URL, getValidAccessToken } from '../../services/supabase';
import {
  chooseSubject,
  closeAskAI,
  courseNamesBySubject,
  useAskAIRequest,
  type AskAIRequest,
  type SubjectCourseRow,
} from '../../services/askAIStore';
import { AskAIAssistant } from './AskAIAssistant';

export function AskAIHost() {
  const request = useAskAIRequest();
  if (!request) return null;
  return <AskAIScreen request={request} />;
}

/** The course(s) each subject belongs to; the database only returns courses the student may see. */
async function fetchSubjectCourses(subjectIds: string[]): Promise<Record<string, string[]>> {
  const token = (await getValidAccessToken()) || SUPABASE_ANON_KEY;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/popular_subjects?select=id,course_subjects(courses(name))&id=in.(${subjectIds.join(',')})`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`courses ${response.status}`);
  return courseNamesBySubject((await response.json()) as SubjectCourseRow[]);
}

function AskAIScreen({ request }: { request: AskAIRequest }) {
  // Same query key as the lecture player, so the list is usually already there.
  const { data, isError, refetch } = useQuery({
    queryKey: ['ai-teacher', 'subjects'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await getSubjects()).subjects,
  });
  const subjects = data ?? null;
  const choice = subjects ? chooseSubject(request, subjects) : null;

  // Only when the student has to pick: the course each subject belongs to. A failure just leaves the line out.
  const subjectIds = (subjects ?? []).map((s) => s.id);
  const { data: courses } = useQuery({
    queryKey: ['ai-teacher', 'subject-courses', subjectIds],
    enabled: choice?.kind === 'pick' && subjectIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchSubjectCourses(subjectIds),
  });

  // Ask AI is a landscape screen (lesson board left, teacher right): rotate on open, and go back to how the
  // screen was on close (portrait, unless it was already landscape).
  useEffect(() => {
    let wasLandscape = false;
    ScreenOrientation.getOrientationAsync()
      .then((o) => {
        wasLandscape = o === ScreenOrientation.Orientation.LANDSCAPE_LEFT || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      })
      .catch(() => {})
      .finally(() => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      });
    return () => {
      if (wasLandscape) return;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .then(() => {
          setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 300);
        })
        .catch(() => {});
    };
  }, []);

  const goTo = useCallback((screen: 'AITeacher' | 'AITeacherSettings') => {
    closeAskAI();
    (navigationRef.current?.navigate as ((...args: any[]) => void) | undefined)?.(screen);
  }, []);

  return (
    <AskAIAssistant
      trigger="ask"
      onClose={closeAskAI}
      subject={choice?.kind === 'subject' ? choice.subject : null}
      topicTitle={request.topicTitle}
      choices={{
        subjects,
        failed: isError && !subjects,
        courses,
        unknown: choice?.kind === 'pick' ? choice.unknown : null,
        onRetry: () => void refetch(),
      }}
      onOpenPlans={() => goTo('AITeacher')}
      onOpenSettings={() => goTo('AITeacherSettings')}
    />
  );
}

export default AskAIHost;
