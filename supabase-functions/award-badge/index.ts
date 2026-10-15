// Supabase Edge Function: award-badge
// Awards badges to students based on video completion.
// Badge cascade: Bronze (topic) → Silver (chapter) → Gold (subject 3+) → Master (all) → Course Complete
//
// Request body:
//   { topicId: string, chapterId: string, subjectId: string, courseId: string, topicTitle: string }
//
// Auth: Requires Bearer JWT (student's access token) in Authorization header

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Extract student from JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonRes({ error: 'Missing Authorization header' }, 401);
  }
  const jwt = authHeader.replace('Bearer ', '');

  // Use user's JWT to identify student
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !user) {
    return jsonRes({ error: 'Unauthorized: ' + (userErr?.message ?? 'no user') }, 401);
  }
  const studentId = user.id;

  // Admin client for all DB ops
  const db = createClient(supabaseUrl, serviceKey);

  let body: { topicId?: string; chapterId?: string; subjectId?: string; courseId?: string; topicTitle?: string };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: 'Invalid JSON body' }, 400);
  }

  const { topicId, chapterId, subjectId, courseId, topicTitle } = body;
  const badgesAwarded: string[] = [];

  // ── Helper: check if badge already exists ──────────────────────────────────
  async function badgeExists(type: string, field: string, value: string): Promise<boolean> {
    const { data } = await db
      .from('student_badges')
      .select('id')
      .eq('student_id', studentId)
      .eq('badge_type', type)
      .eq(field, value)
      .maybeSingle();
    return !!data;
  }

  // ── Step 1: BRONZE (topic level) ───────────────────────────────────────────
  if (topicId && chapterId) {
    const exists = await badgeExists('bronze', 'topic_id', topicId);
    if (!exists) {
      // CRITICAL: Do NOT include subject_id or course_id for bronze badges
      // (partial unique index on subject_id would block inserting multiple bronzes per subject)
      const { error } = await db.from('student_badges').insert({
        student_id:  studentId,
        badge_type:  'bronze',
        topic_id:    topicId,
        chapter_id:  chapterId,
        title:       `Topic Completed: ${topicTitle ?? 'Lecture'}`,
        description: 'Earned by watching the full lecture video',
      });
      if (!error) badgesAwarded.push('bronze');
      else console.error('[award-badge] Bronze insert error:', error.message);
    }
  }

  // ── Step 2: SILVER (chapter level — all topics have bronze) ───────────────
  if (chapterId && subjectId && courseId) {
    const { data: allTopics } = await db
      .from('subject_topics')
      .select('id')
      .eq('chapter_id', chapterId);

    const totalTopics = allTopics?.length ?? 0;
    if (totalTopics > 0) {
      const topicIds = allTopics!.map((t: { id: string }) => t.id);
      const { data: bronzeBadges } = await db
        .from('student_badges')
        .select('topic_id')
        .eq('student_id', studentId)
        .eq('badge_type', 'bronze')
        .in('topic_id', topicIds);

      const bronzeCount = bronzeBadges?.length ?? 0;
      if (bronzeCount >= totalTopics) {
        const exists = await badgeExists('silver', 'chapter_id', chapterId);
        if (!exists) {
          // Get chapter title
          const { data: chapter } = await db
            .from('subject_chapters')
            .select('title')
            .eq('id', chapterId)
            .maybeSingle();

          const { error } = await db.from('student_badges').insert({
            student_id:  studentId,
            badge_type:  'silver',
            chapter_id:  chapterId,
            subject_id:  subjectId,
            course_id:   courseId,
            title:       `Chapter Completed: ${chapter?.title ?? 'Chapter'}`,
            description: 'Earned by completing all topics in this chapter',
          });
          if (!error) badgesAwarded.push('silver');
          else console.error('[award-badge] Silver insert error:', error.message);
        }
      }
    }
  }

  // ── Step 3 & 4: GOLD (3+ chapters silver) & MASTER (all chapters silver) ──
  if (subjectId && courseId) {
    const { data: allChapters } = await db
      .from('subject_chapters')
      .select('id')
      .eq('subject_id', subjectId);

    const totalChapters = allChapters?.length ?? 0;
    if (totalChapters > 0) {
      const chapterIds = allChapters!.map((c: { id: string }) => c.id);
      const { data: silverBadges } = await db
        .from('student_badges')
        .select('chapter_id')
        .eq('student_id', studentId)
        .eq('badge_type', 'silver')
        .in('chapter_id', chapterIds);

      const silverCount = silverBadges?.length ?? 0;

      // GOLD: 3+ chapters with silver
      if (silverCount >= 3) {
        const exists = await badgeExists('gold', 'subject_id', subjectId);
        if (!exists) {
          const { data: subject } = await db
            .from('popular_subjects')
            .select('name')
            .eq('id', subjectId)
            .maybeSingle();

          const { error } = await db.from('student_badges').insert({
            student_id:  studentId,
            badge_type:  'gold',
            subject_id:  subjectId,
            course_id:   courseId,
            title:       `Gold Achievement: ${subject?.name ?? 'Subject'}`,
            description: 'Earned by completing 3 or more chapters in this subject',
          });
          if (!error) badgesAwarded.push('gold');
          else console.error('[award-badge] Gold insert error:', error.message);
        }
      }

      // MASTER: ALL chapters with silver
      if (silverCount >= totalChapters) {
        const exists = await badgeExists('master', 'subject_id', subjectId);
        if (!exists) {
          const { data: subject } = await db
            .from('popular_subjects')
            .select('name')
            .eq('id', subjectId)
            .maybeSingle();

          const { error } = await db.from('student_badges').insert({
            student_id:  studentId,
            badge_type:  'master',
            subject_id:  subjectId,
            course_id:   courseId,
            title:       `Subject Mastered: ${subject?.name ?? 'Subject'}`,
            description: 'Earned by completing all chapters in this subject',
          });
          if (!error) badgesAwarded.push('master');
          else console.error('[award-badge] Master insert error:', error.message);
        }
      }
    }
  }

  // ── Step 5: COURSE COMPLETE (all subjects mastered) ────────────────────────
  if (courseId) {
    const { data: allCourseSubjects } = await db
      .from('course_subjects')
      .select('subject_id')
      .eq('course_id', courseId);

    const totalSubjects = allCourseSubjects?.length ?? 0;
    if (totalSubjects > 0) {
      const subjectIds = allCourseSubjects!.map((s: { subject_id: string }) => s.subject_id);
      const { data: masterBadges } = await db
        .from('student_badges')
        .select('subject_id')
        .eq('student_id', studentId)
        .eq('badge_type', 'master')
        .in('subject_id', subjectIds);

      const masterCount = masterBadges?.length ?? 0;
      if (masterCount >= totalSubjects) {
        const exists = await badgeExists('course_complete', 'course_id', courseId);
        if (!exists) {
          const { data: course } = await db
            .from('courses')
            .select('name')
            .eq('id', courseId)
            .maybeSingle();

          const { error } = await db.from('student_badges').insert({
            student_id:  studentId,
            badge_type:  'course_complete',
            course_id:   courseId,
            title:       `Course Completed: ${course?.name ?? 'Course'}`,
            description: 'Earned by mastering all subjects in this course',
          });
          if (!error) badgesAwarded.push('course_complete');
          else console.error('[award-badge] Course complete insert error:', error.message);
        }
      }
    }
  }

  return jsonRes({ success: true, badges_awarded: badgesAwarded });
});
