// Which subjects the AI Teacher can teach (those whose lectures are indexed), and whether this lecture's subject
// is one of them. Replaces the old "linked to Athena" check for the player's Ask AI button.
import { useQuery } from '@tanstack/react-query';
import { getSubjects, type TeacherSubject } from '../services/aiTeacherService';

export function useTeacherSubject(subjectId?: string): TeacherSubject | null {
  const { data } = useQuery({
    queryKey: ['ai-teacher', 'subjects'],
    enabled: !!subjectId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await getSubjects()).subjects,
  });
  return data?.find((s) => s.id === subjectId) ?? null;
}
