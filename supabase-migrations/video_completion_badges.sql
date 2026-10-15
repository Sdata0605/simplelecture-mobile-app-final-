-- Migration: Video Completion & Badge System
-- Tables: ai_video_watch_logs, student_badges
-- Run this in the Supabase SQL editor

-- 1. Badge type enum (idempotent)
DO $$ BEGIN
  CREATE TYPE badge_type AS ENUM ('bronze', 'silver', 'gold', 'master', 'course_complete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. ai_video_watch_logs — tracks which videos a student has watched
CREATE TABLE IF NOT EXISTS ai_video_watch_logs (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_title           text          NOT NULL,
  subject_id            uuid          REFERENCES popular_subjects(id) ON DELETE SET NULL,
  chapter_id            uuid          REFERENCES subject_chapters(id) ON DELETE SET NULL,
  topic_id              uuid          REFERENCES subject_topics(id) ON DELETE SET NULL,
  duration_seconds      integer       NOT NULL DEFAULT 0,
  watched_seconds       integer       NOT NULL DEFAULT 0,
  completion_percentage integer       NOT NULL DEFAULT 0,
  created_at            timestamptz   DEFAULT now(),
  updated_at            timestamptz   DEFAULT now()
);

-- 3. student_badges — stores all earned badges
CREATE TABLE IF NOT EXISTS student_badges (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type  badge_type    NOT NULL,
  topic_id    uuid          REFERENCES subject_topics(id) ON DELETE SET NULL,
  chapter_id  uuid          REFERENCES subject_chapters(id) ON DELETE SET NULL,
  subject_id  uuid          REFERENCES popular_subjects(id) ON DELETE SET NULL,
  course_id   uuid          REFERENCES courses(id) ON DELETE SET NULL,
  title       text          NOT NULL,
  description text,
  earned_at   timestamptz   NOT NULL DEFAULT now()
);

-- 4. Partial unique indexes on student_badges (prevent duplicate badges)
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badge_topic
  ON student_badges (student_id, badge_type, topic_id)
  WHERE topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badge_chapter
  ON student_badges (student_id, badge_type, chapter_id)
  WHERE chapter_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badge_subject
  ON student_badges (student_id, badge_type, subject_id)
  WHERE subject_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badge_course
  ON student_badges (student_id, badge_type, course_id)
  WHERE course_id IS NOT NULL;

-- 5. Unique indexes on ai_video_watch_logs (idempotent insert support)
CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_log_student_topic
  ON ai_video_watch_logs (student_id, topic_id)
  WHERE topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_log_student_title
  ON ai_video_watch_logs (student_id, video_title)
  WHERE topic_id IS NULL;

-- 6. Enable RLS
ALTER TABLE ai_video_watch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_badges ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies for ai_video_watch_logs
--    Use DO block to avoid errors if policies already exist
DO $$ BEGIN
  CREATE POLICY "watch_logs_insert" ON ai_video_watch_logs
    FOR INSERT WITH CHECK (auth.uid() = student_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "watch_logs_select" ON ai_video_watch_logs
    FOR SELECT USING (auth.uid() = student_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "watch_logs_update" ON ai_video_watch_logs
    FOR UPDATE USING (auth.uid() = student_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. RLS policies for student_badges
DO $$ BEGIN
  CREATE POLICY "badges_select" ON student_badges
    FOR SELECT USING (auth.uid() = student_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "badges_insert" ON student_badges
    FOR INSERT WITH CHECK (auth.uid() = student_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Note: Edge functions also insert using service_role key (bypasses RLS entirely).
