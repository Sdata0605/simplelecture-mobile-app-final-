// Gates the hands-free "Ask AI" voice assistant — mirrors the web app's
// RecordedVideos.tsx `athenaLink` useQuery exactly (same two-step lookup),
// but calls the hand-rolled PostgREST method on services/supabase.ts since
// mobile has no @supabase/supabase-js.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export interface AthenaLink {
  athenaSubjectId: string | null;
  athenaTopicId: string | null;
  subjectName: string | null;
}

export function useAthenaLink(subjectId?: string, topicId?: string) {
  return useQuery<AthenaLink>({
    queryKey: ['athena-link', subjectId, topicId],
    enabled: !!subjectId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => supabase.getAthenaLink(subjectId!, topicId),
  });
}
