import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sanitizeSlidePreview,
  DoubtSource,
  DoubtSlidePreview,
} from '../utils/doubtThreads';

/** Normalized data from the `ai-text-answer-proxy` Doubts answer service. */
export interface AITextAnswerData {
  answer: string;
  keyPoints: string[];
  sources: DoubtSource[];
  slidePreview: DoubtSlidePreview | null;
  suggestions: string[];
  isDocGrounded: boolean;
  /** Optional exam tip: new name `exam_tip`, older cached name `quick_tip`. */
  examTip?: string;
  /** Optional real-life example: new name `real_life_example`, older cached name `example`. */
  realLifeExample?: string;
}

export type AITextAnswerResult =
  | { ok: true; data: AITextAnswerData }
  | { ok: false; reason: 'no_content'; message?: string }
  | { ok: false; reason: 'error'; message: string };

export const SUPABASE_URL = 'https://supabase-proxy.utuberpraveen.workers.dev';
// Direct Supabase project URL, used ONLY for the long-running AI Teaching
// Assistant call. The Cloudflare worker proxy (SUPABASE_URL) drops idle
// connections at ~150s, which cuts off slow AI answers (30s–5min). Hitting the
// project directly with a long client timeout avoids that. Same project as the
// anon key below (ref: oxwhqvsoelqqsblmqkxx).
export const SUPABASE_DIRECT_URL = 'https://oxwhqvsoelqqsblmqkxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94d2hxdnNvZWxxcXNibG1xa3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTU4NTgsImV4cCI6MjA3NTA5MTg1OH0.nZbWSb9AQK5uGAQmc7zXAceTHm9GRQJvqkg4-LNo_DM';

export const AUTH_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

// Minimal base64 decoder (no atob dependency — not guaranteed in the RN/Hermes
// runtime). Only used to read the JWT payload, which is ASCII JSON.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** First argument that is a non-empty string (trimmed check, original kept). */
function firstNonEmptyString(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function decodeBase64(input: string): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const idx = B64_CHARS.indexOf(input[i]);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

// Returns the JWT `exp` claim in milliseconds, or null if it can't be read.
function decodeJwtExpMs(token: string | null): number | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const payload = JSON.parse(decodeBase64(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function extractThumbnailUrl(courseThumbnails: any): string | null {
  if (!courseThumbnails) return null;
  const url = Array.isArray(courseThumbnails)
    ? courseThumbnails[0]?.storage_url
    : courseThumbnails?.storage_url;
  if (!url || typeof url !== 'string' || url.startsWith('data:')) return null;
  return url;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  short_description: string | null;
  duration_months: number | null;
  price_inr: number | null;
}

export interface CourseCategory {
  id: string;
  name: string;
  slug: string;
}

export interface PublishedReel {
  id: string;
  title: string | null;
  video_url: string;
  reel_index: number;
  variant?: string | null;
  topic_id?: string | null;
  chapter_id?: string | null;
}

export interface CourseSubjectItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
}

export interface CourseFAQ {
  id: string;
  question: string;
  answer: string;
  display_order: number;
}

export interface ExploreCourse {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  short_description: string | null;
  detailed_description: string | null;
  price_inr: number | null;
  original_price_inr: number | null;
  duration_months: number | null;
  student_count: number | null;
  rating: number | null;
  review_count: number | null;
  is_active: boolean;
  is_coming_soon: boolean;
  what_you_learn: string[] | null;
  course_includes: (string | { icon?: string; text?: string; label?: string })[] | null;
  instructor_name: string | null;
  instructor_bio: string | null;
  instructor_avatar_url: string | null;
  category: string | null;
  created_at?: string | null;
  categories?: CourseCategory[];
  subjects?: CourseSubjectItem[];
  faqs?: CourseFAQ[];
}

export interface CategoryHierarchy {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  level: number;
  display_order: number;
  subcategories: CategoryHierarchy[];
}

export interface Enrollment {
  id: string;
  enrolled_at: string;
  course_id: string;
  courses: Course;
}

export interface EnrolledCourseWithCategory {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  short_description: string | null;
  duration_months: number | null;
  price_inr: number | null;
  enrolled_at: string;
  progress: number;
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
}

export interface ParentCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
}

export interface CourseSubject {
  id: string;
  display_order: number;
  subject: Subject;
}

export interface Chapter {
  id: string;
  title: string;
  chapter_number: number;
  description: string | null;
}

export interface Topic {
  id: string;
  title: string;
  topic_number: number;
  estimated_duration_minutes: number | null;
  content_markdown: string | null;
  chapter_id: string;
  video_id: string | null;
  video_platform: string | null;
}

export interface TopicVideo {
  id: string;
  topic_id: string;
  video_id: string | null;
  /** Stable V4 player identifier sourced from video_generation_jobs.external_job_id */
  external_job_id?: string | null;
  title: string | null;
  description: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  language: string | null;
  display_order: number;
  video_platform: string | null;
  is_active: boolean;
  created_at: string;
  video_url?: string | null; // Kept for legacy fallback only — do not use for playback
  ai_presentation_json?: any; // Complete presentation data from database
  available_languages?: string[]; // Available language versions for this lecture
  is_marketing?: boolean | null; // Used for topic_lecture_visibility filtering
}

export interface CounselorAvatar {
  id: string;
  name: string;
  gender: string;
  language: string;
  image_url: string;
  display_order: number;
  is_active: boolean;
}

export interface PresentationSlide {
  title: string;
  content: string;
  narration: string;
  keyPoints: string[];
  formula: string | null;
  infographic: string;
  infographicUrl: string;
  images?: string[];
  isStory: boolean;
  isTips: boolean;
  // Narration audio provided by the AI response (preferred over local TTS).
  audioUrl?: string;
  audioDuration?: number; // seconds
  // Optional Manim animation video for this slide. When present, the player
  // shows the video (muted) in place of the static infographic, synced with
  // the narration audio.
  manimVideoUrl?: string;
  manimDurationSeconds?: number;
}

export interface AITeachingAssistantResponse {
  cached: boolean;
  cache_id?: string;
  answer: string;
  presentationSlides: PresentationSlide[];
  latexFormulas: Array<{ formula: string; explanation: string }> | string[];
  keyPoints?: string[];
  followUpQuestions?: string[];
  narrationText?: string;
  // Per-slide TTS audio provided by the upstream (optional). The mobile player
  // currently generates its own audio via Sarvam, but these are carried through
  // so they can be used in a later change.
  slideAudioUrls?: Array<{ slideIndex: number; audioUrl: string; duration?: number }>;
  subjectName?: string;
  detected_topic?: string;
  related_concepts?: string[];
  // Optional enrichment fields. Upstream may send the new names
  // (exam_tip / real_life_example) or older cached names (quick_tip / example).
  examTip?: string;
  realLifeExample?: string;
  // Off-subject guard: when the server classifies the question as belonging to
  // a different subject it short-circuits and returns blocked=true with a
  // redirect message instead of a presentation.
  blocked?: boolean;
  reason?: string;
  currentSubject?: string;
  detectedSubject?: string;
  confidence?: number;
  message?: string;
}

// A pre-generated, ready-to-play question surfaced as a suggestion in the AI
// tab. The presentation for `questionId` is already cached in
// pregen_question_cache, so selecting it loads instantly (no live generation).
export interface PregenSuggestion {
  questionId: string;
  questionText: string;
  topicId: string | null;
}

// One row from the live type-ahead question search (qa_cache_results).
export interface QuestionSearchResult {
  cacheId: string;
  question: string;
  similarity?: number;
  accessTier?: string;
}

export interface TTSResponse {
  audioContent: string[];
  isChunked: boolean;
  chunkCount: number;
  languageCode: string;
  voice: string;
}

export interface STTResponse {
  transcript: string;
  languageCode?: string;
  confidence?: number;
}

// New content generation types
export interface TopicContentExample {
  title: string;
  problem: string;
  solution: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface TopicContentQuestion {
  type: 'mcq';
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuestionItem {
  id: string;
  question_text: string;
  question_type: string;
  question_format: string | null;
  options: Record<string, { text: string } | string> | null;
  correct_answer: string;
  explanation: string | null;
  marks: number;
  difficulty: string;
  question_image_url: string | null;
  is_important: boolean;
  topic_id: string | null;
  chapter_id: string | null;
  created_at: string;
}

export interface SubjectiveGradeResult {
  is_correct: boolean;
  marks_awarded: number;
  feedback: string;
}

export interface TopicContentResponse {
  content: string;
  examples: TopicContentExample[];
  practiceQuestions: TopicContentQuestion[];
}

// DPP (Daily Practice Problems) interfaces
export interface DPPQuestion {
  id: string;
  document_id: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  dpp_number: number | null;
  question_number: number | null;
  question_text: string;
  options: { [key: string]: string };
  correct_answer: string;
  explanation: string | null;
  difficulty: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DPPSubmission {
  id: string;
  student_id: string;
  topic_id: string;
  test_date: string;
  dpp_type: string;
  questions: DPPQuestion[];
  answers: { [key: string]: string };
  score: number;
  total_questions: number;
  time_taken_seconds: number;
  submitted_at: string;
}

export interface DPPProgress {
  streak: number;
  totalCompleted: number;
  submissions: { test_date: string; score: number; total_questions: number; time_taken_seconds: number }[];
}

// Assignment interfaces
export interface AssignmentQuestion {
  id: string;
  question: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'long_answer' | 'application' | 'fill_in_blank';
  options?: string[];
  correct_answer?: string;
  marks: number;
  explanation?: string;
  image_url?: string;
}

export interface Assignment {
  id: string;
  subject_id: string;
  chapter_id: string;
  topic_id: string | null;
  title: string;
  description: string;
  instructions: string;
  questions: AssignmentQuestion[];
  total_marks: number;
  passing_marks: number;
  duration_minutes: number;
  due_date: string;
  valid_until: string;
  is_active: boolean;
  source_type: 'ai_generated' | 'manual';
  created_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  answers: { [questionId: string]: { question_id: string; text_answer: string; image_url: string | null; marks_awarded: number; feedback: string; is_correct: boolean } };
  score: number;
  percentage: number;
  feedback: string;
  submitted_at: string;
  graded_at: string | null;
  time_taken_seconds: number;
}

export interface AIGradeResult {
  question_id: string;
  marks_awarded: number;
  feedback: string;
  is_correct: boolean;
}

export interface GeneratedSlide {
  title: string;
  content: string;
  narration: string;
  keyPoints: string[];
  imagePrompts: string[];
  images: string[];
  formula: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    user_metadata: {
      full_name?: string;
      phone?: string;
    };
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  parent_id: string | null;
  level: number;
  display_order: number;
  is_popular: boolean;
  is_active: boolean;
}

// Comprehensive StudentData interface matching website's useCurrentStudent hook
export interface StudentData {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  enrollment_date: string;
  last_active: string;
  status: "active" | "inactive" | "at_risk";
  courses: Array<{
    id: string;
    name: string;
    subjects: string[];
    progress: number;
    enrolled_at: string;
  }>;
  total_progress: number;
  tests_taken: number;
  avg_test_score: number;
  ai_queries: number;
  areas_of_improvement: string[];
  followups_pending: number;
  at_risk: boolean;
  live_classes: {
    total_scheduled: number;
    attended: number;
    attendance_percentage: number;
    missed: number;
    upcoming: number;
    recent_classes: Array<{
      id: string;
      subject: string;
      topic: string;
      date: string;
      attended: boolean;
      duration_minutes: number;
    }>;
  };
  ai_video_usage: {
    total_videos: number;
    watched_count: number;
    total_watch_time_minutes: number;
    completion_rate: number;
    recent_videos: Array<{
      title: string;
      subject: string;
      duration: number;
      watched_percentage: number;
      date: string;
    }>;
  };
  podcast_usage: {
    total_listened: number;
    total_time_minutes: number;
    favorite_topics: string[];
    recent_podcasts: Array<{
      title: string;
      subject: string;
      duration: number;
      date: string;
    }>;
  };
  mcq_practice: {
    total_attempted: number;
    total_correct: number;
    accuracy_percentage: number;
    by_subject: Record<string, { attempted: number; correct: number; accuracy: number }>;
    recent_sessions: Array<{
      subject: string;
      questions: number;
      correct: number;
      date: string;
    }>;
  };
  doubt_clearing: {
    total_doubts: number;
    resolved: number;
    pending: number;
    avg_resolution_time_minutes: number;
    by_subject: Record<string, number>;
    recent_doubts: Array<{
      question: string;
      subject: string;
      status: string;
      date: string;
    }>;
  };
  activity_score: number;
  activity_breakdown: Record<string, number>;
  activity_trends: Array<{
    date: string;
    score: number;
    live_class_minutes: number;
    video_watch_minutes: number;
    podcast_listen_minutes: number;
    mcq_attempts: number;
    doubts_asked: number;
  }>;
  timetable: Array<{
    day: number;
    subject: string;
    topic: string;
    start_time: string;
    end_time: string;
    instructor: string;
    type: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    time: string;
    read: boolean;
    priority: string;
  }>;
}

// Previous Year Paper types
export interface PreviousYearPaper {
  id: string;
  subject_id: string;
  exam_name: string;
  paper_type: string;
  year: number;
  total_questions: number;
  pdf_url: string | null;
  created_at: string;
  chapter_id?: string | null;
  topic_id?: string | null;
  document_type?: string | null;
  paper_category?: 'previous_year' | 'proficiency' | 'exam' | string | null;
}

export interface PreviousYearQuestion {
  id: string;
  topic_id: string | null;
  question_text: string;
  question_type: 'mcq' | 'numeric' | 'subjective' | 'descriptive' | 'practical' | string;
  options: Record<string, { text: string }> | null;
  correct_answer: string;
  explanation: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  marks: number;
  created_at: string;
  subtopic_id: string | null;
  is_ai_generated: boolean;
  is_verified: boolean;
  verified_by: string | null;
  question_format: string | null;
  question_image_url: string | null;
  option_images: Record<string, string> | {};
  contains_formula: boolean;
  formula_type: string | null;
  previous_year_paper_id: string;
  content_hash: string | null;
  source_document_id: string | null;
  is_important: boolean;
}

export interface PreviousYearAttempt {
  id: string;
  user_id: string;
  paper_id: string;
  question_ids: string[];
  answers: Record<string, string>;
  flagged: string[];
  time_limit_minutes: number | null;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  total_questions: number;
  correct_answers: number;
}

export interface TestConfig {
  paperId: string;
  paperTitle: string;
  questionCount: number;
  totalQuestions: number;
  timeLimitMinutes: number | null;
}

// Dashboard-related interfaces
export interface DashboardEnrollment {
  id: string;
  course_id: string;
  batch_id: string;
  enrolled_at: string;
  courses: {
    id: string;
    name: string;
    thumbnail_url: string | null;
  };
  batches: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
  } | null;
}

export interface DashboardSubject {
  subject_id: string;
  display_order: number;
  popular_subjects: {
    id: string;
    name: string;
    description: string | null;
    thumbnail_url: string | null;
  };
}

// Assignment interface is defined earlier in this file

export interface CourseTeacher {
  teacher_id: string;
  subject: string | null;
  course_id: string;
}

export interface DPTSubmission {
  id: string;
  student_id: string;
  topic_id?: string;
  test_date: string;
  score: number | null;
  total_questions: number | null;
  correct_answers: number | null;
  time_taken_seconds?: number;
  submitted_at: string;
}

export interface ScheduledClass {
  id: string;
  course_id: string;
  teacher_id: string | null;
  subject: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  meeting_link: string | null;
  room_number: string | null;
  is_live: boolean;
  is_cancelled: boolean;
  live_started_at: string | null;
  live_ended_at: string | null;
  bbb_meeting_id: string | null;
  recording_url: string | null;
  courses: {
    id: string;
    name: string;
  } | null;
  popular_subjects: {
    id: string;
    name: string;
  } | null;
  subject_chapters: {
    id: string;
    title: string;
    ai_generated_video_url?: string | null;
    ai_presentation_json?: any;
  } | null;
  subject_topics: {
    id: string;
    title: string;
    ai_generated_video_url?: string | null;
    ai_presentation_json?: any;
  } | null;
  teacher_profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export interface CourseTimetable {
  id: string;
  course_id: string;
  subject_id: string;
  instructor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_number: string | null;
  academic_year: string;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  batch_id: string | null;
  meeting_link: string | null;
  subject: {
    id: string;
    name: string;
  } | null;
  instructor: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  course: {
    id: string;
    name: string;
  } | null;
  batch: {
    id: string;
    name: string;
  } | null;
}

export interface ClassRecording {
  id: string;
  scheduled_class_id: string | null;
  bbb_recording_id: string | null;
  original_filename: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  b2_original_path: string | null;
  b2_hls_360p_path: string | null;
  b2_hls_480p_path: string | null;
  b2_hls_720p_path: string | null;
  b2_hls_1080p_path: string | null;
  b2_encrypted_path: string | null;
  bunny_video_guid: string | null;
  bunny_status: string | null;
  cloudflare_zone_id: string | null;
  cdn_base_url: string | null;
  processing_status: string;
  processing_error: string | null;
  processed_at: string | null;
  available_qualities: string[];
  default_quality: string | null;
  created_at: string;
  updated_at: string;
  course_id: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  recording_title: string | null;
  recording_type: string | null;
  thumbnail_url: string | null;
  course: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  chapter: { id: string; title: string; chapter_number: number } | null;
  topic: { id: string; title: string; topic_number: string } | null;
  scheduled_class: {
    id: string;
    subject: string | null;
    scheduled_at: string;
    course_id: string;
    course: {
      id: string;
      name: string;
    } | null;
    teacher: {
      id: string;
      full_name: string;
    } | null;
  } | null;
}

export interface VideoWatchProgress {
  id: string;
  recording_id: string;
  user_id: string;
  progress_seconds: number;
  progress_percent: number;
  completed: boolean;
  last_watched_at: string;
}

export interface PlaybackUrlResponse {
  hlsUrl: string | null;
  directUrl: string | null;
  quality: string;
  availableQualities: string[];
  duration: number | null;
  expiresAt: number;
  usingCdn: boolean;
}

export interface ClassAttendance {
  id: string;
  status: string;
  duration_seconds: number | null;
  scheduled_class: {
    id: string;
    course_id: string;
    scheduled_at: string;
    courses: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export interface SupportFAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
  is_active: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupportArticle {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  icon_name: string;
  display_order: number;
  is_active: boolean;
  helpful_count: number;
  not_helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
  ai_confidence: number | null;
  escalated_at: string | null;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: 'user' | 'ai' | 'admin';
  content: string;
  created_at: string;
}

class SupabaseService {
  private headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  // Single in-flight refresh shared by all callers, so we never fire two
  // refreshes with the same refresh token (which can trip Supabase's
  // token-reuse revocation and kill the session).
  private refreshPromise: Promise<{ success: boolean; error?: string; invalidRefreshToken?: boolean }> | null = null;
  // Short cooldown after a failed proactive refresh so a transient outage
  // doesn't make every API call attempt its own (slow) refresh.
  private proactiveCooldownUntil = 0;
  // Notified when the refresh token is definitively invalid/revoked so the UI
  // layer can force a re-login.
  private onSessionInvalid: (() => void) | null = null;

  setSessionInvalidHandler(handler: (() => void) | null): void {
    this.onSessionInvalid = handler;
  }

  private notifySessionInvalid(): void {
    try {
      this.onSessionInvalid?.();
    } catch {
      // ignore handler errors
    }
  }

  async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error_description || data.msg || 'Login failed' };
      }

      const authData = data as AuthResponse;

      if (!authData.refresh_token) {
        // A login that returns no refresh token can't keep the session alive —
        // fail fast instead of creating a session that dies at token expiry.
        return { success: false, error: 'Login did not return a session. Please try again.' };
      }
      await this.saveTokens(authData.access_token, authData.refresh_token);
      
      const user: User = {
        id: authData.user.id,
        email: authData.user.email,
        full_name: authData.user.user_metadata?.full_name,
        phone: authData.user.user_metadata?.phone,
      };
      
      await this.saveUser(user);
      
      return { success: true, user };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async signup(email: string, password: string, fullName: string, phone: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          email,
          password,
          data: {
            full_name: fullName,
            phone: phone,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error_description || data.msg || 'Signup failed' };
      }

      if (data.access_token) {
        const authData = data as AuthResponse;
        if (!authData.refresh_token) {
          // Access token without a refresh token is a half-login — fail rather
          // than create a session that silently dies at token expiry.
          return { success: false, error: 'Signup did not return a session. Please try again.' };
        }
        await this.saveTokens(authData.access_token, authData.refresh_token);
        
        const user: User = {
          id: authData.user.id,
          email: authData.user.email,
          full_name: authData.user.user_metadata?.full_name,
          phone: authData.user.user_metadata?.phone,
        };
        
        await this.saveUser(user);
        return { success: true, user };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async signInWithGoogle(idToken: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          provider: 'google',
          id_token: idToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error_description || data.msg || data.error || 'Google sign-in failed' };
      }

      if (!data.access_token || !data.user) {
        return { success: false, error: 'Invalid response from server' };
      }

      const authData = data as AuthResponse;

      if (!authData.refresh_token) {
        // Without a refresh token the session can't be kept alive — treat it as
        // a failure rather than a half-login that silently drops the user later.
        return { success: false, error: 'Google sign-in did not return a session. Please try again.' };
      }
      await this.saveTokens(authData.access_token, authData.refresh_token);

      const user: User = {
        id: authData.user.id,
        email: authData.user.email,
        full_name: authData.user.user_metadata?.full_name || authData.user.user_metadata?.name,
        phone: authData.user.user_metadata?.phone,
      };

      await this.saveUser(user);

      return { success: true, user };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async logout(): Promise<void> {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
  }

  async sendPhoneOtp(phone: string, purpose: 'login' | 'signup'): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-phone-otp`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ phone, purpose, channel: 'sms' }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to send OTP' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async verifyPhoneOtp(phone: string, otpCode: string, purpose: 'login' | 'signup', signupData?: { full_name: string; email?: string }): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const body: any = { phone, otp_code: otpCode, purpose };
      if (signupData) body.signup_data = signupData;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-phone-otp`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'OTP verification failed' };
      }
      const accessToken = data.session?.access_token || data.access_token;
      const refreshToken = data.session?.refresh_token || data.refresh_token;
      console.log('[OTP Phone] session present:', !!data.session, '| root token:', !!data.access_token);
      if (accessToken && refreshToken) {
        await this.saveTokens(accessToken, refreshToken);
        const user: User = {
          id: data.user?.id || data.session?.user?.id || '',
          email: data.user?.email || data.session?.user?.email || signupData?.email || '',
          full_name: data.user?.user_metadata?.full_name || data.session?.user?.user_metadata?.full_name || signupData?.full_name,
          phone: phone,
        };
        await this.saveUser(user);
        return { success: true, user };
      }
      // An access token without a refresh token is a half-login: the session
      // would silently die on next launch because auto-refresh has nothing to
      // work with. Surface it as an error instead of a fake success.
      if (accessToken && !refreshToken) {
        console.log('[OTP Phone] Access token but NO refresh token — refusing half-login');
        return { success: false, error: 'Could not start a session. Please try again.' };
      }
      // No tokens at all is the legitimate signup-verify-first flow (the session
      // is established later once the account is actually created).
      console.log('[OTP Phone] No tokens in response — session not saved');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async sendEmailOtp(email: string, purpose: 'login' | 'signup'): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email-otp`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to send OTP' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async verifyEmailOtp(email: string, otpCode: string, purpose: 'login' | 'signup', signupData?: { full_name: string; phone?: string }): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const body: any = { email, otp_code: otpCode, purpose };
      if (signupData) body.signup_data = signupData;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-email-otp`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'OTP verification failed' };
      }
      const accessToken = data.session?.access_token || data.access_token;
      const refreshToken = data.session?.refresh_token || data.refresh_token;
      console.log('[OTP Email] session present:', !!data.session, '| root token:', !!data.access_token);
      if (accessToken && refreshToken) {
        await this.saveTokens(accessToken, refreshToken);
        const user: User = {
          id: data.user?.id || data.session?.user?.id || '',
          email: email,
          full_name: data.user?.user_metadata?.full_name || data.session?.user?.user_metadata?.full_name || signupData?.full_name,
          phone: data.user?.user_metadata?.phone || data.session?.user?.user_metadata?.phone || signupData?.phone,
        };
        await this.saveUser(user);
        return { success: true, user };
      }
      // An access token without a refresh token is a half-login: the session
      // would silently die on next launch because auto-refresh has nothing to
      // work with. Surface it as an error instead of a fake success.
      if (accessToken && !refreshToken) {
        console.log('[OTP Email] Access token but NO refresh token — refusing half-login');
        return { success: false, error: 'Could not start a session. Please try again.' };
      }
      // No tokens at all is the legitimate signup-verify-first flow (the session
      // is established later once the account is actually created).
      console.log('[OTP Email] No tokens in response — session not saved');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async sendPasswordResetOtp(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-password-reset-otp`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to send reset OTP' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async verifyPasswordResetOtp(email: string, otpCode: string): Promise<{ success: boolean; resetToken?: string; userId?: string; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-password-reset-otp`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, otp_code: otpCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'OTP verification failed' };
      }
      return { success: true, resetToken: data.reset_token, userId: data.user_id };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async resetPasswordWithToken(resetToken: string, newPassword: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/reset-password-with-token`, {
        method: 'POST',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword, user_id: userId }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Password reset failed' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async refreshSession(): Promise<{ success: boolean; error?: string; invalidRefreshToken?: boolean }> {
    // Single-flight: concurrent callers share one in-flight refresh.
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this._performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _performRefresh(): Promise<{ success: boolean; error?: string; invalidRefreshToken?: boolean }> {
    let refreshToken: string | null;
    try {
      refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return { success: false, error: 'Storage error' };
    }
    if (!refreshToken) return { success: false, error: 'No refresh token', invalidRefreshToken: true };

    const controller = new AbortController();
    // Generous timeout: aborting too early can cancel a refresh the server has
    // already completed (rotating the refresh token), which permanently
    // invalidates the stored token and logs the user out "after some days".
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let response: Response;
    let data: any;
    try {
      response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });
      data = await response.json();
    } catch (error) {
      // Network failure / timeout / abort is transient — keep the stored
      // session so a flaky connection never logs the user out.
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: 'Network error' };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Distinguish a definitively invalid/revoked refresh token from a
      // transient server error. Only the former should force a re-login.
      const code = `${(data && (data.error || data.error_code || data.code)) || ''}`.trim();
      const desc = `${(data && (data.error_description || data.msg || data.message)) || ''}`;
      // Only treat as definitively invalid on explicit Supabase invalid-grant /
      // refresh-token error CODES (these are unambiguous machine signals), so a
      // transient proxy 400/5xx never falsely logs the user out.
      const codeInvalid =
        /invalid[_\s]?grant/i.test(code) ||
        /refresh_token_(not_found|already_used|revoked|expired)/i.test(code);
      // The free-text description is a weaker signal, so only trust it on a
      // definitive auth-rejection status (400/401) AND when it explicitly names
      // an invalid/expired/revoked refresh token — never on a bare mention of
      // "refresh token" that a transient proxy/error body might also contain.
      const isAuthRejection = response.status === 400 || response.status === 401;
      const descInvalid =
        isAuthRejection &&
        /(invalid|expired|revoked|not\s*found|already\s*used)[^.]*refresh\s*token|refresh\s*token[^.]*(invalid|expired|revoked|not\s*found|already\s*used)/i.test(desc);
      const invalid = codeInvalid || descInvalid;
      if (invalid) {
        this.notifySessionInvalid();
        return { success: false, error: desc || 'Invalid refresh token', invalidRefreshToken: true };
      }
      return { success: false, error: desc || 'Session refresh failed' };
    }

    if (!data || !data.access_token || !data.refresh_token) {
      return { success: false, error: 'Malformed refresh response' };
    }

    // Save the rotated tokens immediately so nothing downstream can drop them.
    // A storage write failure here is transient (disk full, app being killed
    // mid-save): report it as a NON-definitive failure so the caller keeps the
    // existing session and retries later. It must never reject (an unhandled
    // rejection upstream could be caught by a generic handler and force a
    // logout) and must never trip the session-invalid handler.
    try {
      await this.saveTokens(data.access_token, data.refresh_token);
      if (data.user) {
        const user: User = {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name,
          phone: data.user.user_metadata?.phone,
        };
        await this.saveUser(user);
      }
    } catch {
      return { success: false, error: 'Storage error' };
    }
    return { success: true };
  }

  async getUserProfile(): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error_description || data.msg || 'Failed to fetch profile' };
      }

      const user: User = {
        id: data.id,
        email: data.email,
        full_name: data.user_metadata?.full_name,
        phone: data.user_metadata?.phone,
      };

      await this.saveUser(user);
      return { success: true, user };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getProfile(userId: string): Promise<{ success: boolean; profile?: Profile; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&id=eq.${userId}`, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch profile' };
      }

      if (Array.isArray(data) && data.length > 0) {
        return { success: true, profile: data[0] };
      }

      return { success: false, error: 'Profile not found' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async updateProfile(userId: string, updates: { full_name?: string; phone_number?: string; date_of_birth?: string | null }): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to update profile' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getEnrolledCourses(userId: string): Promise<{ success: boolean; enrollments?: Enrollment[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/enrollments?select=id,enrolled_at,course_id,courses(id,name,slug,short_description,duration_months,price_inr,course_thumbnails(storage_url))&student_id=eq.${userId}&is_active=eq.true`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch courses' };
      }

      const enrollments = data.map((e: any) => ({
        ...e,
        courses: e.courses ? { ...e.courses, thumbnail_url: extractThumbnailUrl(e.courses.course_thumbnails) } : e.courses,
      }));
      return { success: true, enrollments };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async checkHasEnrollments(userId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return false;
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/enrollments?select=id&student_id=eq.${userId}&is_active=eq.true`,
        {
          method: 'HEAD',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'count=exact',
          },
        }
      );
      if (!response.ok) return false;
      const range = response.headers.get('Content-Range');
      const total = range ? parseInt(range.split('/')[1] ?? '0', 10) : 0;
      return total > 0;
    } catch {
      return false;
    }
  }

  async getCourseSubjects(courseId: string): Promise<{ success: boolean; subjects?: CourseSubject[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_subjects?select=id,display_order,subject:popular_subjects(id,name,slug,thumbnail_url)&course_id=eq.${courseId}&order=display_order.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch subjects' };
      }

      return { success: true, subjects: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getSubjectName(subjectId: string): Promise<{ success: boolean; subjectName?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/popular_subjects?select=id,name&id=eq.${subjectId}`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      console.log('[getSubjectName] Response for subjectId', subjectId, ':', data);

      if (!response.ok || data.length === 0) {
        return { success: false, error: 'Subject not found' };
      }

      return { success: true, subjectName: data[0]?.name };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getSubjectChapters(subjectId: string): Promise<{ success: boolean; chapters?: Chapter[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_chapters?select=*&subject_id=eq.${subjectId}&order=chapter_number.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      console.log('[getSubjectChapters] Response items:', Array.isArray(data) ? data.length : 'non-array');

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch chapters' };
      }

      // Map chapter_id to id if the table uses chapter_id as the primary key
      const chapters = data.map((ch: any) => ({
        id: ch.id || ch.chapter_id,
        title: ch.title || ch.name,
        chapter_number: ch.chapter_number || ch.order_index || 0,
        description: ch.description || null,
      }));
      console.log('[getSubjectChapters] Mapped chapters:', chapters.map((c: any) => ({ id: c.id, title: c.title })));

      return { success: true, chapters };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Gates the hands-free "Ask AI" voice assistant: only available once an
  // admin has linked this subject (and, when asking about a specific topic,
  // that topic) to Athena. Mirrors the web app's RecordedVideos.tsx
  // `athenaLink` query exactly (same two tables/columns), written as a
  // hand-rolled PostgREST fetch to match this file's existing convention —
  // mobile has no @supabase/supabase-js.
  async getAthenaLink(
    subjectId: string,
    topicId?: string,
  ): Promise<{ athenaSubjectId: string | null; athenaTopicId: string | null; subjectName: string | null }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return { athenaSubjectId: null, athenaTopicId: null, subjectName: null };

      const subjectRes = await fetch(
        `${SUPABASE_URL}/rest/v1/popular_subjects?select=athena_subject_id,name&id=eq.${subjectId}`,
        { method: 'GET', headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } },
      );
      const subjectRows = subjectRes.ok ? await subjectRes.json() : [];
      const subjectRow = Array.isArray(subjectRows) ? subjectRows[0] : null;
      if (!subjectRow?.athena_subject_id) {
        return { athenaSubjectId: null, athenaTopicId: null, subjectName: subjectRow?.name ?? null };
      }

      let athenaTopicId: string | null = null;
      if (topicId) {
        const topicRes = await fetch(
          `${SUPABASE_URL}/rest/v1/subject_topics?select=athena_topic_id&id=eq.${topicId}`,
          { method: 'GET', headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } },
        );
        const topicRows = topicRes.ok ? await topicRes.json() : [];
        athenaTopicId = (Array.isArray(topicRows) ? topicRows[0]?.athena_topic_id : null) ?? null;
      }

      return { athenaSubjectId: subjectRow.athena_subject_id, athenaTopicId, subjectName: subjectRow.name ?? null };
    } catch {
      return { athenaSubjectId: null, athenaTopicId: null, subjectName: null };
    }
  }

  async getChapterTopics(chapterIds: string[]): Promise<{ success: boolean; topics?: Topic[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const idsString = chapterIds.join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_topics?select=id,title,topic_number,estimated_duration_minutes,content_markdown,chapter_id,video_id,video_platform,ai_generated_video_url,ai_presentation_json&chapter_id=in.(${idsString})&order=topic_number.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch topics' };
      }

      return { success: true, topics: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getChapterTopicCounts(chapterIds: string[]): Promise<{ success: boolean; counts?: Record<string, number>; error?: string }> {
    try {
      if (chapterIds.length === 0) {
        return { success: true, counts: {} };
      }
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const idsString = chapterIds.join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_topics?select=chapter_id&chapter_id=in.(${idsString})`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch topic counts' };
      }

      const counts: Record<string, number> = {};
      for (const row of data as Array<{ chapter_id: string | null }>) {
        const cid = row.chapter_id;
        if (cid) counts[cid] = (counts[cid] || 0) + 1;
      }

      return { success: true, counts };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getTopicDetails(topicId: string): Promise<{ success: boolean; topic?: Topic & { subject_id?: string; subject_name?: string }; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Fetch topic with chapter info to get subject_id and subject name
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_topics?select=id,title,topic_number,estimated_duration_minutes,content_markdown,chapter_id,video_id,video_platform,ai_generated_video_url,ai_presentation_json,subject_chapters(subject_id,popular_subjects(id,name))&id=eq.${topicId}`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      console.log('[supabase.getTopicDetails] Response items:', Array.isArray(data) ? data.length : 'non-array');

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch topic details' };
      }

      if (data.length === 0) {
        return { success: false, error: 'Topic not found' };
      }

      // Extract subject_id and subject_name from the joined chapter data
      const topicData = data[0];
      const subject_id = topicData.subject_chapters?.subject_id;
      const popularSubject = topicData.subject_chapters?.popular_subjects;
      const subject_name = Array.isArray(popularSubject) ? popularSubject[0]?.name : popularSubject?.name;
      console.log('[supabase.getTopicDetails] Returning topic with video_id:', topicData?.video_id, 'subject_id:', subject_id, 'subject_name:', subject_name);
      
      // Return topic with subject_id and subject_name included
      const { subject_chapters, ...topicWithoutChapters } = topicData;
      return { 
        success: true, 
        topic: {
          ...topicWithoutChapters,
          subject_id,
          subject_name,
        }
      };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getTopicVideos(topicId: string, chapterId?: string): Promise<{ success: boolean; videos?: TopicVideo[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Fetch all video sources in parallel (matching document priority order)
      const [topicResponse, videosResponse, publishedLecturesResponse] = await Promise.all([
        // 1. Fetch topic details (direct video + legacy AI video)
        fetch(
          `${SUPABASE_URL}/rest/v1/subject_topics?select=id,title,video_id,video_platform,ai_generated_video_url,ai_presentation_json&id=eq.${topicId}`,
          {
            method: 'GET',
            headers: {
              ...this.headers,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        ),
        // 2. Fetch multi-language videos from topic_videos table
        fetch(
          `${SUPABASE_URL}/rest/v1/topic_videos?select=*&topic_id=eq.${topicId}&is_active=eq.true&order=language.asc,display_order.asc`,
          {
            method: 'GET',
            headers: {
              ...this.headers,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        ),
        // 3. Fetch published AI lectures from video_generation_jobs (HIGHEST PRIORITY)
        fetch(
          `${SUPABASE_URL}/rest/v1/video_generation_jobs?select=id,document_name,external_job_id,presentation_json,video_url,is_marketing,created_at,ai_assistant_documents!inner(topic_id,chapter_id)&is_published=eq.true&status=eq.completed&ai_assistant_documents.topic_id=eq.${topicId}&order=created_at.desc`,
          {
            method: 'GET',
            headers: {
              ...this.headers,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        )
      ]);

      const topicData = await topicResponse.json();
      const videosData = await videosResponse.json();
      const publishedLecturesData = await publishedLecturesResponse.json();
      
      console.log('[getTopicVideos] Topic data items:', Array.isArray(topicData) ? topicData.length : 'non-array');
      console.log('[getTopicVideos] Multi-lang videos count:', videosData?.length || 0);
      console.log('[getTopicVideos] Published AI lectures count:', publishedLecturesData?.length || 0);

      const allVideos: TopicVideo[] = [];
      const topic = topicData?.[0];
      let hasPublishedLectures = false;

      // SOURCE 1 (HIGHEST PRIORITY): Add published AI lectures from video_generation_jobs
      if (publishedLecturesResponse.ok && Array.isArray(publishedLecturesData) && publishedLecturesData.length > 0) {
        hasPublishedLectures = true;
        publishedLecturesData.forEach((lecture: any, index: number) => {
          allVideos.push({
            id: `published-${lecture.id}`,
            topic_id: topicId,
            video_id: lecture.external_job_id || lecture.id,
            external_job_id: lecture.external_job_id || null,
            title: lecture.document_name || 'AI Lecture',
            description: 'AI-generated video lecture with native player',
            duration_seconds: null,
            thumbnail_url: null,
            language: 'english',
            display_order: index,
            video_platform: 'ai_generated',
            is_active: true,
            created_at: lecture.created_at || new Date().toISOString(),
            video_url: lecture.video_url,
            ai_presentation_json: lecture.presentation_json,
            available_languages: ['english'],
            is_marketing: lecture.is_marketing ?? null,
          });
        });
      }

      // SOURCE 2: Add legacy AI-generated video (only if no published lectures exist)
      if (!hasPublishedLectures && topic?.ai_generated_video_url) {
        allVideos.push({
          id: `ai-${topicId}`,
          topic_id: topicId,
          video_id: topicId,
          title: `${topic.title || 'Topic'} - AI Lecture`,
          description: 'AI-generated video lecture with native player',
          duration_seconds: null,
          thumbnail_url: null,
          language: 'english',
          display_order: 0,
          video_platform: 'ai_generated',
          is_active: true,
          created_at: new Date().toISOString(),
          video_url: topic.ai_generated_video_url,
          ai_presentation_json: topic.ai_presentation_json,
          available_languages: ['english'],
        });
      }

      // SOURCE 3: Add direct video from subject_topics (if exists)
      if (topic?.video_id && topic?.video_platform) {
        allVideos.push({
          id: `direct-${topicId}`,
          topic_id: topicId,
          video_id: topic.video_id,
          title: topic.title || 'Topic Video',
          description: 'Video lesson',
          duration_seconds: null,
          thumbnail_url: topic.video_platform === 'youtube' 
            ? `https://img.youtube.com/vi/${topic.video_id}/hqdefault.jpg` 
            : null,
          language: 'english',
          display_order: allVideos.length,
          video_platform: topic.video_platform,
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }

      // SOURCE 4: Add multi-language videos from topic_videos table
      if (videosResponse.ok && Array.isArray(videosData)) {
        allVideos.push(...videosData);
      }

      console.log('[getTopicVideos] Total videos:', allVideos.length);
      return { success: true, videos: allVideos };
    } catch (error) {
      console.error('[getTopicVideos] Error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getPublishedReels(topicId?: string, chapterId?: string): Promise<{ success: boolean; reels?: PublishedReel[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Prefer the topic binding when we have a topic (a reel bound to a
      // topic may have a null chapter_id, so don't AND both filters or those
      // rows get hidden). Fall back to chapter_id only in chapter mode.
      // When neither is provided, return ALL published reels (global feed).
      let filter = '';
      if (topicId) {
        filter = `topic_id=eq.${topicId}`;
      } else if (chapterId) {
        filter = `chapter_id=eq.${chapterId}`;
      }

      const filterPart = filter ? `${filter}&` : '';
      const url = `${SUPABASE_URL}/rest/v1/published_reels?select=id,title,video_url,reel_index,variant,topic_id,chapter_id&${filterPart}order=reel_index.asc,id.asc`;
      console.log('[getPublishedReels] GET', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('[getPublishedReels] status', response.status, 'rows', Array.isArray(data) ? data.length : '(not array)');

      if (!response.ok) {
        console.log('[getPublishedReels] error body', JSON.stringify(data).slice(0, 300));
        return { success: false, error: data.message || 'Failed to fetch reels' };
      }

      const reels = (Array.isArray(data) ? data : []).filter(
        (r: PublishedReel) => !!r.video_url
      );
      console.log('[getPublishedReels] playable reels', reels.length, 'first url', reels[0]?.video_url ?? '(none)');
      return { success: true, reels };
    } catch (error) {
      console.error('[getPublishedReels] Error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getCounselorAvatar(gender: string = 'male'): Promise<{ success: boolean; avatar?: CounselorAvatar; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/counselor_avatars?select=*&gender=eq.${gender}&is_active=eq.true&order=display_order.asc&limit=1`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch counselor avatar' };
      }

      if (Array.isArray(data) && data.length > 0) {
        return { success: true, avatar: data[0] };
      }

      return { success: false, error: 'No avatar found' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async askAITeachingAssistant(params: {
    question: string;
    topicId?: string;
    chapterId?: string;
    subjectId?: string; // For chapter-level (subject) mode
    subjectName: string;
    language?: string;
    detailLevel?: 'brief' | 'standard' | 'detailed' | 'comprehensive';
    maxSlides?: number;
    presentationDuration?: number; // in minutes
  }): Promise<{ success: boolean; response?: AITeachingAssistantResponse; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Match the exact payload format used by the website
      // Support both topic-level and subject-level (chapter) queries
      const payload: any = {
        question: params.question,
        subjectName: params.subjectName,
        language: params.language || 'en-IN',
        mode: 'full',
      };
      
      // Add topic/chapter IDs for topic-level queries
      if (params.topicId) {
        payload.topicId = params.topicId;
      }
      if (params.chapterId) {
        payload.chapterId = params.chapterId;
      }
      // Add subjectId for chapter-level queries
      if (params.subjectId) {
        payload.subjectId = params.subjectId;
      }
      
      // Ensure a subjectId is always present (doc: subjectId falls back
      // topicId → chapterId) so the server's off-subject classifier engages.
      if (!payload.subjectId) {
        payload.subjectId = params.topicId || params.chapterId;
      }

      console.log('[API] AI Teaching Assistant request (direct) for:', payload.subjectId || payload.topicId || payload.chapterId);

      // Long answers take 30s–5min. The Cloudflare worker proxy drops idle
      // connections at ~150s, so hit the Supabase project directly and guard the
      // request with a 420s client timeout (matches the web client).
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 420000);

      let response: Response;
      try {
        response = await fetch(`${SUPABASE_DIRECT_URL}/functions/v1/ai-teaching-assistant`, {
          method: 'POST',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err?.name === 'AbortError') {
          console.warn('[API] AI Teaching Assistant timed out after 420s');
          return { success: false, error: 'The AI is taking longer than expected. Please try again.' };
        }
        throw err;
      }
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[API] AI Teaching Assistant response status:', response.status);

      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to get AI response' };
      }

      // Normalize snake_case (direct endpoint, upstream verbatim) or camelCase
      // (legacy proxy shape) into our uniform AITeachingAssistantResponse.
      const normalized = this.normalizeAITeachingResponse(data);

      if (normalized.blocked) {
        console.log('[API] AI response blocked (off-subject). Detected:', normalized.detectedSubject);
      } else {
        console.log('[API] Slides received:', normalized.presentationSlides.length);
        normalized.presentationSlides.forEach((slide, i) => {
          const words = slide.narration?.split(' ').length || 0;
          console.log(`[API] Slide ${i + 1}: "${slide.title}" - ${words} words`);
        });
      }

      return { success: true, response: normalized };
    } catch (error) {
      console.error('[API] AI Teaching Assistant error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Normalize the AI Teaching Assistant response so the rest of the app reads it
  // uniformly, whether the upstream returns snake_case (direct endpoint,
  // verbatim from the Python API) or camelCase (legacy proxy shape).
  private normalizeAITeachingResponse(raw: any): AITeachingAssistantResponse {
    const pick = <T,>(...vals: (T | undefined | null)[]): T | undefined =>
      vals.find((v) => v !== undefined && v !== null) as T | undefined;

    // Off-subject guard: short-circuit with no presentation to play. The
    // navigation/confirmation gate skips blocked responses.
    if (raw?.blocked === true) {
      return {
        cached: false,
        answer: raw.answer || '',
        presentationSlides: [],
        latexFormulas: [],
        blocked: true,
        reason: raw.reason,
        message: raw.message,
        currentSubject: pick<string>(raw.currentSubject, raw.current_subject),
        detectedSubject: pick<string>(raw.detectedSubject, raw.detected_subject),
      };
    }

    const looksLikeJsonLeak = (text: string): boolean => {
      const t = (text || '').trim();
      if (!(t.startsWith('{') || t.startsWith('['))) return false;
      return /["'](presentation_slides|presentationSlides|narration|key_points|keyPoints)["']/.test(t);
    };

    const rawSlides: any[] = pick<any[]>(raw?.presentation_slides, raw?.presentationSlides) || [];
    const normalizedSlides: PresentationSlide[] = rawSlides.map((s) => {
      const keyPoints = pick<string[]>(s?.key_points, s?.keyPoints) || [];
      let content: string = s?.content || '';
      if (looksLikeJsonLeak(content)) {
        content = 'This slide could not be displayed correctly. Please try asking again.';
      }
      return {
        title: s?.title || '',
        content,
        narration: s?.narration || s?.content || '',
        keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
        formula: pick<string>(s?.formula) ?? null,
        infographic: s?.infographic || '',
        infographicUrl: pick<string>(s?.infographicUrl, s?.infographic_url) || '',
        images: s?.images,
        isStory: pick<boolean>(s?.is_story, s?.isStory) ?? false,
        isTips: pick<boolean>(s?.is_tips, s?.isTips) ?? false,
        audioUrl: pick<string>(s?.audioUrl, s?.audio_url),
        audioDuration: pick<number>(s?.duration),
        manimVideoUrl: pick<string>(s?.manimVideoUrl, s?.manim_video_url),
        manimDurationSeconds: pick<number>(s?.manimDurationSeconds, s?.manim_duration_seconds),
      };
    });

    // Overlay the top-level slide_audio_urls onto each slide. Its slideIndex
    // refers to the raw upstream order, which normalizedSlides preserves (the
    // key-point filter runs AFTER this), so attaching the URL to the slide here
    // keeps audio matched to the correct slide even when some are filtered out.
    // Item keys may arrive snake_case (slide_index, audio_url) too.
    const rawAudioList = pick<any[]>(raw?.slide_audio_urls, raw?.slideAudioUrls);
    if (Array.isArray(rawAudioList)) {
      rawAudioList.forEach((a, i) => {
        const idx = pick<number>(a?.slideIndex, a?.slide_index) ?? i;
        const url = pick<string>(a?.audioUrl, a?.audio_url);
        const target = normalizedSlides[idx];
        if (target && url && !target.audioUrl) {
          target.audioUrl = url;
          if (target.audioDuration == null) {
            target.audioDuration = pick<number>(a?.duration);
          }
        }
      });
    }

    // Overlay the TOP-LEVEL Manim video map onto slides. Upstream does NOT put
    // manimVideoUrl on each slide — videos arrive as manimVideoUrls (or
    // manim_video_urls) keyed by the raw slide index as a string:
    //   {"1": {"url": "...manim_1.mp4", "duration_seconds": 14.08}, ...}
    // This must run BEFORE the key-point filter (keys use raw upstream order).
    const rawVideoMap = pick<Record<string, any>>(raw?.manim_video_urls, raw?.manimVideoUrls);
    if (rawVideoMap && typeof rawVideoMap === 'object' && !Array.isArray(rawVideoMap)) {
      Object.entries(rawVideoMap).forEach(([key, v]) => {
        const idx = Number(key);
        const target = Number.isInteger(idx) ? normalizedSlides[idx] : undefined;
        const url = pick<string>(v?.url, v?.video_url, v?.videoUrl, typeof v === 'string' ? v : undefined);
        // Contract-drift guard: keys are 0-based raw slide indices (verified
        // against the live API). Log loudly if a key falls outside the slides.
        if (!target && url) {
          console.warn('[API] manimVideoUrls key', key, 'has no matching slide (slides:', normalizedSlides.length, ') — upstream indexing may have changed');
        }
        if (target && url && !target.manimVideoUrl) {
          target.manimVideoUrl = url;
          if (target.manimDurationSeconds == null) {
            target.manimDurationSeconds = pick<number>(v?.duration_seconds, v?.durationSeconds);
          }
        }
      });
    }

    // Same for the top-level image map — backfill infographicUrl when a slide
    // arrived without its own.
    const rawImageMap = pick<Record<string, any>>(raw?.image_urls, raw?.imageUrls);
    if (rawImageMap && typeof rawImageMap === 'object' && !Array.isArray(rawImageMap)) {
      Object.entries(rawImageMap).forEach(([key, v]) => {
        const idx = Number(key);
        const target = Number.isInteger(idx) ? normalizedSlides[idx] : undefined;
        const url = pick<string>(v?.url, typeof v === 'string' ? v : undefined);
        if (target && url && !target.infographicUrl) {
          target.infographicUrl = url;
        }
      });
    }

    // Keep slides with at least one key point; if that filters everything out,
    // fall back to the raw-normalized slides so the user still sees content.
    const withKeyPoints = normalizedSlides.filter((s) => s.keyPoints.length > 0);
    const slides = withKeyPoints.length > 0 ? withKeyPoints : normalizedSlides;

    // Back-compat: also expose a flat per-slide audio list keyed by the final
    // (displayed) slide order. Player code reads slide.audioUrl directly.
    let slideAudioUrls: Array<{ slideIndex: number; audioUrl: string; duration?: number }> | undefined =
      slides
        .map((s, i) => (s.audioUrl ? { slideIndex: i, audioUrl: s.audioUrl, duration: s.audioDuration } : null))
        .filter(Boolean) as Array<{ slideIndex: number; audioUrl: string; duration?: number }>;
    if (slideAudioUrls.length === 0) slideAudioUrls = undefined;

    return {
      cached: raw?.cached ?? false,
      cache_id: pick<string>(raw?.cache_id, raw?.cacheId),
      answer: raw?.answer || '',
      presentationSlides: slides,
      latexFormulas: pick<any>(raw?.latex_formulas, raw?.latexFormulas) || [],
      keyPoints: pick<string[]>(raw?.key_points, raw?.keyPoints),
      followUpQuestions: pick<string[]>(raw?.follow_up_questions, raw?.followUpQuestions),
      narrationText: pick<string>(raw?.narration_text, raw?.narrationText),
      slideAudioUrls,
      subjectName: pick<string>(raw?.subject_name, raw?.subjectName),
      detected_topic: pick<string>(raw?.detected_topic, raw?.detectedTopic),
      // New names first (exam_tip / real_life_example), then the older cached
      // names (quick_tip / example); snake_case and camelCase both accepted.
      // Non-empty selection: an empty new-name value must not block fallback.
      examTip: firstNonEmptyString(raw?.exam_tip, raw?.examTip, raw?.quick_tip, raw?.quickTip),
      realLifeExample: firstNonEmptyString(raw?.real_life_example, raw?.realLifeExample, raw?.example),
      related_concepts: pick<string[]>(raw?.related_concepts, raw?.relatedConcepts),
      blocked: false,
    };
  }

  // Fetch the list of ready, pre-generated questions for a subject/topic to show
  // as suggestion chips in the AI tab. Goes through the `ai-teaching-proxy` edge
  // function (which forwards to the external AI Teaching API), so we avoid
  // HTTP/HTTPS mixed-content. Only rows whose pre-generation has finished are
  // returned; `pending` is true while any row is still generating so the caller
  // can keep polling.
  async getReadyPregenQuestions(params: {
    subjectId?: string;
    topicId?: string;
  }): Promise<{ success: boolean; questions?: PregenSuggestion[]; pending?: boolean; error?: string }> {
    try {
      const apiBase = 'http://69.197.145.4:8000';
      const qs = new URLSearchParams();
      if (params.subjectId) qs.set('subject_id', params.subjectId);
      if (params.topicId) qs.set('topic_id', params.topicId);
      qs.set('status', 'ready');
      const apiPath = `/questions?${qs.toString()}`;
      const proxyUrl =
        `${SUPABASE_DIRECT_URL}/functions/v1/ai-teaching-proxy` +
        `?path=${encodeURIComponent(apiPath)}&base=${encodeURIComponent(apiBase)}`;

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!response.ok) {
        console.warn('[AI] getReadyPregenQuestions proxy status', response.status);
        return { success: false, error: `proxy ${response.status}` };
      }
      const data = await response.json();
      const arr: any[] = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);

      const questions: PregenSuggestion[] = arr
        .filter((r) => r && (r.is_pregen_done === true || r.pregen_status === 'ready'))
        .map((r) => ({
          questionId: r.question_id || r.id,
          questionText: r.question_text || '',
          topicId: r.topic_id ?? null,
        }))
        .filter((q) => q.questionId && q.questionText);

      const pending = arr.some((r) => r && r.is_pregen_done === false);
      return { success: true, questions, pending };
    } catch (e) {
      console.warn('[AI] getReadyPregenQuestions failed:', e);
      return { success: false, error: 'network' };
    }
  }

  // Live type-ahead question search for the AI tab overlay. Hits the external
  // search-questions endpoint (plain HTTP) through the ai-teaching-proxy edge
  // function to avoid cleartext/mixed-content failures on device. Short queries
  // legitimately return empty arrays — that is not an error.
  async searchQuestions(params: {
    q: string;
    subjectId: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<{ success: boolean; results?: QuestionSearchResult[]; error?: string }> {
    try {
      const apiBase = 'http://116.202.230.124:8000';
      const qs = new URLSearchParams();
      qs.set('q', params.q);
      qs.set('subject_id', params.subjectId);
      qs.set('limit', String(params.limit ?? 20));
      const apiPath = `/search-questions?${qs.toString()}`;
      const proxyUrl =
        `${SUPABASE_DIRECT_URL}/functions/v1/ai-teaching-proxy` +
        `?path=${encodeURIComponent(apiPath)}&base=${encodeURIComponent(apiBase)}`;

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { ...this.headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        signal: params.signal,
      });
      if (!response.ok) {
        console.warn('[AI] searchQuestions proxy status', response.status);
        return { success: false, error: `proxy ${response.status}` };
      }
      const data = await response.json();
      const arr: any[] = Array.isArray(data?.qa_cache_results) ? data.qa_cache_results : [];
      const results: QuestionSearchResult[] = arr
        .map((r) => ({
          cacheId: r?.cache_id || r?.question_hash || '',
          question: r?.question || '',
          similarity: typeof r?.similarity === 'number' ? r.similarity : undefined,
          accessTier: r?.access_tier,
        }))
        .filter((r) => r.cacheId && r.question);
      return { success: true, results };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { success: false, error: 'aborted' };
      console.warn('[AI] searchQuestions failed:', e);
      return { success: false, error: 'network' };
    }
  }

  // Read a pre-generated presentation straight from the pregen_question_cache
  // table by question id. This is the fast path: when a student taps a suggested
  // question we serve the cached slides + audio instead of calling the live AI.
  // Returns not_found when there is no cached row so the caller can fall back.
  async getCachedPresentation(
    questionId: string,
  ): Promise<{ success: boolean; response?: AITeachingAssistantResponse; error?: string }> {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/pregen_question_cache` +
        `?select=response_json&question_id=eq.${encodeURIComponent(questionId)}&limit=1`;
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      if (!response.ok) {
        console.warn('[AI] getCachedPresentation rest status', response.status);
        return { success: false, error: `rest ${response.status}` };
      }
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || !row.response_json) {
        return { success: false, error: 'not_found' };
      }

      // The cached shape nests per-slide audio under slideAudioUrls.urls, but the
      // normalizer expects a flat array. Flatten it so audio attaches by index.
      const rawResp = row.response_json;
      if (
        rawResp &&
        rawResp.slideAudioUrls &&
        !Array.isArray(rawResp.slideAudioUrls) &&
        Array.isArray(rawResp.slideAudioUrls.urls)
      ) {
        rawResp.slideAudioUrls = rawResp.slideAudioUrls.urls;
      }

      const normalized = this.normalizeAITeachingResponse(rawResp);
      return { success: true, response: normalized };
    } catch (e) {
      console.warn('[AI] getCachedPresentation failed:', e);
      return { success: false, error: 'network' };
    }
  }

  // Batch check which of the given question ids have a cached pre-generated
  // presentation. Returns a Set of the question ids that DO have a cache row.
  // Selects only question_id (lightweight) so the Solutions list can show the
  // "AI Presentation Ready" badge without downloading the heavy response_json.
  async getCachedQuestionIds(questionIds: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    if (!questionIds || questionIds.length === 0) return result;
    try {
      // Chunk the ids to keep each in.(...) URL from growing unbounded.
      const CHUNK = 100;
      for (let i = 0; i < questionIds.length; i += CHUNK) {
        const chunk = questionIds.slice(i, i + CHUNK);
        const inList = chunk.map((id) => encodeURIComponent(id)).join(',');
        const url =
          `${SUPABASE_URL}/rest/v1/pregen_question_cache` +
          `?select=question_id&question_id=in.(${inList})`;
        const response = await fetch(url, { method: 'GET', headers: this.headers });
        if (!response.ok) {
          console.warn('[AI] getCachedQuestionIds rest status', response.status);
          continue;
        }
        const rows = await response.json();
        if (Array.isArray(rows)) {
          rows.forEach((r) => {
            if (r && r.question_id) result.add(r.question_id);
          });
        }
      }
    } catch (e) {
      console.warn('[AI] getCachedQuestionIds failed:', e);
    }
    return result;
  }

  async askDoubt(params: {
    question: string;
    subjectId: string;
    messages?: { role: 'user' | 'assistant'; content: string }[];
    studentId?: string;
  }): Promise<{ success: boolean; answer?: string; suggestions?: string[]; error?: string }> {
    try {
      // Spec: authenticate with the user's Supabase session JWT (Bearer) and
      // send the publishable key as the apikey header. Fall back to the anon
      // key only if no session token is available.
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-doubts-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          question: params.question,
          subjectId: params.subjectId,
          // Prior chat history only — the server appends the new question.
          messages: params.messages || [],
          studentId: params.studentId,
        }),
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        return { success: false, error: `Server error (${response.status}). Please try again.` };
      }

      if (!response.ok) {
        return { success: false, error: data?.error || `Request failed (${response.status})` };
      }

      return {
        success: true,
        answer: data.answer,
        // Server may return plain strings or { text } objects; normalize to
        // strings. Cap at 6 (final merge with DB matches also caps at 6).
        suggestions: Array.isArray(data.suggestions)
          ? data.suggestions
              .map((s: any) => (typeof s === 'string' ? s : s?.text))
              .filter((s: any): s is string => typeof s === 'string' && !!s.trim())
              .slice(0, 6)
          : [],
      };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * New Doubts-tab answer service (`ai-text-answer-proxy` edge function).
   * Returns a rich answer: markdown+LaTeX text, key points, sources, an
   * optional slide mini-presentation, and suggested follow-up questions.
   * Normalized into ok / no_content / error per the web client contract.
   */
  async askAITextAnswer(params: {
    question: string;
    subjectId: string;
    subjectName?: string;
    language?: string;
  }): Promise<AITextAnswerResult> {
    // Server can take ~30s; the spec requires a client timeout of ≥45s.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-text-answer-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          language: params.language || 'en',
          question: params.question,
          subjectId: params.subjectId,
          subjectName: params.subjectName,
        }),
        signal: controller.signal,
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        return { ok: false, reason: 'error', message: `Server error (${response.status}). Please try again.` };
      }

      if (!response.ok) {
        return {
          ok: false,
          reason: 'error',
          message: data?.error || data?.message || `Request failed (${response.status}). Please try again.`,
        };
      }

      if (data?.no_content === true) {
        return {
          ok: false,
          reason: 'no_content',
          message: typeof data.message === 'string' && data.message.trim() ? data.message : undefined,
        };
      }

      if (typeof data?.answer !== 'string' || !data.answer.trim()) {
        return { ok: false, reason: 'error', message: 'Could not get a response. Please try again.' };
      }

      return {
        ok: true,
        data: {
          answer: data.answer,
          keyPoints: Array.isArray(data.key_points)
            ? data.key_points.filter((p: any): p is string => typeof p === 'string' && !!p.trim())
            : [],
          sources: Array.isArray(data.sources)
            ? data.sources
                .filter((s: any) => s && typeof s === 'object')
                .map((s: any) => ({
                  docTitle: typeof s.doc_title === 'string' ? s.doc_title : '',
                  sectionTitle: typeof s.section_title === 'string' ? s.section_title : '',
                }))
                .filter((s: DoubtSource) => !!s.docTitle || !!s.sectionTitle)
            : [],
          slidePreview: sanitizeSlidePreview(data.slide_preview),
          suggestions: Array.isArray(data.suggestions)
            ? data.suggestions
                .map((s: any) => (typeof s === 'string' ? s : s?.question))
                .filter((s: any): s is string => typeof s === 'string' && !!s.trim())
                .slice(0, 6)
            : [],
          isDocGrounded: !!data.is_doc_grounded,
          // New names first, then the older cached names. Only non-empty
          // strings survive so the UI can gate cards on presence alone.
          examTip: firstNonEmptyString(data.exam_tip, data.quick_tip),
          realLifeExample: firstNonEmptyString(data.real_life_example, data.example),
        },
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return { ok: false, reason: 'error', message: 'The answer is taking too long. Please try again.' };
      }
      return { ok: false, reason: 'error', message: 'Network error. Please try again.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Similar-question matches from the DB, used to enrich the doubt chat's
   * follow-up chips. Best-effort: any failure yields an empty list so the
   * main AI answer path is never blocked.
   */
  async findSimilarQuestions(text: string, subjectId: string, limit: number = 6): Promise<string[]> {
    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/find_similar_questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_text: text,
          p_subject_id: subjectId,
          p_topic_id: null,
          p_limit: limit,
        }),
      });
      if (!response.ok) return [];
      const rows = await response.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .map((r: any) =>
          typeof r === 'string' ? r : r?.question_text || r?.text || r?.question || null
        )
        .filter((s: any): s is string => typeof s === 'string' && !!s.trim())
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  async getTextToSpeech(text: string, gender: string = 'male', languageCode: string = 'en-IN'): Promise<{ success: boolean; ttsResponse?: TTSResponse; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/sarvam-tts`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          text,
          gender,
          languageCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to generate speech' };
      }

      return { success: true, ttsResponse: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getSpeechToText(audioBase64: string, languageCode: string = 'en-IN', mimeType: string = 'audio/m4a'): Promise<{ success: boolean; sttResponse?: STTResponse; error?: string }> {
    try {
      console.log('[API] Calling speech-to-text with audio length:', audioBase64.length, 'mimeType:', mimeType);
      
      // Use the Express server endpoint for speech-to-text (Gemini-powered)
      const EXPRESS_API_URL = 'https://90375c04-b4d3-4a77-b1d3-ce92fa738d8c-00-c0r6vygbwubw.worf.replit.dev';
      
      const response = await fetch(`${EXPRESS_API_URL}/api/speech-to-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioContent: audioBase64,
          languageCode,
          mimeType,
        }),
      });

      const data = await response.json();
      console.log('[API] Speech-to-text response:', response.ok ? 'SUCCESS' : 'FAILED', data);

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to transcribe audio' };
      }

      return { success: true, sttResponse: data };
    } catch (error) {
      console.error('[API] Speech-to-text error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async generateTopicContent(params: {
    topicTitle: string;
    topicDescription?: string;
    chapterTitle: string;
    subjectName: string;
    categoryName: string;
    estimatedDurationMinutes?: number;
  }): Promise<{ success: boolean; response?: TopicContentResponse; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[API] Calling ai-generate-topic-content with:', params);
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-generate-topic-content`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          topicTitle: params.topicTitle,
          topicDescription: params.topicDescription || '',
          chapterTitle: params.chapterTitle,
          subjectName: params.subjectName,
          categoryName: params.categoryName,
          estimatedDurationMinutes: params.estimatedDurationMinutes || 15,
        }),
      });

      const data = await response.json();
      console.log('[API] ai-generate-topic-content response:', response.ok ? 'SUCCESS' : 'FAILED');

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to generate topic content' };
      }

      return { success: true, response: data };
    } catch (error) {
      console.error('[API] generateTopicContent error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Generate comprehensive presentation slides from topic content (10-15 minutes)
  async generateComprehensiveSlides(params: {
    topicTitle: string;
    topicDescription?: string;
    chapterTitle: string;
    subjectName: string;
    categoryName: string;
    question?: string;
  }): Promise<{ success: boolean; response?: AITeachingAssistantResponse; error?: string }> {
    try {
      console.log('[API] Generating comprehensive slides for:', params.topicTitle);
      
      // Step 1: Get comprehensive topic content
      const contentResult = await this.generateTopicContent({
        topicTitle: params.topicTitle,
        topicDescription: params.topicDescription,
        chapterTitle: params.chapterTitle,
        subjectName: params.subjectName,
        categoryName: params.categoryName,
        estimatedDurationMinutes: 15, // Request 15 minutes of content
      });

      if (!contentResult.success || !contentResult.response) {
        console.log('[API] Failed to generate topic content, falling back to askAITeachingAssistant');
        // Fallback to the original method with comprehensive parameters
        const fallbackResult = await this.askAITeachingAssistant({
          question: params.question || `Explain ${params.topicTitle} in detail`,
          topicId: 'topic-comprehensive',
          chapterId: 'chapter-comprehensive', 
          subjectName: params.subjectName,
          language: 'en-IN',
          detailLevel: 'comprehensive',
          maxSlides: 50,
          presentationDuration: 15,
        });
        
        if (fallbackResult.success && fallbackResult.response) {
          // Enhance the fallback response with additional slides for longer content
          const enhancedSlides = this.enhanceSlidesForComprehensiveCoverage(
            fallbackResult.response.presentationSlides,
            params.topicTitle
          );
          return {
            success: true,
            response: {
              ...fallbackResult.response,
              presentationSlides: enhancedSlides,
            }
          };
        }
        return fallbackResult;
      }

      const topicContent = contentResult.response;
      console.log('[API] Topic content received, parsing into slides...');

      // Step 2: Parse the content into detailed slides
      const slides: PresentationSlide[] = [];
      
      // Split content into sections for comprehensive coverage
      const contentSections = this.parseContentIntoSections(topicContent.content, params.topicTitle);
      
      // Create introduction slide
      slides.push({
        title: `Introduction: ${params.topicTitle}`,
        content: contentSections.introduction || `Welcome to this comprehensive lesson on ${params.topicTitle}. In this session, we will explore the fundamental concepts, understand the underlying principles, and work through practical examples to master this topic.`,
        narration: `Welcome to this comprehensive lesson on ${params.topicTitle}. ${contentSections.introNarration || `Today, we will take a deep dive into this fascinating topic. By the end of this session, you will have a thorough understanding of the core concepts, be able to apply them to solve problems, and feel confident about this subject.`}`,
        keyPoints: contentSections.introKeyPoints || [
          `What is ${params.topicTitle}`,
          'Why is this topic important',
          'What you will learn today',
          'How to apply this knowledge'
        ],
        formula: null,
        infographic: '',
        infographicUrl: '',
        images: [],
        isStory: false,
        isTips: false,
      });

      // Create concept explanation slides (multiple detailed slides)
      for (let i = 0; i < contentSections.concepts.length; i++) {
        const concept = contentSections.concepts[i];
        slides.push({
          title: concept.title,
          content: concept.content,
          narration: concept.narration,
          keyPoints: concept.keyPoints,
          formula: concept.formula || null,
          infographic: '',
          infographicUrl: '',
          images: [],
          isStory: false,
          isTips: false,
        });
      }

      // Create example slides from the examples in the response
      if (topicContent.examples && topicContent.examples.length > 0) {
        for (let i = 0; i < topicContent.examples.length; i++) {
          const example = topicContent.examples[i];
          slides.push({
            title: `Worked Example ${i + 1}: ${example.title}`,
            content: `Problem: ${example.problem}\n\nSolution: ${example.solution}`,
            narration: `Let's work through this ${example.difficulty} level example together. ${example.problem} Now, let me explain the solution step by step. ${example.solution}`,
            keyPoints: [
              'Understand the problem statement',
              'Identify the key information',
              'Apply the relevant concepts',
              'Verify your answer'
            ],
            formula: null,
            infographic: '',
            infographicUrl: '',
            images: [],
            isStory: false,
            isTips: false,
          });
        }
      }

      // Create practice question slides
      if (topicContent.practiceQuestions && topicContent.practiceQuestions.length > 0) {
        for (let i = 0; i < Math.min(topicContent.practiceQuestions.length, 3); i++) {
          const question = topicContent.practiceQuestions[i];
          slides.push({
            title: `Practice Question ${i + 1}`,
            content: `${question.question}\n\nOptions:\n${question.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt}`).join('\n')}\n\nCorrect Answer: ${question.correctAnswer}\n\nExplanation: ${question.explanation}`,
            narration: `Now let's test your understanding with this ${question.difficulty} level practice question. ${question.question} Take a moment to think about the answer. The options are: ${question.options.join(', ')}. The correct answer is ${question.correctAnswer}. ${question.explanation}`,
            keyPoints: [
              'Read the question carefully',
              'Eliminate wrong options',
              'Apply learned concepts',
              'Check your reasoning'
            ],
            formula: null,
            infographic: '',
            infographicUrl: '',
            images: [],
            isStory: false,
            isTips: false,
          });
        }
      }

      // Create summary slide
      slides.push({
        title: `Summary: ${params.topicTitle}`,
        content: contentSections.summary || `In this comprehensive lesson, we covered all the essential aspects of ${params.topicTitle}. You learned the fundamental concepts, worked through practical examples, and tested your knowledge with practice questions.`,
        narration: contentSections.summaryNarration || `Excellent work! Let's recap what we learned today about ${params.topicTitle}. We started with the basic concepts, explored the underlying principles, worked through several examples, and practiced with questions. Remember to review these concepts regularly and practice more problems to solidify your understanding. You're making great progress!`,
        keyPoints: contentSections.summaryKeyPoints || [
          'Key concepts reviewed',
          'Important formulas to remember',
          'Practice regularly',
          'Apply to real problems'
        ],
        formula: null,
        infographic: '',
        infographicUrl: '',
        images: [],
        isStory: false,
        isTips: true,
      });

      console.log('[API] Generated', slides.length, 'comprehensive slides');

      const response: AITeachingAssistantResponse = {
        cached: false,
        answer: topicContent.content,
        presentationSlides: slides,
        latexFormulas: [],
      };

      return { success: true, response };
    } catch (error) {
      console.error('[API] generateComprehensiveSlides error:', error);
      return { success: false, error: 'Failed to generate comprehensive content' };
    }
  }

  // Enhance slides from fallback response for more comprehensive coverage
  private enhanceSlidesForComprehensiveCoverage(
    originalSlides: PresentationSlide[],
    topicTitle: string
  ): PresentationSlide[] {
    if (!originalSlides || originalSlides.length === 0) {
      return originalSlides;
    }

    const enhancedSlides: PresentationSlide[] = [];
    
    // Add enhanced introduction slide
    enhancedSlides.push({
      title: `Introduction: ${topicTitle}`,
      content: `Welcome to this comprehensive lesson on ${topicTitle}. In this session, we will explore the fundamental concepts, understand the underlying principles, and work through practical examples to master this topic. Pay close attention as we break down each concept step by step.`,
      narration: `Welcome to this comprehensive lesson on ${topicTitle}. Today, we will take a deep dive into this fascinating topic. By the end of this session, you will have a thorough understanding of the core concepts, be able to apply them to solve problems, and feel confident about this subject. Let's begin our journey of learning together.`,
      keyPoints: [
        `What is ${topicTitle}`,
        'Why is this topic important',
        'What you will learn today',
        'How to apply this knowledge in exams'
      ],
      formula: null,
      infographic: '',
      infographicUrl: '',
      images: [],
      isStory: false,
      isTips: false,
    });

    // Add all original slides with enhanced narrations
    for (let i = 0; i < originalSlides.length; i++) {
      const slide = originalSlides[i];
      
      // Enhance the narration to be more detailed
      const enhancedNarration = slide.narration.length < 200 
        ? `${slide.narration} Let me explain this in more detail. This is an important concept that you need to understand thoroughly. ${slide.content.substring(0, 300)}${slide.content.length > 300 ? '...' : ''}`
        : slide.narration;
      
      enhancedSlides.push({
        ...slide,
        narration: enhancedNarration,
        keyPoints: slide.keyPoints.length > 0 ? slide.keyPoints : [
          'Understand the core concept',
          'Note the key relationships',
          'Remember important details',
          'Apply to practice problems'
        ],
      });
      
      // Add a "Deep Dive" slide after complex slides for more explanation
      if (i < originalSlides.length - 1 && slide.content.length > 200) {
        enhancedSlides.push({
          title: `Deep Dive: ${slide.title}`,
          content: `Let's explore ${slide.title} in more depth. Understanding these details will help you master this concept and apply it effectively in various situations. Focus on the key relationships and how they connect to other topics you've learned.`,
          narration: `Now let's dive deeper into ${slide.title}. This is where we really understand the nuances of this concept. Pay attention to how these ideas connect with each other. The deeper your understanding here, the better you'll be able to apply this knowledge in exams and real-world situations. Take your time to absorb this information.`,
          keyPoints: [
            'Build on previous concepts',
            'See the connections between ideas',
            'Think critically about applications',
            'Practice applying this knowledge'
          ],
          formula: slide.formula,
          infographic: '',
          infographicUrl: '',
          images: [],
          isStory: false,
          isTips: false,
        });
      }
    }

    // Add practice and application slide
    enhancedSlides.push({
      title: `Practice & Application: ${topicTitle}`,
      content: `Now that we've covered the theory, let's think about how to apply this knowledge. When solving problems related to ${topicTitle}, always start by identifying the key information given in the problem. Then, recall the relevant concepts and formulas we discussed. Finally, apply them step by step.`,
      narration: `Excellent progress! Now let's discuss how to apply what you've learned about ${topicTitle} in practice. When you encounter problems in exams, always start by reading the question carefully. Identify what information is given and what you need to find. Then recall the relevant concepts and formulas we discussed today. Apply them step by step, and always verify your answer. Practice is the key to mastery.`,
      keyPoints: [
        'Read problems carefully',
        'Identify given information',
        'Apply relevant formulas',
        'Verify your answers'
      ],
      formula: null,
      infographic: '',
      infographicUrl: '',
      images: [],
      isStory: false,
      isTips: true,
    });

    // Add summary slide
    enhancedSlides.push({
      title: `Summary: ${topicTitle}`,
      content: `In this comprehensive lesson, we covered all the essential aspects of ${topicTitle}. You learned the fundamental concepts, explored the underlying principles, and understood how to apply this knowledge. Remember to review these concepts regularly and practice solving problems.`,
      narration: `Excellent work completing this lesson on ${topicTitle}! Let's summarize what we learned today. We started with the basic concepts and gradually built up to more advanced ideas. We explored the key principles, discussed important formulas, and learned how to apply this knowledge to solve problems. Remember to review these concepts regularly and practice with more problems. With consistent practice, you will master this topic. Great job today, and keep up the excellent work!`,
      keyPoints: [
        'Key concepts reviewed',
        'Important formulas to remember',
        'Practice regularly for mastery',
        'Apply to exam problems'
      ],
      formula: null,
      infographic: '',
      infographicUrl: '',
      images: [],
      isStory: false,
      isTips: true,
    });

    console.log('[API] Enhanced slides from', originalSlides.length, 'to', enhancedSlides.length, 'slides');
    return enhancedSlides;
  }

  // Helper to parse content into structured sections
  private parseContentIntoSections(content: string, topicTitle: string): {
    introduction: string;
    introNarration: string;
    introKeyPoints: string[];
    concepts: Array<{
      title: string;
      content: string;
      narration: string;
      keyPoints: string[];
      formula?: string;
    }>;
    summary: string;
    summaryNarration: string;
    summaryKeyPoints: string[];
  } {
    // Split content by common section markers or paragraphs
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
    
    const concepts: Array<{
      title: string;
      content: string;
      narration: string;
      keyPoints: string[];
      formula?: string;
    }> = [];

    // Extract headings and content sections
    const sections = content.split(/(?=#{1,3}\s+|(?:^|\n)(?:Definition|Concept|Principle|Theory|Law|Formula|Application|Example|Note|Important)[\s:]+)/i);
    
    let sectionIndex = 0;
    for (const section of sections) {
      if (section.trim().length < 100) continue;
      
      // Extract title from section
      const titleMatch = section.match(/^#+\s*(.+?)(?:\n|$)/);
      const altTitleMatch = section.match(/^(Definition|Concept|Principle|Theory|Law|Formula|Application|Example|Note|Important)[:\s]+(.+?)(?:\n|$)/i);
      
      let title = titleMatch ? titleMatch[1].trim() : 
                  altTitleMatch ? `${altTitleMatch[1]}: ${altTitleMatch[2]}`.trim() :
                  `Key Concept ${sectionIndex + 1}: ${topicTitle}`;
      
      const contentText = section.replace(/^#+\s*.+?\n/, '').trim();
      
      // Extract key points from content
      const keyPoints: string[] = [];
      const bulletMatches = contentText.match(/[-•]\s+(.+?)(?:\n|$)/g);
      if (bulletMatches) {
        bulletMatches.slice(0, 4).forEach(match => {
          keyPoints.push(match.replace(/^[-•]\s+/, '').trim());
        });
      }
      
      if (keyPoints.length === 0) {
        // Generate key points from sentences
        const sentences = contentText.split(/[.!?]+/).filter(s => s.trim().length > 20);
        sentences.slice(0, 4).forEach(s => keyPoints.push(s.trim().substring(0, 100)));
      }

      // Extract formula if present
      const formulaMatch = contentText.match(/\$\$(.+?)\$\$|\$(.+?)\$|formula[:\s]+(.+?)(?:\n|$)/i);
      const formula = formulaMatch ? (formulaMatch[1] || formulaMatch[2] || formulaMatch[3])?.trim() : undefined;

      if (contentText.length > 100) {
        concepts.push({
          title: title.substring(0, 80),
          content: contentText,
          narration: `Now let's understand ${title}. ${contentText.substring(0, 500)}${contentText.length > 500 ? '...' : ''}`,
          keyPoints: keyPoints.length > 0 ? keyPoints : ['Understand the core concept', 'Note the key relationships', 'Remember the important details'],
          formula,
        });
        sectionIndex++;
      }
    }

    // If we didn't get enough sections, create them from paragraphs
    if (concepts.length < 5 && paragraphs.length > 3) {
      const conceptTitles = [
        `What is ${topicTitle}?`,
        'Core Principles and Concepts',
        'Key Properties and Characteristics',
        'Mathematical Relationships',
        'Real-World Applications',
        'Common Misconceptions',
        'Important Formulas',
        'Problem-Solving Techniques'
      ];
      
      for (let i = concepts.length; i < Math.min(8, paragraphs.length); i++) {
        const para = paragraphs[i];
        if (para && para.length > 100) {
          concepts.push({
            title: conceptTitles[i] || `Understanding ${topicTitle} - Part ${i + 1}`,
            content: para,
            narration: `${para} Let me explain this in more detail so you can fully understand this concept.`,
            keyPoints: [
              'Focus on the main idea',
              'Understand the relationships',
              'Note important details',
              'Apply this knowledge'
            ],
          });
        }
      }
    }

    // Ensure we have at least 5 concept slides for comprehensive coverage
    while (concepts.length < 5) {
      concepts.push({
        title: `Deep Dive: ${topicTitle} - Part ${concepts.length + 1}`,
        content: `Let's explore another important aspect of ${topicTitle}. Understanding these details will help you master this topic and apply it effectively in various situations.`,
        narration: `Now, let's dive deeper into ${topicTitle}. This is an important concept that builds on what we've already learned. Pay close attention to how these ideas connect with each other.`,
        keyPoints: [
          'Build on previous concepts',
          'See the connections',
          'Think critically',
          'Practice application'
        ],
      });
    }

    return {
      introduction: `Welcome to this comprehensive lesson on ${topicTitle}. We will explore this topic in depth, covering fundamental concepts, working through examples, and practicing with questions.`,
      introNarration: `Hello and welcome! Today we're going to learn about ${topicTitle} in detail. This is an important topic that you need to understand thoroughly. By the end of this session, you will have a deep understanding of all the key concepts.`,
      introKeyPoints: [
        `Understanding ${topicTitle}`,
        'Why this topic matters',
        'Key concepts to learn',
        'How to apply this knowledge'
      ],
      concepts,
      summary: `We have covered all the essential aspects of ${topicTitle}. Review the key concepts and practice regularly to master this topic.`,
      summaryNarration: `Great job completing this lesson! Let's summarize what we learned about ${topicTitle}. Remember to review these concepts and practice solving problems. With regular practice, you will master this topic.`,
      summaryKeyPoints: [
        'Review main concepts',
        'Practice with examples',
        'Apply to new problems',
        'Continue learning'
      ],
    };
  }

  async generateImage(prompt: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[API] Calling ai-generate-image with prompt:', prompt.substring(0, 50) + '...');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-generate-image`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      console.log('[API] ai-generate-image response:', response.ok ? 'SUCCESS' : 'FAILED');

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to generate image' };
      }

      return { success: true, imageUrl: data.imageUrl };
    } catch (error) {
      console.error('[API] generateImage error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getCategories(): Promise<{ success: boolean; categories?: Category[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/categories?select=*&is_active=eq.true&order=level.asc,display_order.asc`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch categories' };
      }

      return { success: true, categories: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  buildCategoryHierarchy(categories: Category[]): CategoryHierarchy[] {
    const categoryMap = new Map<string, CategoryHierarchy>();
    const level1Categories: CategoryHierarchy[] = [];

    categories.forEach((cat) => {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        level: cat.level,
        display_order: cat.display_order || 0,
        subcategories: [],
      });
    });

    categories.forEach((cat) => {
      const category = categoryMap.get(cat.id);
      if (!category) return;

      if (cat.level === 1) {
        level1Categories.push(category);
      } else if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.subcategories.push(category);
        }
      }
    });

    level1Categories.forEach((cat) => {
      cat.subcategories.sort((a, b) => a.display_order - b.display_order);
      cat.subcategories.forEach((subcat) => {
        subcat.subcategories.sort((a, b) => a.display_order - b.display_order);
      });
    });

    return level1Categories.sort((a, b) => a.display_order - b.display_order);
  }

  async getCoursesByCategory(
    categoryIds: string[] = [],
    page: number = 1,
    limit: number = 20
  ): Promise<{ success: boolean; courses?: ExploreCourse[]; total?: number; error?: string }> {
    try {
      if (categoryIds.length === 0) {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/courses?select=id,name,slug,short_description,detailed_description,price_inr,original_price_inr,duration_months,student_count,rating,review_count,is_active,is_coming_soon,what_you_learn,course_includes,instructor_name,instructor_bio,instructor_avatar_url,category,course_thumbnails(storage_url)&is_active=eq.true&order=student_count.desc.nullslast&limit=${limit}&offset=${(page - 1) * limit}`,
          {
            method: 'GET',
            headers: this.headers,
          }
        );

        const data = await response.json();
        if (!response.ok) {
          return { success: false, error: data.message || 'Failed to fetch courses' };
        }

        const courses = data.map((c: any) => ({ ...c, thumbnail_url: extractThumbnailUrl(c.course_thumbnails) }));
        return { success: true, courses, total: courses.length };
      }

      const categoryIdsStr = categoryIds.map(id => `"${id}"`).join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_categories?select=courses:course_id(id,name,slug,short_description,detailed_description,price_inr,original_price_inr,duration_months,student_count,rating,review_count,is_active,is_coming_soon,what_you_learn,course_includes,instructor_name,instructor_bio,instructor_avatar_url,category,created_at,course_thumbnails(storage_url))&category_id=in.(${categoryIdsStr})`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch courses' };
      }

      const uniqueCourses = new Map<string, ExploreCourse>();
      data?.forEach((cc: { courses: any }) => {
        if (cc.courses?.is_active) {
          const c = cc.courses;
          uniqueCourses.set(c.id, { ...c, thumbnail_url: extractThumbnailUrl(c.course_thumbnails) });
        }
      });

      const courses = Array.from(uniqueCourses.values());
      return { success: true, courses, total: courses.length };
    } catch (error) {
      console.error('Error fetching courses by category:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getTopCoursesByCategory(
    categoryIds: string | string[],
    limit: number = 3
  ): Promise<{ success: boolean; courses?: ExploreCourse[]; error?: string }> {
    try {
      const ids = Array.isArray(categoryIds) ? categoryIds : [categoryIds];
      const filter = ids.length === 1
        ? `category_id=eq.${ids[0]}`
        : `category_id=in.("${ids.join('","')}")`;
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_categories?select=courses:course_id(id,name,slug,student_count,rating,review_count,price_inr,is_active,course_thumbnails(storage_url))&${filter}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch top courses' };
      }

      const seen = new Set<string>();
      const courses = data
        ?.filter((cc: any) => {
          if (!cc.courses?.is_active) return false;
          if (seen.has(cc.courses.id)) return false;
          seen.add(cc.courses.id);
          return true;
        })
        .map((cc: any) => ({
          ...cc.courses,
          thumbnail_url: extractThumbnailUrl(cc.courses.course_thumbnails),
        }))
        .sort((a: any, b: any) => (b.student_count || 0) - (a.student_count || 0))
        .slice(0, limit);

      return { success: true, courses };
    } catch (error) {
      console.error('Error fetching top courses by category:', error);
      return { success: false, error: 'Network error.' };
    }
  }

  async getFeaturedCourses(limit: number = 5): Promise<{ success: boolean; courses?: ExploreCourse[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/courses?select=id,name,slug,short_description,detailed_description,price_inr,original_price_inr,duration_months,student_count,rating,review_count,is_active,is_coming_soon,what_you_learn,course_includes,instructor_name,instructor_bio,instructor_avatar_url,category,course_thumbnails(storage_url)&is_active=eq.true&order=student_count.desc.nullslast&limit=${limit}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch featured courses' };
      }

      const courses = data.map((c: any) => ({ ...c, thumbnail_url: extractThumbnailUrl(c.course_thumbnails) }));
      return { success: true, courses };
    } catch (error) {
      console.error('Error fetching featured courses:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getNewestCourses(limit: number = 5): Promise<{ success: boolean; courses?: ExploreCourse[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/courses?select=id,name,slug,short_description,detailed_description,price_inr,original_price_inr,duration_months,student_count,rating,review_count,is_active,is_coming_soon,what_you_learn,course_includes,instructor_name,instructor_bio,instructor_avatar_url,category,created_at,course_thumbnails(storage_url)&is_active=eq.true&order=created_at.desc.nullslast&limit=${limit}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch newest courses' };
      }

      const courses = data.map((c: any) => ({ ...c, thumbnail_url: extractThumbnailUrl(c.course_thumbnails) }));
      return { success: true, courses };
    } catch (error) {
      console.error('Error fetching newest courses:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getBestCourses(limit: number = 5): Promise<{ success: boolean; courses?: ExploreCourse[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/courses?select=id,name,slug,short_description,detailed_description,price_inr,original_price_inr,duration_months,student_count,rating,review_count,is_active,is_coming_soon,what_you_learn,course_includes,instructor_name,instructor_bio,instructor_avatar_url,category,course_thumbnails(storage_url)&is_active=eq.true&rating=not.is.null&order=rating.desc.nullslast,review_count.desc.nullslast&limit=${limit}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch best courses' };
      }

      const courses = data.map((c: any) => ({ ...c, thumbnail_url: extractThumbnailUrl(c.course_thumbnails) }));
      return { success: true, courses };
    } catch (error) {
      console.error('Error fetching best courses:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  getAllDescendantCategoryIds(categories: Category[], categoryId: string): string[] {
    const allIds: string[] = [categoryId];
    
    const collectDescendants = (parentId: string) => {
      const children = categories.filter(c => c.parent_id === parentId);
      children.forEach(child => {
        allIds.push(child.id);
        collectDescendants(child.id);
      });
    };
    
    collectDescendants(categoryId);
    return allIds;
  }

  async getCourseDetails(courseId: string): Promise<{ success: boolean; course?: ExploreCourse; error?: string }> {
    try {
      const courseResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/courses?select=id,name,slug,short_description,detailed_description,price_inr,original_price_inr,duration_months,student_count,rating,review_count,is_active,is_coming_soon,what_you_learn,course_includes,instructor_name,instructor_bio,instructor_avatar_url,category,course_thumbnails(storage_url)&id=eq.${courseId}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const courseData = await courseResponse.json();
      if (!courseResponse.ok || courseData.length === 0) {
        return { success: false, error: 'Course not found' };
      }

      const rawCourse = courseData[0];
      const course = { ...rawCourse, thumbnail_url: extractThumbnailUrl(rawCourse.course_thumbnails) } as ExploreCourse;

      const [categoriesRes, subjectsRes, faqsRes] = await Promise.all([
        fetch(
          `${SUPABASE_URL}/rest/v1/course_categories?select=categories:category_id(id,name,slug)&course_id=eq.${courseId}`,
          { method: 'GET', headers: this.headers }
        ),
        fetch(
          `${SUPABASE_URL}/rest/v1/course_subjects?select=display_order,popular_subjects:subject_id(id,name,slug,description,thumbnail_url)&course_id=eq.${courseId}&order=display_order.asc`,
          { method: 'GET', headers: this.headers }
        ),
        fetch(
          `${SUPABASE_URL}/rest/v1/course_faqs?select=id,question,answer,display_order&course_id=eq.${courseId}&order=display_order.asc`,
          { method: 'GET', headers: this.headers }
        )
      ]);

      const [categoriesData, subjectsData, faqsData] = await Promise.all([
        categoriesRes.json(),
        subjectsRes.json(),
        faqsRes.json()
      ]);

      if (categoriesRes.ok && Array.isArray(categoriesData)) {
        course.categories = categoriesData
          .filter((c: any) => c.categories)
          .map((c: any) => c.categories);
      }

      if (subjectsRes.ok && Array.isArray(subjectsData)) {
        course.subjects = subjectsData
          .filter((s: any) => s.popular_subjects)
          .map((s: any) => s.popular_subjects);
      }

      if (faqsRes.ok && Array.isArray(faqsData)) {
        course.faqs = faqsData;
      }

      return { success: true, course };
    } catch (error) {
      console.error('Error fetching course details:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Dashboard API Methods
  async getDashboardEnrollments(userId: string): Promise<{ success: boolean; enrollments?: DashboardEnrollment[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/enrollments?select=id,course_id,batch_id,enrolled_at,courses:course_id(id,name,course_thumbnails(storage_url)),batches:batch_id(id,name,start_date,end_date)&student_id=eq.${userId}&is_active=eq.true`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch enrollments' };
      }

      const enrollments = data.map((e: any) => ({
        ...e,
        courses: e.courses ? { ...e.courses, thumbnail_url: extractThumbnailUrl(e.courses.course_thumbnails) } : e.courses,
      }));
      return { success: true, enrollments };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDashboardSubjects(courseId: string): Promise<{ success: boolean; subjects?: DashboardSubject[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_subjects?select=subject_id,display_order,popular_subjects:subject_id(id,name,description,thumbnail_url)&course_id=eq.${courseId}&order=display_order.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch subjects' };
      }

      return { success: true, subjects: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDPTSubmissions(userId: string, fromDate?: string): Promise<{ success: boolean; submissions?: DPTSubmission[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Fetch from dpp_topic_submissions table (Daily Practice Problems)
      let url = `${SUPABASE_URL}/rest/v1/dpp_topic_submissions?select=id,student_id,topic_id,test_date,score,total_questions,time_taken_seconds,created_at&student_id=eq.${userId}&order=test_date.desc`;
      if (fromDate) {
        url += `&test_date=gte.${fromDate}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch DPT submissions' };
      }

      // Map dpp_topic_submissions fields to DPTSubmission format
      const submissions: DPTSubmission[] = data.map((item: any) => ({
        id: item.id,
        student_id: item.student_id,
        topic_id: item.topic_id,
        test_date: item.test_date,
        score: item.score || 0,
        total_questions: item.total_questions || 0,
        correct_answers: item.score || 0, // In dpp_topic_submissions, score is the correct count
        time_taken_seconds: item.time_taken_seconds || 0,
        submitted_at: item.created_at, // Map created_at to submitted_at for consistency
      }));

      return { success: true, submissions };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDashboardAttendancePercentage(userId: string, courseIds: string[]): Promise<{ success: boolean; percentage?: number; present?: number; total?: number; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, percentage: 0, present: 0, total: 0 };
      }

      const idsString = courseIds.join(',');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();

      const [scheduledRes, attendanceRes] = await Promise.all([
        fetch(
          `${SUPABASE_URL}/rest/v1/scheduled_classes?select=id,scheduled_at&course_id=in.(${idsString})&scheduled_at=gte.${thirtyDaysAgo.toISOString()}&scheduled_at=lte.${now.toISOString()}&is_cancelled=eq.false`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        ),
        fetch(
          `${SUPABASE_URL}/rest/v1/class_attendance?select=scheduled_class_id,status&student_id=eq.${userId}`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        )
      ]);

      if (!scheduledRes.ok || !attendanceRes.ok) {
        return { success: false, error: 'Failed to fetch attendance data' };
      }

      const scheduledClasses = await scheduledRes.json();
      const attendanceRecords = await attendanceRes.json();
      
      const classIds = new Set(scheduledClasses.map((c: any) => c.id));
      const presentCount = attendanceRecords.filter(
        (a: any) => classIds.has(a.scheduled_class_id) && a.status === 'present'
      ).length;
      
      const total = scheduledClasses.length;
      const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;

      return { success: true, percentage, present: presentCount, total };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDashboardSubjectsWithProgress(userId: string, courseIds: string[]): Promise<{ 
    success: boolean; 
    subjects?: Array<{
      subject_id: string;
      course_id: string;
      name: string;
      description: string | null;
      thumbnail_url: string | null;
      chaptersTotal: number;
      chaptersCompleted: number;
      pendingAssignments: number;
    }>; 
    error?: string 
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, subjects: [] };
      }

      const idsString = courseIds.join(',');

      const courseSubjectsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/course_subjects?select=course_id,subject_id,display_order,popular_subjects:subject_id(id,name,description,thumbnail_url)&course_id=in.(${idsString})&order=display_order`,
        { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!courseSubjectsRes.ok) {
        return { success: false, error: 'Failed to fetch course subjects' };
      }

      const courseSubjects = await courseSubjectsRes.json();
      const subjectIds = courseSubjects.map((cs: any) => cs.subject_id);

      if (subjectIds.length === 0) {
        return { success: true, subjects: [] };
      }

      const subjectIdsString = subjectIds.join(',');

      const [chaptersRes, assignmentsRes] = await Promise.all([
        fetch(
          `${SUPABASE_URL}/rest/v1/subject_chapters?select=id,subject_id&subject_id=in.(${subjectIdsString})`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        ),
        fetch(
          `${SUPABASE_URL}/rest/v1/assignments?select=id,chapter_id,course_id&course_id=in.(${idsString})&is_active=eq.true`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        )
      ]);

      if (!chaptersRes.ok) {
        return { success: false, error: 'Failed to fetch chapters' };
      }

      const chapters = await chaptersRes.json();
      const chapterIds = chapters.map((c: any) => c.id);

      let completedChapterIds: string[] = [];
      let submittedAssignmentIds: string[] = [];

      if (chapterIds.length > 0) {
        const chapterIdsString = chapterIds.join(',');
        const progressRes = await fetch(
          `${SUPABASE_URL}/rest/v1/student_progress?select=chapter_id&student_id=eq.${userId}&is_completed=eq.true&chapter_id=in.(${chapterIdsString})`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        );
        if (progressRes.ok) {
          const progress = await progressRes.json();
          completedChapterIds = progress.map((p: any) => p.chapter_id);
        }
      }

      const assignments = assignmentsRes.ok ? await assignmentsRes.json() : [];
      const assignmentIds = assignments.map((a: any) => a.id);

      if (assignmentIds.length > 0) {
        const assignmentIdsString = assignmentIds.join(',');
        const submissionsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/assignment_submissions?select=assignment_id&student_id=eq.${userId}&assignment_id=in.(${assignmentIdsString})`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        );
        if (submissionsRes.ok) {
          const submissions = await submissionsRes.json();
          submittedAssignmentIds = submissions.map((s: any) => s.assignment_id);
        }
      }

      const subjectChapterMap: { [key: string]: string[] } = {};
      chapters.forEach((c: any) => {
        if (!subjectChapterMap[c.subject_id]) {
          subjectChapterMap[c.subject_id] = [];
        }
        subjectChapterMap[c.subject_id].push(c.id);
      });

      const subjects = courseSubjects.map((cs: any) => {
        const subjectChapters = subjectChapterMap[cs.subject_id] || [];
        const completedCount = subjectChapters.filter(id => completedChapterIds.includes(id)).length;
        
        const subjectAssignments = assignments.filter((a: any) => {
          const chapterInSubject = subjectChapterMap[cs.subject_id]?.includes(a.chapter_id);
          return chapterInSubject;
        });
        const pendingCount = subjectAssignments.filter((a: any) => !submittedAssignmentIds.includes(a.id)).length;

        return {
          subject_id: cs.subject_id,
          course_id: cs.course_id,
          name: cs.popular_subjects?.name || 'Unknown Subject',
          description: cs.popular_subjects?.description || null,
          thumbnail_url: cs.popular_subjects?.thumbnail_url || null,
          chaptersTotal: subjectChapters.length,
          chaptersCompleted: completedCount,
          pendingAssignments: pendingCount,
        };
      });

      return { success: true, subjects };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDashboardInstructors(courseIds: string[]): Promise<{ 
    success: boolean; 
    instructors?: Array<{
      id: string;
      full_name: string;
      avatar_url: string | null;
      email: string | null;
      specialization: string | null;
      subjects: string[];
    }>; 
    error?: string 
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, instructors: [] };
      }

      const idsString = courseIds.join(',');

      const courseSubjectsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/course_subjects?select=subject_id&course_id=in.(${idsString})`,
        { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!courseSubjectsRes.ok) {
        return { success: false, error: 'Failed to fetch course subjects' };
      }

      const courseSubjects = await courseSubjectsRes.json();
      const subjectIds = Array.from(new Set(courseSubjects.map((cs: any) => cs.subject_id)));

      if (subjectIds.length === 0) {
        return { success: true, instructors: [] };
      }

      const subjectIdsString = subjectIds.join(',');

      const instructorSubjectsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/instructor_subjects?select=instructor_id,subject_id,popular_subjects!inner(name)&subject_id=in.(${subjectIdsString})`,
        { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!instructorSubjectsRes.ok) {
        return { success: false, error: 'Failed to fetch instructor subjects' };
      }

      const instructorSubjects = await instructorSubjectsRes.json();
      const instructorIds = Array.from(new Set(instructorSubjects.map((is: any) => is.instructor_id)));

      if (instructorIds.length === 0) {
        return { success: true, instructors: [] };
      }

      const instructorIdsString = instructorIds.join(',');

      const teachersRes = await fetch(
        `${SUPABASE_URL}/rest/v1/teacher_profiles?select=*&id=in.(${instructorIdsString})`,
        { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!teachersRes.ok) {
        return { success: false, error: 'Failed to fetch teacher profiles' };
      }

      const teachers = await teachersRes.json();

      const instructorSubjectMap: { [key: string]: string[] } = {};
      instructorSubjects.forEach((is: any) => {
        if (!instructorSubjectMap[is.instructor_id]) {
          instructorSubjectMap[is.instructor_id] = [];
        }
        const subjectName = is.popular_subjects?.name;
        if (subjectName && !instructorSubjectMap[is.instructor_id].includes(subjectName)) {
          instructorSubjectMap[is.instructor_id].push(subjectName);
        }
      });

      const instructors = teachers.map((t: any) => ({
        id: t.id,
        full_name: t.full_name || 'Instructor',
        avatar_url: t.avatar_url,
        email: t.email,
        specialization: t.specialization,
        subjects: instructorSubjectMap[t.id] || [],
      }));

      return { success: true, instructors };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getCourseTeachers(courseIds: string[]): Promise<{ success: boolean; teachers?: CourseTeacher[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, teachers: [] };
      }

      const idsString = courseIds.join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_teachers?select=teacher_id,subject,course_id&course_id=in.(${idsString})`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch teachers' };
      }

      return { success: true, teachers: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getCourseTimetables(courseIds: string[]): Promise<{ success: boolean; timetables?: CourseTimetable[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, timetables: [] };
      }

      const idsString = courseIds.join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_timetables?select=*,subject:popular_subjects(id,name),instructor:teacher_profiles(id,full_name,avatar_url),course:courses(id,name),batch:batches(id,name),meeting_link&course_id=in.(${idsString})&is_active=eq.true&order=day_of_week.asc,start_time.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch timetables' };
      }

      return { success: true, timetables: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getScheduledClasses(courseIds: string[], startDate?: Date, endDate?: Date): Promise<{ success: boolean; scheduledClasses?: ScheduledClass[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, scheduledClasses: [] };
      }

      const idsString = courseIds.join(',');
      
      // Build URL with optional date filters - simplified query without complex joins
      let url = `${SUPABASE_URL}/rest/v1/scheduled_classes?select=id,course_id,teacher_id,subject,subject_id,chapter_id,topic_id,scheduled_at,duration_minutes,meeting_link,room_number,is_live,is_cancelled,live_started_at,live_ended_at,bbb_meeting_id,courses:courses!course_id(id,name),popular_subjects:popular_subjects!subject_id(id,name),subject_chapters:subject_chapters!chapter_id(id,title,ai_generated_video_url,ai_presentation_json),subject_topics:subject_topics!topic_id(id,title,ai_generated_video_url,ai_presentation_json),teacher_profiles:teacher_profiles!teacher_id(id,full_name,avatar_url)&course_id=in.(${idsString})&is_cancelled=eq.false&order=scheduled_at.asc`;
      
      if (startDate) {
        url += `&scheduled_at=gte.${startDate.toISOString()}`;
      }
      if (endDate) {
        url += `&scheduled_at=lte.${endDate.toISOString()}`;
      }
      
      console.log('[getScheduledClasses] URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('[getScheduledClasses] Response status:', response.status, 'Data:', JSON.stringify(data).slice(0, 500));

      if (!response.ok) {
        console.log('[getScheduledClasses] Error:', data);
        return { success: false, error: data.message || data.error || 'Failed to fetch scheduled classes' };
      }

      return { success: true, scheduledClasses: data };
    } catch (error) {
      console.log('[getScheduledClasses] Exception:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getClassRecordings(courseIds: string[]): Promise<{ success: boolean; recordings?: ClassRecording[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (courseIds.length === 0) {
        return { success: true, recordings: [] };
      }

      const idsString = courseIds.join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/class_recordings?select=*,scheduled_class:scheduled_classes(id,subject,scheduled_at,course_id,course:courses(name))&scheduled_class.course_id=in.(${idsString})&processing_status=eq.ready&order=created_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch recordings' };
      }

      return { success: true, recordings: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getAllRecordings(): Promise<{ success: boolean; recordings?: ClassRecording[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/class_recordings?select=*,scheduled_class:scheduled_classes(id,scheduled_at,subject,course_id,course:courses(id,name),teacher:teacher_profiles(id,full_name)),course:courses!course_id(id,name),subject:popular_subjects!subject_id(id,name),chapter:subject_chapters!chapter_id(id,title,chapter_number),topic:subject_topics!topic_id(id,title,topic_number)&processing_status=in.(ready,uploaded,processing)&order=created_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch recordings' };
      }

      return { success: true, recordings: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getRecordingById(recordingId: string): Promise<{ success: boolean; recording?: ClassRecording; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/class_recordings?id=eq.${recordingId}&select=*,scheduled_class:scheduled_classes(id,scheduled_at,subject:popular_subjects(id,name),course:courses(id,name),teacher:teacher_profiles(id,full_name)),course:courses!course_id(id,name),subject:popular_subjects!subject_id(id,name),chapter:subject_chapters!chapter_id(id,title,chapter_number),topic:subject_topics!topic_id(id,title,topic_number)`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch recording' };
      }

      return { success: true, recording: data[0] };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getPlaybackUrl(recordingId: string, quality: string = '720p'): Promise<{ success: boolean; playback?: PlaybackUrlResponse; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/streaming-api`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: 'get-playback-url',
            recording_id: recordingId,
            quality: quality,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to get playback URL' };
      }

      return { success: true, playback: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getWatchProgress(recordingId: string, userId: string): Promise<{ success: boolean; progress?: VideoWatchProgress; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/video_watch_progress?recording_id=eq.${recordingId}&user_id=eq.${userId}&select=*`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch watch progress' };
      }

      return { success: true, progress: data[0] };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async saveWatchProgress(
    recordingId: string,
    userId: string,
    progressSeconds: number,
    progressPercent: number,
    completed: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/video_watch_progress`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            recording_id: recordingId,
            user_id: userId,
            progress_seconds: progressSeconds,
            progress_percent: progressPercent,
            completed: completed,
            last_watched_at: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to save watch progress' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getClassAttendance(studentId: string): Promise<{ success: boolean; attendance?: ClassAttendance[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/class_attendance?select=id,status,duration_seconds,scheduled_class:scheduled_classes(id,course_id,scheduled_at,courses(id,name))&student_id=eq.${studentId}`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch attendance' };
      }

      return { success: true, attendance: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getStoredUser(): Promise<User | null> {
    try {
      const userData = await AsyncStorage.getItem(USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  }

  // Progress APIs for DetailedProgressScreen
  async getStudentProgress(studentId: string): Promise<{ success: boolean; progress?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/student_progress?select=*,chapter:chapters(id,title,subject),topic:topics(id,title)&student_id=eq.${studentId}`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch progress' };
      }
      return { success: true, progress: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getTestSubmissions(studentId: string): Promise<{ success: boolean; tests?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/test_submissions?select=*&student_id=eq.${studentId}&order=submitted_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch tests' };
      }
      return { success: true, tests: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getQuizAttempts(studentId: string): Promise<{ success: boolean; quizzes?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_attempts?select=*&student_id=eq.${studentId}&order=completed_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch quizzes' };
      }
      return { success: true, quizzes: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getChaptersWithTopics(): Promise<{ success: boolean; chapters?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/chapters?select=*,topics(*)&order=chapter_number.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch chapters' };
      }
      return { success: true, chapters: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // ========== New Progress Tracking APIs ==========

  async getStudentProgressWithDetails(studentId: string): Promise<{ success: boolean; progress?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/student_progress?student_id=eq.${studentId}&select=*,topic:subject_topics(id,title),chapter:subject_chapters(id,title,subject:popular_subjects(id,name))`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch student progress' };
      }
      const data = await response.json();
      return { success: true, progress: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getClassAttendanceWithDetails(studentId: string): Promise<{ success: boolean; attendance?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/class_attendance?student_id=eq.${studentId}&select=*,scheduled_class:scheduled_classes(id,scheduled_at,subject,course_id)`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch attendance' };
      }
      const data = await response.json();
      return { success: true, attendance: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDoubtLogs(studentId: string): Promise<{ success: boolean; doubts?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/doubt_logs?student_id=eq.${studentId}&select=*,topic:subject_topics(id,title)&order=created_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch doubt logs' };
      }
      const data = await response.json();
      return { success: true, doubts: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getAIVideoLogs(studentId: string): Promise<{ success: boolean; logs?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_watch_logs?student_id=eq.${studentId}&select=*,subject:popular_subjects(name),chapter:subject_chapters(title),topic:subject_topics(title)&order=created_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch AI video logs' };
      }
      const data = await response.json();
      return { success: true, logs: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getPodcastLogs(studentId: string): Promise<{ success: boolean; logs?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/podcast_listen_logs?student_id=eq.${studentId}&select=*,subject:popular_subjects(name),chapter:subject_chapters(title),topic:subject_topics(title)&order=created_at.desc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch podcast logs' };
      }
      const data = await response.json();
      return { success: true, logs: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDailyActivityLogs(studentId: string, limit: number = 30): Promise<{ success: boolean; logs?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/daily_activity_logs?student_id=eq.${studentId}&select=*&order=activity_date.asc&limit=${limit}`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch activity logs' };
      }
      const data = await response.json();
      return { success: true, logs: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getCourseSubjectsWithDetails(courseIds: string[]): Promise<{ success: boolean; subjects?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const courseIdsStr = courseIds.join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/course_subjects?course_id=in.(${courseIdsStr})&select=course_id,subject_id,display_order,popular_subjects:subject_id(id,name,description,thumbnail_url)&order=display_order.asc`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch course subjects' };
      }
      const data = await response.json();
      return { success: true, subjects: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getAssignmentSubmissions(studentId: string): Promise<{ success: boolean; submissions?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/assignment_submissions?student_id=eq.${studentId}&select=*,assignment:assignments(id,title,course_id)`,
        {
          method: 'GET',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.message || 'Failed to fetch assignment submissions' };
      }
      const data = await response.json();
      return { success: true, submissions: data };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getProgressStats(studentId: string): Promise<{ success: boolean; stats?: any; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Get multiple data points for stats
      const [progressRes, testsRes, quizzesRes, attendanceRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/student_progress?select=id,is_completed,score&student_id=eq.${studentId}`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/test_submissions?select=id,score,total_marks&student_id=eq.${studentId}`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts?select=id,score,total_questions,percentage&student_id=eq.${studentId}`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/class_attendance?select=id,status&student_id=eq.${studentId}`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      // Check all responses are OK
      if (!progressRes.ok || !testsRes.ok || !quizzesRes.ok || !attendanceRes.ok) {
        return { success: false, error: 'Failed to fetch one or more data sources' };
      }

      const [progress, tests, quizzes, attendance] = await Promise.all([
        progressRes.json(),
        testsRes.json(),
        quizzesRes.json(),
        attendanceRes.json()
      ]);

      // Calculate stats with proper null checks
      const completedTopics = Array.isArray(progress) ? progress.filter((p: any) => p.is_completed).length : 0;
      const totalTopics = Array.isArray(progress) && progress.length > 0 ? progress.length : 0;
      const avgProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

      const totalTests = Array.isArray(tests) ? tests.length : 0;
      const avgTestScore = totalTests > 0 
        ? Math.round(tests.reduce((sum: number, t: any) => sum + ((t.score || 0) / (t.total_marks || 1) * 100), 0) / totalTests)
        : 0;

      const totalQuizzes = Array.isArray(quizzes) ? quizzes.length : 0;
      const avgQuizScore = totalQuizzes > 0
        ? Math.round(quizzes.reduce((sum: number, q: any) => sum + (q.percentage || 0), 0) / totalQuizzes)
        : 0;

      const attendedClasses = Array.isArray(attendance) ? attendance.filter((a: any) => a.status === 'present').length : 0;
      const totalClasses = Array.isArray(attendance) ? attendance.length : 0;
      const attendanceRate = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;

      // Calculate activity score only if we have data
      const hasData = totalTopics > 0 || totalTests > 0 || totalClasses > 0;
      const activityScore = hasData 
        ? Math.round((avgProgress + avgTestScore + attendanceRate) / 3) 
        : 0;

      return {
        success: true,
        stats: {
          completedTopics,
          totalTopics,
          avgProgress,
          totalTests,
          avgTestScore,
          totalQuizzes,
          avgQuizScore,
          attendedClasses,
          totalClasses,
          attendanceRate,
          activityScore
        }
      };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getPaperQuestions(paperId: string, limit?: number): Promise<{ success: boolean; questions?: PreviousYearQuestion[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      let url = `${SUPABASE_URL}/rest/v1/previous_year_questions?paper_id=eq.${paperId}&order=question_number.asc&select=*`;
      if (limit) {
        url += `&limit=${limit}`;
      }

      const response = await fetch(url, {
        headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch questions' };
      }

      const questions = await response.json();
      return { success: true, questions };
    } catch (error) {
      console.error('Error fetching paper questions:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async submitPreviousYearAttempt(attempt: Omit<PreviousYearAttempt, 'id' | 'user_id'>): Promise<{ success: boolean; attempt?: PreviousYearAttempt; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const storedUser = await this.getStoredUser();
      if (!storedUser) {
        return { success: false, error: 'User not found' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/previous_year_attempts`,
        {
          method: 'POST',
          headers: { 
            ...this.headers, 
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            ...attempt,
            user_id: storedUser.id
          })
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to submit attempt' };
      }

      const [savedAttempt] = await response.json();
      return { success: true, attempt: savedAttempt };
    } catch (error) {
      console.error('Error submitting attempt:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Comprehensive student data interface matching website's useCurrentStudent hook
  async getCurrentStudentData(): Promise<{ success: boolean; student?: StudentData; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const storedUser = await this.getStoredUser();
      if (!storedUser) {
        return { success: false, error: 'User not found' };
      }

      const userId = storedUser.id;

      // Fetch all data in parallel for maximum speed (matching website's useCurrentStudent)
      const [
        profileRes,
        enrollmentsRes,
        studentProgressRes,
        attendanceRes,
        doubtLogsRes,
        dptSubmissionsRes,
        assignmentSubmissionsRes,
        videoLogsRes,
        podcastLogsRes,
        activityLogsRes
      ] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/enrollments?student_id=eq.${userId}&is_active=eq.true&select=id,enrolled_at,is_active,course_id,batch_id,courses(id,name,description,course_subjects(subject_id,popular_subjects(id,name))),batches(id,name)`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/student_progress?student_id=eq.${userId}&select=*`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/class_attendance?student_id=eq.${userId}&order=marked_at.desc&limit=50&select=id,status,marked_at,scheduled_class_id,duration_seconds,scheduled_classes(id,subject,course_id,teacher_id,scheduled_at,duration_minutes)`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/doubt_logs?student_id=eq.${userId}&order=created_at.desc&limit=50&select=id,question,answer,created_at,response_time_ms,topic_id,topics(id,name,chapter_id,chapters(id,subject_id,popular_subjects(id,name)))`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/dpt_submissions?student_id=eq.${userId}&order=submitted_at.desc&select=*`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/assignment_submissions?student_id=eq.${userId}&order=submitted_at.desc&select=*`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/ai_video_watch_logs?student_id=eq.${userId}&order=created_at.desc&limit=20&select=id,video_title,duration_seconds,watched_seconds,completion_percentage,created_at,popular_subjects(id,name)`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/podcast_listen_logs?student_id=eq.${userId}&order=created_at.desc&limit=20&select=id,podcast_title,duration_seconds,listened_seconds,created_at,popular_subjects(id,name)`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/daily_activity_logs?student_id=eq.${userId}&order=activity_date.desc&limit=30&select=*`, {
          headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      // Parse all responses
      const profile = profileRes.ok ? (await profileRes.json())?.[0] : null;
      const enrollments = enrollmentsRes.ok ? await enrollmentsRes.json() : [];
      const studentProgress = studentProgressRes.ok ? await studentProgressRes.json() : [];
      const attendance = attendanceRes.ok ? await attendanceRes.json() : [];
      const doubtLogs = doubtLogsRes.ok ? await doubtLogsRes.json() : [];
      const dptSubmissions = dptSubmissionsRes.ok ? await dptSubmissionsRes.json() : [];
      const assignmentSubmissions = assignmentSubmissionsRes.ok ? await assignmentSubmissionsRes.json() : [];
      const videoLogs = videoLogsRes.ok ? await videoLogsRes.json() : [];
      const podcastLogs = podcastLogsRes.ok ? await podcastLogsRes.json() : [];
      const activityLogs = activityLogsRes.ok ? await activityLogsRes.json() : [];

      // Fetch timetable if we have batch IDs (Supabase UUID filters require quoted values)
      const batchIds = (enrollments || []).map((e: any) => e.batch_id).filter((id: string | null) => id && id.length > 0);
      let timetableData: any[] = [];
      if (batchIds.length > 0) {
        // Supabase in.() filter for UUIDs requires quoted values: in.("uuid1","uuid2")
        const batchIdsParam = batchIds.map((id: string) => `"${id}"`).join(',');
        const timetableRes = await fetch(
          `${SUPABASE_URL}/rest/v1/instructor_timetables?batch_id=in.(${batchIdsParam})&is_active=eq.true&select=id,day_of_week,start_time,end_time,is_active,popular_subjects(id,name),subject_chapters(id,title),teacher_profiles(id,full_name)`,
          { headers: { ...this.headers, 'Authorization': `Bearer ${accessToken}` } }
        );
        if (timetableRes.ok) {
          timetableData = await timetableRes.json();
        }
      }

      // Process enrollments into courses (properly link progress to course_id)
      const courseIdSet = new Set((enrollments || []).map((e: any) => e.course_id).filter(Boolean));
      const courses = (enrollments || []).map((enrollment: any) => {
        const course = Array.isArray(enrollment.courses) ? enrollment.courses[0] : enrollment.courses;
        if (!course) return null;

        const subjects = (course.course_subjects || []).map((cs: any) => {
          const ps = Array.isArray(cs.popular_subjects) ? cs.popular_subjects[0] : cs.popular_subjects;
          return ps?.name;
        }).filter(Boolean);

        // Calculate progress from student_progress filtered by course_id
        const courseProgress = (studentProgress || []).filter((p: any) => p.course_id === enrollment.course_id);
        const completedCount = courseProgress.filter((p: any) => p.is_completed).length;
        const totalCount = courseProgress.length;
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        return {
          id: course.id,
          name: course.name,
          subjects,
          progress,
          enrolled_at: enrollment.enrolled_at
        };
      }).filter(Boolean);

      // Calculate overall stats
      const total_progress = courses.length > 0
        ? Math.round(courses.reduce((sum: number, c: any) => sum + c.progress, 0) / courses.length)
        : 0;

      // Process test data (matching website calculation logic)
      // DPT submissions: prefer correct_answers/total_questions, fallback to score/total_marks
      const dptScores = (dptSubmissions || []).map((t: any) => {
        if (t.total_questions > 0 && t.correct_answers !== undefined && t.correct_answers !== null) {
          return Math.round((t.correct_answers / t.total_questions) * 100);
        }
        if (t.total_marks > 0 && t.score !== undefined && t.score !== null) {
          return Math.round((t.score / t.total_marks) * 100);
        }
        return t.percentage || 0;
      });
      
      // Assignment submissions: use percentage or calculate from score/total_marks
      const assignmentScores = (assignmentSubmissions || []).map((t: any) => {
        if (t.percentage !== undefined && t.percentage !== null) {
          return t.percentage;
        }
        if (t.total_marks > 0 && t.score !== undefined && t.score !== null) {
          return Math.round((t.score / t.total_marks) * 100);
        }
        return 0;
      });
      
      const allScores = [...dptScores, ...assignmentScores].filter((s: number) => s > 0);
      const tests_taken = (dptSubmissions || []).length + (assignmentSubmissions || []).length;
      const avg_test_score = allScores.length > 0
        ? Math.round(allScores.reduce((sum: number, score: number) => sum + score, 0) / allScores.length)
        : 0;

      // Process attendance data
      const attendanceRecords = attendance || [];
      const attended = attendanceRecords.filter((a: any) => a.status === 'present').length;
      const total_scheduled = attendanceRecords.length;
      const attendance_percentage = total_scheduled > 0
        ? Math.round((attended / total_scheduled) * 100)
        : 0;

      // Process recent classes
      const recent_classes = attendanceRecords.slice(0, 5).map((a: any) => {
        const scheduledClass = a.scheduled_classes;
        return {
          id: a.id,
          subject: scheduledClass?.subject || 'Class Session',
          topic: scheduledClass?.subject || 'Session',
          date: a.marked_at,
          attended: a.status === 'present',
          duration_minutes: scheduledClass?.duration_minutes || Math.round((a.duration_seconds || 3600) / 60)
        };
      });

      // Process doubt logs with subject info
      const ai_queries = (doubtLogs || []).length;
      const doubtsBySubject: Record<string, number> = {};
      const recent_doubts = (doubtLogs || []).slice(0, 5).map((d: any) => {
        const topic = d.topics;
        const chapter = topic?.chapters;
        const subject = chapter?.popular_subjects;
        const subjectName = (Array.isArray(subject) ? subject[0]?.name : subject?.name) || 'General';
        doubtsBySubject[subjectName] = (doubtsBySubject[subjectName] || 0) + 1;

        return {
          question: d.question?.substring(0, 100) || 'Question',
          subject: subjectName,
          status: d.answer ? 'resolved' : 'pending',
          date: d.created_at
        };
      });

      // Process AI video usage
      const totalVideos = (videoLogs || []).length;
      const completedVideos = (videoLogs || []).filter((v: any) => v.completion_percentage >= 80).length;
      const totalWatchTimeMinutes = Math.round((videoLogs || []).reduce((sum: number, v: any) => sum + (v.watched_seconds || 0), 0) / 60);
      const avgCompletionRate = totalVideos > 0
        ? Math.round((videoLogs || []).reduce((sum: number, v: any) => sum + (v.completion_percentage || 0), 0) / totalVideos)
        : 0;

      const recent_videos = (videoLogs || []).slice(0, 5).map((v: any) => ({
        title: v.video_title,
        subject: (Array.isArray(v.popular_subjects) ? v.popular_subjects[0]?.name : v.popular_subjects?.name) || 'General',
        duration: Math.round((v.duration_seconds || 0) / 60),
        watched_percentage: v.completion_percentage || 0,
        date: v.created_at
      }));

      // Process podcast usage
      const totalPodcasts = (podcastLogs || []).length;
      const totalPodcastTimeMinutes = Math.round((podcastLogs || []).reduce((sum: number, p: any) => sum + (p.listened_seconds || 0), 0) / 60);

      const podcastTopics: Record<string, number> = {};
      (podcastLogs || []).forEach((p: any) => {
        const subjectName = (Array.isArray(p.popular_subjects) ? p.popular_subjects[0]?.name : p.popular_subjects?.name) || 'General';
        podcastTopics[subjectName] = (podcastTopics[subjectName] || 0) + 1;
      });
      const favorite_topics = Object.entries(podcastTopics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);

      const recent_podcasts = (podcastLogs || []).slice(0, 5).map((p: any) => ({
        title: p.podcast_title,
        subject: (Array.isArray(p.popular_subjects) ? p.popular_subjects[0]?.name : p.popular_subjects?.name) || 'General',
        duration: Math.round((p.duration_seconds || 0) / 60),
        date: p.created_at
      }));

      // Process timetable
      const timetable = (timetableData || []).map((t: any) => {
        const subjectData = Array.isArray(t.popular_subjects) ? t.popular_subjects[0] : t.popular_subjects;
        const chapterData = Array.isArray(t.subject_chapters) ? t.subject_chapters[0] : t.subject_chapters;
        const instructorData = Array.isArray(t.teacher_profiles) ? t.teacher_profiles[0] : t.teacher_profiles;

        return {
          day: t.day_of_week,
          subject: subjectData?.name || 'Subject',
          topic: chapterData?.title || 'Topic',
          start_time: t.start_time,
          end_time: t.end_time,
          instructor: instructorData?.full_name || 'Instructor',
          type: 'live_class'
        };
      });

      // Process activity trends
      const activity_trends = (activityLogs || []).map((log: any) => ({
        date: log.activity_date,
        score: log.activity_score || 0,
        live_class_minutes: log.live_class_minutes || 0,
        video_watch_minutes: log.video_watch_minutes || 0,
        podcast_listen_minutes: log.podcast_listen_minutes || 0,
        mcq_attempts: log.mcq_attempts || 0,
        doubts_asked: log.doubts_asked || 0
      })).reverse();

      // Calculate activity breakdown
      const videoEngagement = totalVideos > 0 ? Math.min(100, avgCompletionRate) : 0;
      const podcastEngagement = totalPodcasts > 0 ? Math.min(100, Math.round((totalPodcastTimeMinutes / (totalPodcasts * 30)) * 100)) : 0;
      const mcqEngagement = (dptSubmissions?.length || 0) > 0 ? Math.min(100, avg_test_score) : 0;
      const doubtEngagement = ai_queries > 0 ? 100 : 0;

      // Calculate activity score (matching website formula)
      const activity_score = Math.round((videoEngagement + podcastEngagement + mcqEngagement + doubtEngagement + attendance_percentage) / 5);

      // Calculate areas of improvement based on course progress and doubt patterns
      const areas_of_improvement: string[] = [];
      
      // Get subjects with low progress from courses
      courses.forEach((course: any) => {
        if (course.progress < 50 && course.subjects && Array.isArray(course.subjects)) {
          course.subjects.forEach((subjectName: string) => {
            if (subjectName && !areas_of_improvement.includes(subjectName)) {
              areas_of_improvement.push(subjectName);
            }
          });
        }
      });
      
      // Also check subjects from doubt logs with many questions (indicates struggling)
      const subjectDoubtCounts: Record<string, number> = {};
      (doubtLogs || []).forEach((d: any) => {
        // Navigate the nested structure: topics -> chapters -> popular_subjects
        const topic = d.topics;
        const chapter = topic?.chapters;
        const subject = chapter?.popular_subjects;
        const subjectName = Array.isArray(subject) ? subject[0]?.name : subject?.name;
        if (subjectName) {
          subjectDoubtCounts[subjectName] = (subjectDoubtCounts[subjectName] || 0) + 1;
        }
      });
      
      // Add subjects with 5+ doubts asked (indicates struggling)
      Object.entries(subjectDoubtCounts).forEach(([subject, count]) => {
        if (count >= 5 && !areas_of_improvement.includes(subject)) {
          areas_of_improvement.push(subject);
        }
      });
      
      // Limit to top 5 areas
      const limitedAreas = areas_of_improvement.slice(0, 5);

      // Build the student data object matching website's StudentData interface
      const studentData: StudentData = {
        id: userId,
        full_name: profile?.full_name || storedUser.full_name || 'Student',
        email: profile?.email || storedUser.email || '',
        phone: profile?.phone_number || storedUser.phone || '',
        avatar_url: profile?.avatar_url || null,
        enrollment_date: enrollments?.[0]?.enrolled_at || new Date().toISOString(),
        last_active: new Date().toISOString(),
        status: 'active' as const,
        courses,
        total_progress,
        tests_taken,
        avg_test_score,
        ai_queries,
        areas_of_improvement: limitedAreas,
        followups_pending: 0,
        at_risk: false,
        live_classes: {
          total_scheduled,
          attended,
          attendance_percentage,
          missed: total_scheduled - attended,
          upcoming: 0,
          recent_classes
        },
        ai_video_usage: {
          total_videos: totalVideos,
          watched_count: completedVideos,
          total_watch_time_minutes: totalWatchTimeMinutes,
          completion_rate: avgCompletionRate,
          recent_videos
        },
        podcast_usage: {
          total_listened: totalPodcasts,
          total_time_minutes: totalPodcastTimeMinutes,
          favorite_topics,
          recent_podcasts
        },
        mcq_practice: {
          total_attempted: dptSubmissions?.length || 0,
          total_correct: dptSubmissions?.reduce((sum: number, d: any) => sum + (d.correct_answers || 0), 0) || 0,
          accuracy_percentage: avg_test_score,
          by_subject: {},
          recent_sessions: (dptSubmissions || []).slice(0, 5).map((d: any) => ({
            subject: 'General',
            questions: d.total_questions || 0,
            correct: d.correct_answers || 0,
            date: d.submitted_at
          }))
        },
        doubt_clearing: {
          total_doubts: ai_queries,
          resolved: (doubtLogs || []).filter((d: any) => d.answer).length,
          pending: (doubtLogs || []).filter((d: any) => !d.answer).length,
          avg_resolution_time_minutes: 5,
          by_subject: doubtsBySubject,
          recent_doubts
        },
        activity_score,
        activity_breakdown: {
          video: videoEngagement,
          podcast: podcastEngagement,
          mcq: mcqEngagement,
          doubts: doubtEngagement,
          attendance: attendance_percentage
        },
        activity_trends,
        timetable,
        notifications: []
      };

      return { success: true, student: studentData };
    } catch (error) {
      console.error('Error fetching student data:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Get previous year papers for a specific TOPIC (topic-level only)
  // Only returns papers where topic_id matches exactly - NOT chapter-level papers
  // topicId is REQUIRED for this function - use getChapterLevelPapers for chapter-level papers
  async getPreviousYearPapers(subjectId: string, topicId?: string): Promise<{ success: boolean; papers?: PreviousYearPaper[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Validate topicId is present for topic-level queries
      if (!topicId) {
        console.warn('[getPreviousYearPapers] No topicId provided - returning empty array. Use getChapterLevelPapers for chapter-level papers.');
        return { success: true, papers: [] };
      }

      // TOPIC-LEVEL: Only fetch papers where topic_id = specific UUID
      const url = `${SUPABASE_URL}/rest/v1/subject_previous_year_papers?select=*&subject_id=eq.${subjectId}&topic_id=eq.${topicId}&order=year.desc`;

      console.log('[getPreviousYearPapers] Fetching TOPIC-LEVEL papers with URL:', url);

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('[getPreviousYearPapers] Response:', response.ok, 'Topic-level papers count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch previous year papers' };
      }
      return { success: true, papers: data };
    } catch (error) {
      console.error('Error fetching previous year papers:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get previous year papers for a specific CHAPTER (chapter-level only)
  // Only returns papers where chapter_id matches AND topic_id IS NULL
  async getChapterLevelPapers(subjectId: string, chapterId: string): Promise<{ success: boolean; papers?: PreviousYearPaper[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // CHAPTER-LEVEL: Only fetch papers where chapter_id matches AND topic_id is NULL
      const url = `${SUPABASE_URL}/rest/v1/subject_previous_year_papers?select=*&subject_id=eq.${subjectId}&chapter_id=eq.${chapterId}&topic_id=is.null&order=year.desc`;

      console.log('[getChapterLevelPapers] Fetching CHAPTER-LEVEL papers with URL:', url);

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('[getChapterLevelPapers] Response:', response.ok, 'Chapter-level papers count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch chapter-level papers' };
      }
      return { success: true, papers: data };
    } catch (error) {
      console.error('Error fetching chapter-level papers:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get questions for a previous year paper
  async getPreviousYearQuestions(paperId: string): Promise<{ success: boolean; questions?: PreviousYearQuestion[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getPreviousYearQuestions] Fetching questions for paper:', paperId);
      
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/questions?select=*&previous_year_paper_id=eq.${paperId}&order=created_at.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getPreviousYearQuestions] Response:', response.ok, 'Questions count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch questions' };
      }
      return { success: true, questions: data };
    } catch (error) {
      console.error('Error fetching previous year questions:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Submit paper test result to paper_test_results table
  async submitPaperTestResult(payload: {
    student_id: string;
    paper_id: string;
    subject_id?: string;
    paper_category?: string;
    score: number;
    total_questions: number;
    percentage: number;
    time_taken_seconds: number;
    answers: Record<string, string>;
    grading_status?: string;
  }): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[submitPaperTestResult] Submitting result for paper:', payload.paper_id);
      
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/paper_test_results`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            ...payload,
            submitted_at: new Date().toISOString(),
            grading_status: payload.grading_status || 'graded',
          }),
        }
      );

      const data = await response.json();
      console.log('[submitPaperTestResult] Response:', response.ok, data);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to submit test result' };
      }
      return { success: true, result: Array.isArray(data) ? data[0] : data };
    } catch (error) {
      console.error('Error submitting paper test result:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get student's paper test results
  async getPaperTestResults(studentId: string): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getPaperTestResults] Fetching results for student:', studentId);
      
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/paper_test_results?select=*,paper:subject_previous_year_papers(exam_name,year,paper_type)&student_id=eq.${studentId}&order=submitted_at.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getPaperTestResults] Response:', response.ok, 'Results count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch test results' };
      }
      return { success: true, results: data };
    } catch (error) {
      console.error('Error fetching paper test results:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get student's test results for a specific chapter from all sources
  // Fetches from: paper_test_results, test_results, dpp_topic_submissions
  async getChapterTestResults(studentId: string, chapterId: string, subjectId?: string): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getChapterTestResults] Fetching results for student:', studentId, 'chapter:', chapterId, 'subject:', subjectId);
      
      // Build test_results query - use subject_id if available (required for DPP detection per documentation)
      // DPP results are stored in test_results with subject_id, not chapter_id
      let testResultsUrl = `${SUPABASE_URL}/rest/v1/test_results?select=*,test:tests(id,title,test_type,duration_minutes,chapter_id)&student_id=eq.${studentId}&order=submitted_at.desc`;
      
      if (subjectId) {
        // Filter by subject_id - this is the correct way per documentation
        testResultsUrl += `&subject_id=eq.${subjectId}`;
      }
      
      // Fetch from two sources in parallel (per documentation, DPP comes from test_results, not dpp_topic_submissions)
      const [paperTestResponse, testResultsResponse] = await Promise.all([
        // 1. paper_test_results - PYQ papers (filtered by chapter)
        fetch(
          `${SUPABASE_URL}/rest/v1/paper_test_results?select=*,paper:subject_previous_year_papers!inner(id,exam_name,year,paper_type,chapter_id)&student_id=eq.${studentId}&paper.chapter_id=eq.${chapterId}&order=submitted_at.desc`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        ),
        // 2. test_results - Proficiency/Mock/Exam/DPP tests (filtered by subject_id per documentation)
        fetch(
          testResultsUrl,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        ),
      ]);

      const [paperData, testData] = await Promise.all([
        paperTestResponse.json(),
        testResultsResponse.json(),
      ]);

      console.log('[getChapterTestResults] Paper results:', paperData?.length || 0);
      console.log('[getChapterTestResults] Test results:', testData?.length || 0);
      
      // Log test_results details for debugging DPP detection
      if (Array.isArray(testData)) {
        testData.forEach((item: any, idx: number) => {
          const testType = item.test?.test_type || item.test_type || 'unknown';
          const title = item.test?.title || 'no title';
          console.log(`[getChapterTestResults] Test ${idx}: type=${testType}, title=${title}`);
        });
      }

      // Normalize all results into unified format
      const unifiedResults: any[] = [];

      // Process paper_test_results (PYQ)
      if (Array.isArray(paperData)) {
        paperData.forEach((item: any) => {
          unifiedResults.push({
            id: item.id,
            paper_id: item.paper_id,
            paper_category: item.paper_category || 'previous_year',
            score: item.score,
            total_questions: item.total_questions,
            percentage: item.percentage,
            time_taken_seconds: item.time_taken_seconds,
            grading_status: item.grading_status || 'graded',
            submitted_at: item.submitted_at,
            answers: item.answers || {},
            paper: item.paper ? {
              exam_name: item.paper.exam_name,
              year: item.paper.year,
              paper_type: item.paper.paper_type,
            } : null,
            isFromTestsTable: false,
            source: 'paper_test_results',
          });
        });
      }

      // Process test_results (Proficiency/Mock/Exam/DPP)
      // DPP is detected by: test_type === 'dpp' OR title contains 'dpp' (case-insensitive)
      if (Array.isArray(testData)) {
        testData.forEach((item: any) => {
          const testType = item.test?.test_type || item.test_type || 'practice';
          const testTitle = item.test?.title || '';
          
          // DPP detection: check test_type OR title contains 'dpp'
          const isDpp = testType.toLowerCase() === 'dpp' || testTitle.toLowerCase().includes('dpp');
          
          let category = 'exam';
          if (isDpp) {
            category = 'dpp';
          } else if (testType === 'proficiency') {
            category = 'proficiency';
          } else if (testType === 'mock' || testType === 'practice') {
            category = 'exam';
          }
          
          unifiedResults.push({
            id: item.id,
            paper_id: item.test_id,
            paper_category: category,
            score: item.score,
            total_questions: item.total_questions,
            percentage: item.percentage,
            time_taken_seconds: item.time_taken_seconds,
            grading_status: item.grading_status || 'graded',
            submitted_at: item.submitted_at,
            answers: item.answers || {},
            paper: item.test ? {
              exam_name: item.test.title,
              year: null,
              paper_type: isDpp ? 'DPP' : item.test.test_type,
            } : null,
            isFromTestsTable: true,
            source: 'test_results',
          });
        });
      }

      // Note: Per documentation, DPP results come from test_results table (detected by test_type='dpp' or title contains 'dpp')
      // dpp_topic_submissions is NOT used for My Results display

      // Sort all results by submitted_at descending
      unifiedResults.sort((a, b) => {
        const dateA = new Date(a.submitted_at || 0).getTime();
        const dateB = new Date(b.submitted_at || 0).getTime();
        return dateB - dateA;
      });

      console.log('[getChapterTestResults] Total unified results:', unifiedResults.length);
      return { success: true, results: unifiedResults };
    } catch (error) {
      console.error('Error fetching chapter test results:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get student answers for a specific paper (for review modal)
  async getStudentAnswers(paperId: string, userId: string): Promise<{ success: boolean; answers?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getStudentAnswers] Fetching answers for paper:', paperId, 'user:', userId);
      
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/student_answers?paper_id=eq.${paperId}&user_id=eq.${userId}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getStudentAnswers] Response:', response.ok, 'Answers count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch student answers' };
      }
      return { success: true, answers: data };
    } catch (error) {
      console.error('Error fetching student answers:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get MCQ questions for a topic (topic_id = X)
  async getTopicMCQs(topicId: string, difficulty?: string): Promise<{ success: boolean; questions?: PreviousYearQuestion[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getTopicMCQs] Fetching MCQs for topic:', topicId, 'difficulty:', difficulty);
      
      // Query: topic_id = X AND options IS NOT NULL
      let url = `${SUPABASE_URL}/rest/v1/questions?select=*&topic_id=eq.${topicId}&or=(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)&options=not.is.null&order=created_at.asc`;
      
      if (difficulty && difficulty !== 'All') {
        url += `&difficulty=eq.${difficulty}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('[getTopicMCQs] Response:', response.ok, 'Questions count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch MCQ questions' };
      }
      return { success: true, questions: data };
    } catch (error) {
      console.error('Error fetching topic MCQs:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get DPP questions for a topic (for review modal)
  async getDPPQuestionsForTopic(topicId: string): Promise<{ success: boolean; questions?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getDPPQuestionsForTopic] Fetching DPP questions for topic:', topicId);
      
      // Fetch questions tagged as DPP for this topic
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/questions?select=*&topic_id=eq.${topicId}&order=created_at.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getDPPQuestionsForTopic] Response:', response.ok, 'Questions count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch DPP questions' };
      }
      return { success: true, questions: data };
    } catch (error) {
      console.error('Error fetching DPP questions:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get unique difficulty levels for a topic's MCQs
  async getTopicMCQDifficulties(topicId: string): Promise<{ success: boolean; difficulties?: string[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/questions?select=difficulty&topic_id=eq.${topicId}&or=(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)&options=not.is.null`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getTopicMCQDifficulties] Response:', response.ok, 'Data:', data);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch difficulties' };
      }
      
      const uniqueDifficulties = Array.from(new Set(data.map((d: { difficulty: string }) => d.difficulty).filter(Boolean)));
      return { success: true, difficulties: uniqueDifficulties as string[] };
    } catch (error) {
      console.error('Error fetching topic MCQ difficulties:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get subject-level videos (AI-generated lectures from chapter data)
  // Chapters have ai_generated_video_url field directly embedded
  async getSubjectVideos(subjectId: string): Promise<{ success: boolean; videos?: TopicVideo[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getSubjectVideos] Fetching chapters for subject:', subjectId);
      
      // Fetch chapters for this subject - chapters have ai_generated_video_url field
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_chapters?select=*,ai_presentation_json&subject_id=eq.${subjectId}&order=sequence_order.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      const chaptersData = await response.json();
      console.log('[getSubjectVideos] Chapters response:', response.ok, 'count:', chaptersData?.length || 0);

      if (!response.ok) {
        console.log('[getSubjectVideos] Chapters fetch failed:', chaptersData);
        return { success: false, error: chaptersData.message || 'Failed to fetch chapters' };
      }
      
      // Filter chapters that have ai_generated_video_url and transform to TopicVideo format
      const videos: TopicVideo[] = (Array.isArray(chaptersData) ? chaptersData : [])
        .filter((chapter: any) => chapter.ai_generated_video_url)
        .map((chapter: any, index: number) => ({
          id: chapter.id,
          video_id: chapter.id,
          title: `${chapter.title} - AI Lecture`,
          description: chapter.description || 'AI-generated lecture for this chapter',
          thumbnail_url: null,
          duration_seconds: 0,
          language: 'en',
          is_active: true,
          display_order: chapter.sequence_order || index,
          topic_id: chapter.id, // Use chapter id as topic_id for compatibility
          video_url: chapter.ai_generated_video_url,
          video_platform: 'ai_generated',
          created_at: chapter.created_at,
          ai_presentation_json: chapter.ai_presentation_json, // Include presentation data
        } as TopicVideo));
      
      console.log('[getSubjectVideos] Chapters with AI videos:', videos.length);

      return { success: true, videos };
    } catch (error) {
      console.error('Error fetching subject videos:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get subject-level MCQs by aggregating chapter-level questions for all chapters in the subject
  // Uses batched requests to handle subjects with many chapters (Supabase limits in() to ~15 items)
  async getSubjectMCQs(subjectId: string, difficulty?: string): Promise<{ success: boolean; questions?: PreviousYearQuestion[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getSubjectMCQs] Fetching subject-level MCQs for subject:', subjectId, 'difficulty:', difficulty);
      
      // First, get all chapter IDs for this subject
      const chaptersResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_chapters?select=id&subject_id=eq.${subjectId}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!chaptersResponse.ok) {
        return { success: false, error: 'Failed to fetch subject chapters' };
      }

      const chapters = await chaptersResponse.json();
      if (!chapters || chapters.length === 0) {
        return { success: true, questions: [] };
      }

      const chapterIds = chapters.map((c: { id: string }) => c.id);
      console.log('[getSubjectMCQs] Found', chapterIds.length, 'chapters for subject');

      // Batch chapter IDs to avoid Supabase in() filter limits (max ~10-15 items per request)
      const BATCH_SIZE = 10;
      const allQuestions: PreviousYearQuestion[] = [];
      
      for (let i = 0; i < chapterIds.length; i += BATCH_SIZE) {
        const batchIds = chapterIds.slice(i, i + BATCH_SIZE);
        const encodedIds = encodeURIComponent(`(${batchIds.join(',')})`);
        
        let url = `${SUPABASE_URL}/rest/v1/questions?select=*&chapter_id=in.${encodedIds}&topic_id=is.null&or=${encodeURIComponent('(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)')}&options=not.is.null&order=created_at.asc`;
        
        if (difficulty && difficulty !== 'All') {
          url += `&difficulty=eq.${encodeURIComponent(difficulty)}`;
        }
        
        const response = await fetch(url, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            allQuestions.push(...data);
          }
        }
      }

      console.log('[getSubjectMCQs] Total questions fetched:', allQuestions.length);
      return { success: true, questions: allQuestions };
    } catch (error) {
      console.error('Error fetching subject MCQs:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get subject-level MCQ difficulties by aggregating from all chapters in the subject
  // Uses batched requests to handle subjects with many chapters
  async getSubjectMCQDifficulties(subjectId: string): Promise<{ success: boolean; difficulties?: string[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getSubjectMCQDifficulties] Fetching difficulties for subject:', subjectId);

      // First, get all chapter IDs for this subject
      const chaptersResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_chapters?select=id&subject_id=eq.${subjectId}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!chaptersResponse.ok) {
        return { success: false, error: 'Failed to fetch subject chapters' };
      }

      const chapters = await chaptersResponse.json();
      if (!chapters || chapters.length === 0) {
        return { success: true, difficulties: [] };
      }

      const chapterIds = chapters.map((c: { id: string }) => c.id);

      // Batch chapter IDs to avoid Supabase in() filter limits
      const BATCH_SIZE = 10;
      const allDifficulties: string[] = [];
      
      for (let i = 0; i < chapterIds.length; i += BATCH_SIZE) {
        const batchIds = chapterIds.slice(i, i + BATCH_SIZE);
        const encodedIds = encodeURIComponent(`(${batchIds.join(',')})`);
        
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/questions?select=difficulty&chapter_id=in.${encodedIds}&topic_id=is.null&or=${encodeURIComponent('(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)')}&options=not.is.null`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            data.forEach((d: { difficulty: string }) => {
              if (d.difficulty && !allDifficulties.includes(d.difficulty)) {
                allDifficulties.push(d.difficulty);
              }
            });
          }
        }
      }

      console.log('[getSubjectMCQDifficulties] Unique difficulties:', allDifficulties);
      return { success: true, difficulties: allDifficulties };
    } catch (error) {
      console.error('Error fetching subject MCQ difficulties:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getChapterAssignments(chapterId: string): Promise<{ success: boolean; assignments?: Assignment[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const url = `${SUPABASE_URL}/rest/v1/assignments?select=*&chapter_id=eq.${chapterId}&is_active=eq.true&order=due_date.desc`;

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch assignments' };
      }
      return { success: true, assignments: data };
    } catch (error) {
      console.error('Error fetching chapter assignments:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getStudentTestResults(studentId: string, subjectId: string): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const url = `${SUPABASE_URL}/rest/v1/mcq_test_submissions?select=*&student_id=eq.${studentId}&order=submitted_at.desc&limit=50`;

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch test results' };
      }
      return { success: true, results: data };
    } catch (error) {
      console.error('Error fetching test results:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get chapter-level MCQs (where topic_id is null AND chapter_id = X)
  async getChapterMCQs(chapterId: string, difficulty?: string): Promise<{ success: boolean; questions?: PreviousYearQuestion[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getChapterMCQs] Fetching chapter-level MCQs for chapter:', chapterId, 'difficulty:', difficulty);
      
      // Query: chapter_id = X AND topic_id IS NULL AND options IS NOT NULL
      let url = `${SUPABASE_URL}/rest/v1/questions?select=*&chapter_id=eq.${chapterId}&topic_id=is.null&or=(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)&options=not.is.null&order=created_at.asc`;
      
      if (difficulty && difficulty !== 'All') {
        url += `&difficulty=eq.${difficulty}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('[getChapterMCQs] Response:', response.ok, 'Questions count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch MCQ questions' };
      }
      return { success: true, questions: data };
    } catch (error) {
      console.error('Error fetching chapter MCQs:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get chapter-level MCQ difficulties (where topic_id is null AND chapter_id = X)
  async getChapterMCQDifficulties(chapterId: string): Promise<{ success: boolean; difficulties?: string[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/questions?select=difficulty&chapter_id=eq.${chapterId}&topic_id=is.null&or=(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)&options=not.is.null`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getChapterMCQDifficulties] Response:', response.ok, 'Data:', data);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch difficulties' };
      }
      
      const uniqueDifficulties = Array.from(new Set(data.map((d: { difficulty: string }) => d.difficulty).filter(Boolean)));
      return { success: true, difficulties: uniqueDifficulties as string[] };
    } catch (error) {
      console.error('Error fetching chapter MCQ difficulties:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async submitMCQTest(params: {
    studentId: string;
    subjectId?: string;
    topicId?: string;
    chapterId?: string;
    answers: { questionId: string; selectedAnswer: string; isCorrect: boolean }[];
    score: number;
    totalMarks: number;
    timeTaken: number;
  }): Promise<{ success: boolean; submissionId?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const submissionResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/test_submissions`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            student_id: params.studentId,
            topic_id: params.topicId || null,
            chapter_id: params.chapterId || null,
            answers: params.answers,
            score: params.score,
            total_marks: params.totalMarks,
            time_taken_seconds: params.timeTaken,
          }),
        }
      );

      const submissionData = await submissionResponse.json();
      if (!submissionResponse.ok) {
        console.error('[submitMCQTest] Submission error:', submissionData);
        return { success: false, error: submissionData.message || 'Failed to submit test' };
      }

      const progressResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/student_progress`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            student_id: params.studentId,
            topic_id: params.topicId || null,
            chapter_id: params.chapterId || null,
            score: Math.round((params.score / params.totalMarks) * 100),
            is_completed: true,
            completed_at: new Date().toISOString(),
          }),
        }
      );

      if (!progressResponse.ok) {
        console.warn('[submitMCQTest] Progress update failed but submission succeeded');
      }

      return { success: true, submissionId: submissionData[0]?.id };
    } catch (error) {
      console.error('Error submitting MCQ test:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getMCQQuestionCounts(params: {
    topicId?: string;
    chapterId?: string;
    chapterOnly?: boolean;
  }): Promise<{ success: boolean; counts?: { all: number; Low: number; Medium: number; Intermediate: number; Advanced: number }; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Base query with proper filters: question_format and options NOT NULL
      let url = `${SUPABASE_URL}/rest/v1/questions?select=difficulty&or=(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)&options=not.is.null`;
      
      if (params.topicId) {
        // Topic level: topic_id = X
        url += `&topic_id=eq.${params.topicId}`;
      } else if (params.chapterId && params.chapterOnly) {
        // Chapter level only: chapter_id = X AND topic_id IS NULL
        url += `&chapter_id=eq.${params.chapterId}&topic_id=is.null`;
      } else if (params.chapterId) {
        // All chapter questions (includes topic-level)
        url += `&chapter_id=eq.${params.chapterId}`;
      }

      console.log('[getMCQQuestionCounts] URL:', url);

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('[getMCQQuestionCounts] Response:', response.ok, 'Count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch counts' };
      }

      const counts = {
        all: data?.length || 0,
        Low: 0,
        Medium: 0,
        Intermediate: 0,
        Advanced: 0,
      };

      data?.forEach((q: { difficulty: string }) => {
        if (q.difficulty && counts[q.difficulty as keyof typeof counts] !== undefined) {
          counts[q.difficulty as keyof typeof counts]++;
        }
      });

      return { success: true, counts };
    } catch (error) {
      console.error('Error fetching MCQ question counts:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get subject-level previous year papers
  async getSubjectPreviousYearPapers(subjectId: string): Promise<{ success: boolean; papers?: PreviousYearPaper[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getSubjectPreviousYearPapers] Fetching subject-level papers for subject:', subjectId);
      
      // Fetch all papers for the subject (subject_previous_year_papers table may not have topic_id column)
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/subject_previous_year_papers?select=*&subject_id=eq.${subjectId}&order=year.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('[getSubjectPreviousYearPapers] Response:', response.ok, 'Papers count:', data?.length || 0);
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch previous year papers' };
      }
      return { success: true, papers: data };
    } catch (error) {
      console.error('Error fetching subject previous year papers:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get chapters for a course (to calculate progress)
  async getCourseChapters(courseId: string): Promise<{ success: boolean; chapters?: { id: string }[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/chapters?select=id&course_id=eq.${courseId}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch chapters' };
      }
      return { success: true, chapters: data };
    } catch (error) {
      console.error('Error fetching course chapters:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get student progress for multiple chapter IDs
  async getStudentProgressByChapters(studentId: string, chapterIds: string[]): Promise<{ success: boolean; progress?: { chapter_id: string; is_completed: boolean }[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (chapterIds.length === 0) {
        return { success: true, progress: [] };
      }

      // Format chapter IDs for the IN clause
      const chapterIdsParam = chapterIds.map(id => `"${id}"`).join(',');
      
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/student_progress?select=chapter_id,is_completed&student_id=eq.${studentId}&chapter_id=in.(${chapterIdsParam})`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch progress' };
      }
      return { success: true, progress: data };
    } catch (error) {
      console.error('Error fetching student progress:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get course progress percentage
  async getCourseProgress(studentId: string, courseId: string): Promise<{ success: boolean; percentage: number; completedChapters: number; totalChapters: number; error?: string }> {
    try {
      // First get all chapters for the course
      const chaptersResult = await this.getCourseChapters(courseId);
      if (!chaptersResult.success || !chaptersResult.chapters) {
        return { success: false, percentage: 0, completedChapters: 0, totalChapters: 0, error: chaptersResult.error };
      }

      const totalChapters = chaptersResult.chapters.length;
      if (totalChapters === 0) {
        return { success: true, percentage: 0, completedChapters: 0, totalChapters: 0 };
      }

      const chapterIds = chaptersResult.chapters.map(c => c.id);
      
      // Get progress for these chapters
      const progressResult = await this.getStudentProgressByChapters(studentId, chapterIds);
      if (!progressResult.success) {
        return { success: false, percentage: 0, completedChapters: 0, totalChapters, error: progressResult.error };
      }

      // Count completed chapters (unique chapter_ids with is_completed = true)
      const completedChapterIds = new Set(
        (progressResult.progress || [])
          .filter(p => p.is_completed)
          .map(p => p.chapter_id)
      );
      const completedChapters = completedChapterIds.size;
      const percentage = Math.round((completedChapters / totalChapters) * 100);

      return { success: true, percentage, completedChapters, totalChapters };
    } catch (error) {
      console.error('Error calculating course progress:', error);
      return { success: false, percentage: 0, completedChapters: 0, totalChapters: 0, error: 'Network error' };
    }
  }

  // ==========================================
  // DPP (Daily Practice Problems) Methods
  // ==========================================

  // Check if DPP questions are available for a topic
  async checkDPPAvailability(topicId: string): Promise<{ success: boolean; available: boolean; count: number; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, available: false, count: 0, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/dpp_questions?topic_id=eq.${topicId}&is_active=eq.true&correct_answer=neq.&select=id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact',
          },
        }
      );

      const countHeader = response.headers.get('content-range');
      const count = countHeader ? parseInt(countHeader.split('/')[1] || '0') : 0;

      return { success: true, available: count > 0, count };
    } catch (error) {
      console.error('[checkDPPAvailability] Error:', error);
      return { success: false, available: false, count: 0, error: 'Network error' };
    }
  }

  // Get DPP questions for a topic (prioritizing unattempted questions)
  async getDPPQuestions(topicId: string, userId: string): Promise<{ success: boolean; questions?: DPPQuestion[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[getDPPQuestions] Fetching DPP for topic:', topicId);

      // Step 1: Get already attempted question IDs for this user and topic
      const attemptedResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/dpp_attempted_questions?student_id=eq.${userId}&topic_id=eq.${topicId}&select=question_id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      let attemptedIds: string[] = [];
      if (attemptedResponse.ok) {
        const attemptedData = await attemptedResponse.json();
        attemptedIds = attemptedData.map((a: { question_id: string }) => a.question_id);
        console.log('[getDPPQuestions] Already attempted:', attemptedIds.length, 'questions');
      }

      // Step 2: Fetch unattempted questions first
      let url = `${SUPABASE_URL}/rest/v1/dpp_questions?topic_id=eq.${topicId}&is_active=eq.true&correct_answer=neq.&select=*&limit=50`;
      
      // Exclude already attempted questions if any
      if (attemptedIds.length > 0) {
        const encodedIds = attemptedIds.map(id => `"${id}"`).join(',');
        url += `&id=not.in.(${encodeURIComponent(encodedIds)})`;
      }

      const questionsResponse = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!questionsResponse.ok) {
        const errorData = await questionsResponse.json();
        return { success: false, error: errorData.message || 'Failed to fetch DPP questions' };
      }

      let questions: DPPQuestion[] = await questionsResponse.json();
      console.log('[getDPPQuestions] Found unattempted questions:', questions.length);

      // Step 3: If not enough unattempted questions, include some attempted ones
      if (questions.length < 10 && attemptedIds.length > 0) {
        const needed = 10 - questions.length;
        const attemptedUrl = `${SUPABASE_URL}/rest/v1/dpp_questions?topic_id=eq.${topicId}&is_active=eq.true&correct_answer=neq.&select=*&limit=${needed}`;
        
        const attemptedQuestionsResponse = await fetch(attemptedUrl, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (attemptedQuestionsResponse.ok) {
          const attemptedQuestions: DPPQuestion[] = await attemptedQuestionsResponse.json();
          // Add only questions not already in the list
          const existingIds = new Set(questions.map(q => q.id));
          const additionalQuestions = attemptedQuestions.filter(q => !existingIds.has(q.id));
          questions = [...questions, ...additionalQuestions.slice(0, needed)];
        }
      }

      // Step 4: Shuffle and select 10 random questions
      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 10);

      console.log('[getDPPQuestions] Returning', selected.length, 'questions');
      return { success: true, questions: selected };
    } catch (error) {
      console.error('[getDPPQuestions] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get DPP submission history and calculate streak
  async getDPPProgress(topicId: string, userId: string): Promise<{ success: boolean; progress?: DPPProgress; todayCompleted?: boolean; todaySubmission?: DPPSubmission; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/dpp_topic_submissions?student_id=eq.${userId}&topic_id=eq.${topicId}&select=*&order=test_date.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to fetch DPP progress' };
      }

      const submissions: DPPSubmission[] = await response.json();
      console.log('[getDPPProgress] Found', submissions.length, 'submissions');

      // Calculate streak
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      
      const dates = Array.from(new Set(submissions.map(s => s.test_date))).sort().reverse();
      
      let streak = 0;
      if (dates.length > 0) {
        // Must have submission today or yesterday to have a streak
        if (dates[0] === today || dates[0] === yesterday) {
          streak = 1;
          for (let i = 0; i < dates.length - 1; i++) {
            const current = new Date(dates[i]);
            const next = new Date(dates[i + 1]);
            const diffDays = Math.round((current.getTime() - next.getTime()) / 86400000);
            
            if (diffDays === 1) {
              streak++;
            } else {
              break;
            }
          }
        }
      }

      const todaySubmission = submissions.find(s => s.test_date === today);
      
      return {
        success: true,
        progress: {
          streak,
          totalCompleted: submissions.length,
          submissions: submissions.map(s => ({
            test_date: s.test_date,
            score: s.score,
            total_questions: s.total_questions,
            time_taken_seconds: s.time_taken_seconds,
          })),
        },
        todayCompleted: !!todaySubmission,
        todaySubmission,
      };
    } catch (error) {
      console.error('[getDPPProgress] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Submit DPP answers
  async submitDPP(
    userId: string,
    topicId: string,
    questions: DPPQuestion[],
    answers: { [key: string]: string },
    score: number,
    timeSeconds: number
  ): Promise<{ success: boolean; submission?: DPPSubmission; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const today = new Date().toISOString().split('T')[0];
      
      const submissionData = {
        student_id: userId,
        topic_id: topicId,
        test_date: today,
        dpp_type: 'teacher',
        questions: questions,
        answers: answers,
        score: score,
        total_questions: questions.length,
        time_taken_seconds: timeSeconds,
        submitted_at: new Date().toISOString(),
      };

      console.log('[submitDPP] Submitting DPP:', { userId, topicId, score, total: questions.length });

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/dpp_topic_submissions`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(submissionData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[submitDPP] Error response:', errorData);
        return { success: false, error: errorData.message || 'Failed to submit DPP' };
      }

      const data = await response.json();
      console.log('[submitDPP] Submission successful');

      // Also track attempted questions
      const attemptedRecords = questions.map(q => ({
        student_id: userId,
        question_id: q.id,
        topic_id: topicId,
        was_correct: answers[q.id]?.toUpperCase() === q.correct_answer?.toUpperCase(),
        attempted_at: new Date().toISOString(),
      }));

      // Upsert attempted questions
      await fetch(
        `${SUPABASE_URL}/rest/v1/dpp_attempted_questions`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(attemptedRecords),
        }
      );

      return { success: true, submission: Array.isArray(data) ? data[0] : data };
    } catch (error) {
      console.error('[submitDPP] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get DPP submission for a specific date
  async getDPPSubmissionByDate(topicId: string, userId: string, date: string): Promise<{ success: boolean; submission?: DPPSubmission; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/dpp_topic_submissions?student_id=eq.${userId}&topic_id=eq.${topicId}&test_date=eq.${date}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to fetch submission' };
      }

      const data = await response.json();
      if (data.length === 0) {
        return { success: true, submission: undefined };
      }

      return { success: true, submission: data[0] };
    } catch (error) {
      console.error('[getDPPSubmissionByDate] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getAccessToken(): Promise<string | null> {
    // Proactively keep the access token fresh so authenticated requests never
    // send an expired JWT. Single-flight + skew window keep the common path cheap.
    await this.ensureFreshToken();
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }

  // Refreshes the access token if it is missing-exp, expired, or about to expire
  // within the skew window. Safe to call frequently (single-flight + cooldown).
  async ensureFreshToken(skewMs: number = 120000): Promise<void> {
    let token: string | null;
    let refreshToken: string | null;
    try {
      token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return; // not logged in — nothing to refresh
      refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return; // can't refresh without a refresh token
    } catch {
      return;
    }
    const expMs = decodeJwtExpMs(token);
    // If exp is readable and comfortably in the future, do nothing.
    if (expMs !== null && expMs - Date.now() > skewMs) return;
    // Throttle retries after a recent failure (transient outage).
    if (Date.now() < this.proactiveCooldownUntil) return;
    const result = await this.refreshSession();
    if (!result.success) {
      this.proactiveCooldownUntil = Date.now() + 15000;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return !!token;
  }

  private async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    // The refresh token is the credential that keeps the session alive
    // indefinitely. Never wipe a good stored refresh token with a blank one
    // (that would silently disable auto-refresh and log the user out later).
    const cleanRefresh = (refreshToken || '').trim();
    if (cleanRefresh) {
      // Persist both in one batched write (best-effort): this shrinks — but does
      // not strictly eliminate — the window where a crash mid-save could leave a
      // rotated access token without its matching refresh token. AsyncStorage
      // multiSet is a batched write, not a guaranteed cross-key transaction.
      await AsyncStorage.multiSet([
        [AUTH_TOKEN_KEY, accessToken],
        [REFRESH_TOKEN_KEY, cleanRefresh],
      ]);
    } else {
      // No new refresh token to store: only update the access token and keep
      // whatever refresh token is already persisted.
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    }
  }

  private async saveUser(user: User): Promise<void> {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // ============ PUSH NOTIFICATIONS ============

  async savePushToken(userId: string, token: string, platform: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[PushToken] Saving token for user ${userId}, platform: ${platform}, token: ${token.substring(0, 20)}...`);
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        console.log('[PushToken] FAILED - Not authenticated (no access token)');
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/push_notification_tokens?on_conflict=user_id,token`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_id: userId,
            token: token,
            platform,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log(`[PushToken] FAILED - HTTP ${response.status}:`, JSON.stringify(errorData));
        return { success: false, error: errorData.message || 'Failed to save push token' };
      }

      console.log('[PushToken] SUCCESS - Token saved to push_notification_tokens');
      return { success: true };
    } catch (error) {
      console.log('[PushToken] FAILED - Network error:', error);
      return { success: false, error: 'Network error saving push token' };
    }
  }

  async removePushToken(token: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[PushToken] Removing token: ${token.substring(0, 20)}...`);
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        console.log('[PushToken] FAILED - Not authenticated (no access token)');
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/push_notification_tokens?token=eq.${encodeURIComponent(token)}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        console.log(`[PushToken] Remove FAILED - HTTP ${response.status}`);
        return { success: false, error: 'Failed to remove push token' };
      }

      console.log('[PushToken] SUCCESS - Token removed');
      return { success: true };
    } catch (error) {
      console.log('[PushToken] Remove FAILED - Network error:', error);
      return { success: false, error: 'Network error removing push token' };
    }
  }

  // ============ ASSIGNMENTS METHODS ============

  // Get assignments for a subject/chapter/topic
  async getAssignments(subjectId: string, chapterId?: string, topicId?: string): Promise<{ success: boolean; assignments?: Assignment[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      let url = `${SUPABASE_URL}/rest/v1/assignments?subject_id=eq.${subjectId}&is_active=eq.true&select=id,subject_id,chapter_id,topic_id,title,description,instructions,total_marks,passing_marks,duration_minutes,due_date,valid_until,is_active,source_type,created_at&order=created_at.desc`;
      
      if (chapterId) {
        url += `&chapter_id=eq.${chapterId}`;
      }
      if (topicId) {
        url += `&topic_id=eq.${topicId}`;
      }

      console.log('[getAssignments] Fetching assignments:', { subjectId, chapterId, topicId });

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to fetch assignments' };
      }

      const data = await response.json();
      console.log('[getAssignments] Found:', data.length, 'assignments');

      return { success: true, assignments: data };
    } catch (error) {
      console.error('[getAssignments] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get full assignment details with questions
  async getAssignmentDetails(assignmentId: string): Promise<{ success: boolean; assignment?: Assignment; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to fetch assignment' };
      }

      const data = await response.json();
      if (data.length === 0) {
        return { success: false, error: 'Assignment not found' };
      }

      const assignment = data[0];
      
      // Parse questions from JSONB
      const questions = (assignment.questions || []).map((q: any, idx: number) => ({
        id: q.id || `q_${idx}`,
        question: q.question || q.text || '',
        type: q.type || 'short_answer',
        options: q.options || [],
        correct_answer: q.correct_answer || q.answer || '',
        marks: q.marks || 1,
        explanation: q.explanation || '',
        image_url: q.image_url || null,
      }));

      return { 
        success: true, 
        assignment: { ...assignment, questions } 
      };
    } catch (error) {
      console.error('[getAssignmentDetails] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get submission status for multiple assignments
  async getSubmissionStatus(userId: string, assignmentIds: string[]): Promise<{ success: boolean; submissions?: AssignmentSubmission[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (assignmentIds.length === 0) {
        return { success: true, submissions: [] };
      }

      const idsFilter = assignmentIds.map(id => `"${id}"`).join(',');
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/assignment_submissions?student_id=eq.${userId}&assignment_id=in.(${idsFilter})&select=id,assignment_id,student_id,answers,score,percentage,feedback,submitted_at,graded_at,time_taken_seconds`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to fetch submissions' };
      }

      const data = await response.json();
      return { success: true, submissions: data };
    } catch (error) {
      console.error('[getSubmissionStatus] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Grade subjective questions using AI
  async gradeWithAI(questions: { question_id: string; question: string; type: string; correct_answer: string; student_answer: string; marks: number }[]): Promise<{ success: boolean; grades?: AIGradeResult[]; totalMarksAwarded?: number; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[gradeWithAI] Grading', questions.length, 'questions');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-grade-assignment`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ questions }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[gradeWithAI] Error response:', errorData);
        return { success: false, error: errorData.message || 'AI grading failed' };
      }

      const data = await response.json();
      console.log('[gradeWithAI] Grading complete:', data);

      return { 
        success: true, 
        grades: data.grades,
        totalMarksAwarded: data.total_marks_awarded 
      };
    } catch (error) {
      console.error('[gradeWithAI] Error:', error);
      return { success: false, error: 'AI grading network error' };
    }
  }

  // Submit assignment with grading
  async submitAssignment(
    userId: string, 
    assignmentId: string, 
    questions: AssignmentQuestion[], 
    answers: { [questionId: string]: string },
    timeTakenSeconds: number
  ): Promise<{ success: boolean; submission?: AssignmentSubmission; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[submitAssignment] Processing submission for assignment:', assignmentId);

      // Separate MCQ/true-false (local grading) from subjective (AI grading)
      const mcqTypes = ['mcq', 'true_false'];
      const subjectiveTypes = ['short_answer', 'long_answer', 'application'];

      let gradedAnswers: { [questionId: string]: { question_id: string; text_answer: string; image_url: string | null; marks_awarded: number; feedback: string; is_correct: boolean } } = {};
      let totalScore = 0;
      let totalMarks = 0;

      // Grade MCQ/True-False locally
      for (const q of questions) {
        totalMarks += q.marks;
        const studentAnswer = (answers[q.id] || '').trim();
        
        if (mcqTypes.includes(q.type)) {
          let correctText = (q.correct_answer || '').trim();
          // Letter-key fallback: if correct_answer is A/B/C/D, resolve to option text
          if (/^[A-Da-d]$/.test(correctText) && q.options && q.options.length > 0) {
            const idx = correctText.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < q.options.length) {
              correctText = (typeof q.options[idx] === 'string' ? q.options[idx] : (q.options[idx] as any)?.text || q.options[idx]) as string;
            }
          }
          const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
          const isCorrect = normalize(studentAnswer) === normalize(correctText);
          const marksAwarded = isCorrect ? q.marks : 0;
          totalScore += marksAwarded;
          
          gradedAnswers[q.id] = {
            question_id: q.id,
            text_answer: studentAnswer,
            image_url: null,
            marks_awarded: marksAwarded,
            feedback: isCorrect ? 'Correct!' : `Incorrect. The correct answer is: ${correctText}`,
            is_correct: isCorrect,
          };
        }
      }

      // Grade subjective questions with AI
      const subjectiveQuestions = questions.filter(q => subjectiveTypes.includes(q.type));
      if (subjectiveQuestions.length > 0) {
        const questionsToGrade = subjectiveQuestions.map(q => ({
          question_id: q.id,
          question: q.question,
          type: q.type,
          correct_answer: q.correct_answer || '',
          student_answer: answers[q.id] || '',
          marks: q.marks,
        }));

        const aiResult = await this.gradeWithAI(questionsToGrade);
        
        if (aiResult.success && aiResult.grades) {
          for (const grade of aiResult.grades) {
            totalScore += grade.marks_awarded;
            gradedAnswers[grade.question_id] = {
              question_id: grade.question_id,
              text_answer: answers[grade.question_id] || '',
              image_url: null,
              marks_awarded: grade.marks_awarded,
              feedback: grade.feedback,
              is_correct: grade.marks_awarded >= 1,
            };
          }
        } else {
          for (const q of subjectiveQuestions) {
            gradedAnswers[q.id] = {
              question_id: q.id,
              text_answer: answers[q.id] || '',
              image_url: null,
              marks_awarded: 0,
              feedback: 'Pending manual review',
              is_correct: false,
            };
          }
        }
      }

      const percentage = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;
      const hasPending = Object.values(gradedAnswers).some(a => a.feedback === 'Pending manual review');

      const submissionData = {
        assignment_id: assignmentId,
        student_id: userId,
        answers: gradedAnswers,
        score: totalScore,
        percentage: percentage,
        feedback: percentage >= 60 ? 'Good job!' : 'Keep practicing!',
        submitted_at: new Date().toISOString(),
        graded_at: hasPending ? null : new Date().toISOString(),
        time_taken_seconds: timeTakenSeconds,
      };

      console.log('[submitAssignment] Submitting:', { score: totalScore, totalMarks, percentage });

      // Check for existing submission (upsert)
      const existingResp = await fetch(
        `${SUPABASE_URL}/rest/v1/assignment_submissions?assignment_id=eq.${assignmentId}&student_id=eq.${userId}&select=id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const existingData = await existingResp.json();
      const existingId = existingData?.[0]?.id;

      let response;
      if (existingId) {
        response = await fetch(
          `${SUPABASE_URL}/rest/v1/assignment_submissions?id=eq.${existingId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(submissionData),
          }
        );
      } else {
        response = await fetch(
          `${SUPABASE_URL}/rest/v1/assignment_submissions`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(submissionData),
          }
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[submitAssignment] Error response:', errorData);
        return { success: false, error: errorData.message || 'Failed to submit assignment' };
      }

      const data = await response.json();
      console.log('[submitAssignment] Submission successful');

      return { success: true, submission: Array.isArray(data) ? data[0] : data };
    } catch (error) {
      console.error('[submitAssignment] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createSelfPracticeAssignment(params: {
    subjectId: string;
    chapterId?: string;
    topicId?: string;
  }): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Fetch questions from the question bank
      let questionsUrl = `${SUPABASE_URL}/rest/v1/questions?select=*&order=created_at.asc&limit=20`;
      if (params.topicId) {
        questionsUrl += `&topic_id=eq.${params.topicId}`;
      } else if (params.chapterId) {
        questionsUrl += `&chapter_id=eq.${params.chapterId}`;
      }

      const questionsResp = await fetch(questionsUrl, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!questionsResp.ok) {
        return { success: false, error: 'Failed to fetch questions for practice' };
      }

      const allQuestions = await questionsResp.json();
      if (!allQuestions || allQuestions.length === 0) {
        return { success: false, error: 'No questions available for practice' };
      }

      // Shuffle and pick up to 10
      const shuffled = allQuestions.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(10, shuffled.length));

      // Map to assignment question format
      const assignmentQuestions = selected.map((q: any, idx: number) => {
        const options = q.options ? Object.entries(q.options).map(([, val]: [string, any]) =>
          typeof val === 'string' ? val : val?.text || String(val)
        ) : [];

        let assignmentType = (q.question_type || 'short_answer').toLowerCase().trim();
        if (options.length > 0) {
          assignmentType = 'mcq';
        } else if (assignmentType === 'subjective' || assignmentType === 'descriptive') {
          assignmentType = 'long_answer';
        } else if (assignmentType === 'numeric') {
          assignmentType = 'short_answer';
        } else if (assignmentType === 'practical') {
          assignmentType = 'application';
        }

        return {
          id: `q_${idx}`,
          question: q.question_text || '',
          type: assignmentType,
          options: options.length > 0 ? options : [],
          correct_answer: q.correct_answer || '',
          marks: q.marks || 1,
          explanation: q.explanation || '',
          image_url: q.question_image_url || null,
        };
      });

      const totalMarks = assignmentQuestions.reduce((sum: number, q: any) => sum + q.marks, 0);
      const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/assignments`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          title: `Practice Assignment - ${today}`,
          subject_id: params.subjectId,
          chapter_id: params.chapterId || null,
          topic_id: params.topicId || null,
          questions: assignmentQuestions,
          total_marks: totalMarks,
          passing_marks: Math.ceil(totalMarks * 0.4),
          is_active: true,
          source_type: 'self_practice',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to create practice assignment' };
      }

      const data = await response.json();
      return { success: true, assignmentId: data?.[0]?.id };
    } catch (error) {
      console.error('[createSelfPracticeAssignment] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Support System APIs
  async getSupportFAQs(): Promise<{ success: boolean; faqs?: SupportFAQ[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/support_faqs?is_active=eq.true&order=display_order.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch FAQs' };
      }

      const data = await response.json();
      return { success: true, faqs: data };
    } catch (error) {
      console.error('[getSupportFAQs] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getSupportArticles(): Promise<{ success: boolean; articles?: SupportArticle[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/support_articles?is_active=eq.true&order=display_order.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch articles' };
      }

      const data = await response.json();
      return { success: true, articles: data };
    } catch (error) {
      console.error('[getSupportArticles] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getUserTickets(): Promise<{ success: boolean; tickets?: SupportTicket[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/support_tickets?order=created_at.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch tickets' };
      }

      const data = await response.json();
      return { success: true, tickets: data };
    } catch (error) {
      console.error('[getUserTickets] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getTicketMessages(ticketId: string): Promise<{ success: boolean; messages?: SupportMessage[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/support_messages?ticket_id=eq.${ticketId}&order=created_at.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch messages' };
      }

      const data = await response.json();
      return { success: true, messages: data };
    } catch (error) {
      console.error('[getTicketMessages] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createSupportTicket(category: string, subject: string, message: string): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const storedUser = await this.getStoredUser();
      if (!storedUser) {
        return { success: false, error: 'User not found' };
      }

      const ticketResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/support_tickets`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            user_id: storedUser.id,
            category,
            subject,
            status: 'open',
          }),
        }
      );

      if (!ticketResponse.ok) {
        const errorData = await ticketResponse.json();
        console.error('[createSupportTicket] Ticket creation failed:', errorData);
        return { success: false, error: errorData.message || 'Failed to create ticket' };
      }

      const ticketData = await ticketResponse.json();
      const ticket = Array.isArray(ticketData) ? ticketData[0] : ticketData;

      await fetch(
        `${SUPABASE_URL}/rest/v1/support_messages`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticket_id: ticket.id,
            sender_type: 'user',
            content: message,
          }),
        }
      );

      return { success: true, ticket };
    } catch (error) {
      console.error('[createSupportTicket] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async sendTicketMessage(ticketId: string, content: string): Promise<{ success: boolean; message?: SupportMessage; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/support_messages`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            ticket_id: ticketId,
            sender_type: 'user',
            content,
          }),
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to send message' };
      }

      const data = await response.json();
      return { success: true, message: Array.isArray(data) ? data[0] : data };
    } catch (error) {
      console.error('[sendTicketMessage] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async submitArticleFeedback(articleId: string, helpful: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const getResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/support_articles?id=eq.${articleId}&select=helpful_count,not_helpful_count`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!getResponse.ok) {
        return { success: false, error: 'Failed to fetch article' };
      }

      const articles = await getResponse.json();
      if (!articles || articles.length === 0) {
        return { success: false, error: 'Article not found' };
      }

      const article = articles[0];
      const currentCount = helpful ? (article.helpful_count || 0) : (article.not_helpful_count || 0);
      const newCount = currentCount + 1;

      const updateResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/support_articles?id=eq.${articleId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            [helpful ? 'helpful_count' : 'not_helpful_count']: newCount,
          }),
        }
      );

      return { success: updateResponse.ok };
    } catch (error) {
      console.error('[submitArticleFeedback] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get enrolled courses with categories and progress for My Courses screen
  async getEnrolledCoursesWithCategories(userId: string): Promise<{
    success: boolean;
    courses?: EnrolledCourseWithCategory[];
    parentCategories?: ParentCategory[];
    error?: string;
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Step 1: Fetch enrollments and parent categories in parallel
      const [enrollmentsResponse, parentCategoriesResponse] = await Promise.all([
        fetch(
          `${SUPABASE_URL}/rest/v1/enrollments?select=id,enrolled_at,course_id,courses(id,name,slug,short_description,duration_months,price_inr,course_thumbnails(storage_url))&student_id=eq.${userId}&is_active=eq.true`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        ),
        fetch(
          `${SUPABASE_URL}/rest/v1/categories?select=id,name,slug,icon&is_active=eq.true&level=eq.1&order=display_order`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
          }
        ),
      ]);

      if (!enrollmentsResponse.ok) {
        return { success: false, error: 'Failed to fetch enrollments' };
      }

      const enrollments = await enrollmentsResponse.json();
      const allParentCategories = parentCategoriesResponse.ok ? await parentCategoriesResponse.json() : [];

      // Build parent category name map
      const parentCategoryMap: Record<string, string> = {};
      allParentCategories.forEach((cat: any) => {
        parentCategoryMap[cat.id] = cat.name;
      });

      // If no enrollments, return empty courses but with parent categories for potential future use
      if (!enrollments || enrollments.length === 0) {
        return { success: true, courses: [], parentCategories: allParentCategories };
      }

      const courseIds = enrollments.map((e: any) => e.course_id).filter(Boolean);
      if (courseIds.length === 0) {
        return { success: true, courses: [], parentCategories: allParentCategories };
      }

      const courseIdsParam = courseIds.map((id: string) => `"${id}"`).join(',');

      // Step 2: Parallel fetch - course_categories and chapters
      const [courseCategoriesResponse, chaptersResponse] = await Promise.all([
        fetch(
          `${SUPABASE_URL}/rest/v1/course_categories?select=course_id,category_id,categories:category_id(id,name,slug,parent_id,level)&course_id=in.(${courseIdsParam})`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        ),
        fetch(
          `${SUPABASE_URL}/rest/v1/chapters?select=id,course_id&course_id=in.(${courseIdsParam})`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        ),
      ]);

      const courseCategories = courseCategoriesResponse.ok ? await courseCategoriesResponse.json() : [];
      const chapters = chaptersResponse.ok ? await chaptersResponse.json() : [];

      // Build course to category mapping (use first category found for each course)
      const courseCategoryMap: Record<string, { categoryId: string; categoryName: string; parentId: string | null }> = {};

      courseCategories.forEach((cc: any) => {
        if (cc.categories && cc.course_id && !courseCategoryMap[cc.course_id]) {
          // Only assign if not already assigned (first one wins)
          courseCategoryMap[cc.course_id] = {
            categoryId: cc.categories.id,
            categoryName: cc.categories.name,
            parentId: cc.categories.parent_id,
          };
        }
      });

      // Build chapters by course
      const chaptersByCourse: Record<string, string[]> = {};
      chapters.forEach((ch: any) => {
        if (!chaptersByCourse[ch.course_id]) {
          chaptersByCourse[ch.course_id] = [];
        }
        chaptersByCourse[ch.course_id].push(ch.id);
      });

      // Get all chapter IDs for progress fetch
      const allChapterIds = chapters.map((ch: any) => ch.id);

      // Step 3: Fetch student progress for all chapters
      let completedChapterIds = new Set<string>();
      if (allChapterIds.length > 0) {
        const chapterIdsParam = allChapterIds.map((id: string) => `"${id}"`).join(',');
        const progressResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/student_progress?select=chapter_id,is_completed&student_id=eq.${userId}&chapter_id=in.(${chapterIdsParam})`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          progressData.forEach((p: any) => {
            if (p.is_completed) {
              completedChapterIds.add(p.chapter_id);
            }
          });
        }
      }

      // Step 4: Build the final enrolled courses array
      const courses: EnrolledCourseWithCategory[] = enrollments.map((enrollment: any) => {
        const course = enrollment.courses;
        const courseId = enrollment.course_id;
        const categoryInfo = courseCategoryMap[courseId];
        const courseChapterIds = chaptersByCourse[courseId] || [];
        
        // Calculate progress
        let progress = 0;
        if (courseChapterIds.length > 0) {
          const completed = courseChapterIds.filter(id => completedChapterIds.has(id)).length;
          progress = Math.round((completed / courseChapterIds.length) * 100);
        }

        // Get parent category info
        let parentCategoryId: string | null = null;
        let parentCategoryName: string | null = null;

        if (categoryInfo) {
          if (categoryInfo.parentId) {
            parentCategoryId = categoryInfo.parentId;
            parentCategoryName = parentCategoryMap[categoryInfo.parentId] || null;
          } else {
            // The category itself might be level 1
            parentCategoryId = categoryInfo.categoryId;
            parentCategoryName = categoryInfo.categoryName;
          }
        }

        return {
          id: course.id,
          name: course.name,
          slug: course.slug,
          thumbnail_url: extractThumbnailUrl(course.course_thumbnails),
          short_description: course.short_description,
          duration_months: course.duration_months,
          price_inr: course.price_inr,
          enrolled_at: enrollment.enrolled_at,
          progress,
          categoryId: categoryInfo?.categoryId || null,
          categoryName: categoryInfo?.categoryName || null,
          parentCategoryId,
          parentCategoryName,
        };
      });

      // Filter parent categories to only those with enrolled courses
      const enrolledParentIds = new Set(courses.map(c => c.parentCategoryId).filter(Boolean));
      const relevantParentCategories = allParentCategories.filter((cat: any) => enrolledParentIds.has(cat.id));

      return {
        success: true,
        courses,
        parentCategories: relevantParentCategories,
      };
    } catch (error) {
      console.error('[getEnrolledCoursesWithCategories] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getTestsForSubject(
    subjectId: string,
    testTypes: string[],
    topicId?: string | null,
    chapterId?: string | null
  ): Promise<{ success: boolean; tests?: any[]; error?: string }> {
    try {
      console.log('[getTestsForSubject] Fetching tests for subject:', subjectId, 'types:', testTypes);
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Select tests with question count from test_questions join table
      let url = `${SUPABASE_URL}/rest/v1/tests?select=*,test_questions(count)&subject_id=eq.${subjectId}&is_active=eq.true&order=created_at.desc`;
      
      if (testTypes.length === 1) {
        url += `&test_type=eq.${testTypes[0]}`;
      } else if (testTypes.length > 1) {
        url += `&test_type=in.(${testTypes.join(',')})`;
      }

      if (topicId) {
        url += `&topic_id=eq.${topicId}`;
      } else if (chapterId) {
        url += `&chapter_id=eq.${chapterId}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('[getTestsForSubject] Response:', data?.length, 'tests found');
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch tests' };
      }
      
      // Process data to extract question count from test_questions join
      const processedTests = data.map((test: any) => ({
        ...test,
        question_count: test.test_questions?.[0]?.count || test.question_count || 0,
      }));
      
      return { success: true, tests: processedTests };
    } catch (error) {
      console.error('[getTestsForSubject] Error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getTestQuestions(testId: string): Promise<{ success: boolean; questions?: any[]; error?: string }> {
    try {
      console.log('[getTestQuestions] Fetching questions for test:', testId);
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const url = `${SUPABASE_URL}/rest/v1/test_questions?select=*,question:questions(*)&test_id=eq.${testId}&order=order_number.asc`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('[getTestQuestions] Response:', data?.length, 'questions found');
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch test questions' };
      }
      
      const questions = data.map((tq: any) => ({
        ...tq.question,
        order_number: tq.order_number,
        marks: tq.marks || tq.question?.marks || 1,
      }));
      
      return { success: true, questions };
    } catch (error) {
      console.error('[getTestQuestions] Error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getDppPastAttempts(studentId: string, topicId?: string): Promise<{ success: boolean; attempts?: any[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      let url = `${SUPABASE_URL}/rest/v1/test_results?select=*&student_id=eq.${studentId}&test_type=eq.dpp&order=submitted_at.desc&limit=10`;
      if (topicId) {
        url += `&topic_id=eq.${topicId}`;
      }

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch DPP attempts' };
      }
      return { success: true, attempts: Array.isArray(data) ? data : [] };
    } catch (error) {
      console.error('[getDppPastAttempts] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async submitTestResult(params: {
    testId: string | null;
    studentId: string;
    subjectId: string;
    topicId?: string;
    testType: string;
    score: number;
    totalQuestions: number;
    percentage: number;
    timeTakenSeconds: number;
    answers: Record<string, string>;
    gradingStatus: 'pending' | 'graded' | 'ai_graded';
  }): Promise<{ success: boolean; resultId?: string; error?: string }> {
    try {
      console.log('[submitTestResult] Submitting result for test:', params.testId);
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const body: any = {
        test_id: params.testId,
        student_id: params.studentId,
        subject_id: params.subjectId,
        test_type: params.testType,
        score: params.score,
        total_questions: params.totalQuestions,
        percentage: params.percentage,
        time_taken_seconds: params.timeTakenSeconds,
        answers: params.answers,
        grading_status: params.gradingStatus,
        submitted_at: new Date().toISOString(),
      };
      if (params.topicId) {
        body.topic_id = params.topicId;
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/test_results`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to submit test result' };
      }
      
      return { success: true, resultId: data[0]?.id };
    } catch (error) {
      console.error('[submitTestResult] Error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  async getTestResults(studentId: string): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      console.log('[getTestResults] Fetching results for student:', studentId);
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const url = `${SUPABASE_URL}/rest/v1/test_results?select=test_id,submitted_at,score,percentage,grading_status,total_questions&student_id=eq.${studentId}&order=submitted_at.desc`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('[getTestResults] Response:', data?.length, 'results found');
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch test results' };
      }
      return { success: true, results: data };
    } catch (error) {
      console.error('[getTestResults] Error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Language Topup API Methods
  async getCourseFromSubject(subjectId: string): Promise<{ 
    success: boolean; 
    course?: { 
      id: string; 
      name: string; 
      available_languages: string[]; 
      language_topup_price: number; 
      language_topup_original_price: number; 
    }; 
    error?: string 
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Get course_id from course_subjects table via subject_id
      const courseSubjectUrl = `${SUPABASE_URL}/rest/v1/course_subjects?select=course_id,courses(id,name,available_languages,language_topup_price,language_topup_original_price)&subject_id=eq.${subjectId}&limit=1`;

      const response = await fetch(courseSubjectUrl, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data || data.length === 0) {
        return { success: false, error: 'Course not found for this subject' };
      }

      const courseData = data[0]?.courses;
      if (!courseData) {
        return { success: false, error: 'Course data not available' };
      }

      return { 
        success: true, 
        course: {
          id: courseData.id,
          name: courseData.name,
          available_languages: courseData.available_languages || ['english'],
          language_topup_price: courseData.language_topup_price || 0,
          language_topup_original_price: courseData.language_topup_original_price || 0,
        }
      };
    } catch (error) {
      console.error('[getCourseFromSubject] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getLanguageTopupPurchases(courseId: string): Promise<{ 
    success: boolean; 
    purchase?: { id: string; selected_languages: string[]; status: string }; 
    error?: string 
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const storedUser = await this.getStoredUser();
      if (!storedUser) {
        return { success: false, error: 'User not found' };
      }

      console.log('[getLanguageTopupPurchases] courseId:', courseId, 'userId:', storedUser.id);

      const restUrl = `${SUPABASE_URL}/rest/v1/language_topup_purchases?select=id,selected_languages,status&course_id=eq.${courseId}&user_id=eq.${storedUser.id}&status=eq.success&limit=1`;
      const response = await fetch(restUrl, {
        method: 'GET',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('[getLanguageTopupPurchases] response:', response.status, JSON.stringify(data));

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch purchases' };
      }

      if (data && data.length > 0) {
        return { success: true, purchase: data[0] };
      }

      return { success: true, purchase: undefined };
    } catch (error) {
      console.error('[getLanguageTopupPurchases] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createLanguageTopupOrder(courseId: string, languages: string[]): Promise<{ 
    success: boolean; 
    order?: { 
      orderId: string; 
      razorpayOrderId: string; 
      razorpayKeyId: string; 
      amount: number; 
      languages: string[] 
    }; 
    error?: string 
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const storedUser = await this.getStoredUser();
      if (!storedUser) {
        return { success: false, error: 'User not found' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-topup-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            userId: storedUser.id,
            courseId,
            languages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to create order' };
      }

      return { 
        success: true, 
        order: {
          orderId: data.orderId,
          razorpayOrderId: data.razorpayOrderId,
          razorpayKeyId: data.razorpayKeyId,
          amount: data.amount,
          languages: data.languages,
        }
      };
    } catch (error) {
      console.error('[createLanguageTopupOrder] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async verifyLanguageTopupPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    orderId: string,
    courseId: string,
    languages: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const storedUser = await this.getStoredUser();
      if (!storedUser) {
        return { success: false, error: 'User not found' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-topup-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature,
            orderId,
            userId: storedUser.id,
            courseId,
            languages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Payment verification failed' };
      }

      return { success: true };
    } catch (error) {
      console.error('[verifyLanguageTopupPayment] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getTopicQuestions(topicId: string, difficulty?: string): Promise<{ success: boolean; questions?: QuestionItem[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      let url = `${SUPABASE_URL}/rest/v1/questions?select=*&topic_id=eq.${topicId}&order=created_at.asc`;
      if (difficulty && difficulty !== 'All') {
        url += `&difficulty=eq.${difficulty}`;
      }

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch questions' };
      }
      return { success: true, questions: data };
    } catch (error) {
      console.error('[getTopicQuestions] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getChapterQuestions(chapterId: string, difficulty?: string): Promise<{ success: boolean; questions?: QuestionItem[]; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      let url = `${SUPABASE_URL}/rest/v1/questions?select=*&chapter_id=eq.${chapterId}&topic_id=is.null&order=created_at.asc`;
      if (difficulty && difficulty !== 'All') {
        url += `&difficulty=eq.${difficulty}`;
      }

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch questions' };
      }
      return { success: true, questions: data };
    } catch (error) {
      console.error('[getChapterQuestions] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async gradeSubjectiveAnswer(params: {
    questionId: string;
    questionText: string;
    questionType: string;
    correctAnswer: string;
    studentAnswer: string;
    maxMarks: number;
  }): Promise<{ success: boolean; result?: SubjectiveGradeResult; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-check-answer`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question_id: params.questionId,
          question_text: params.questionText,
          question_type: params.questionType,
          correct_answer: params.correctAnswer,
          student_answer: params.studentAnswer,
          max_marks: params.maxMarks,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to grade answer' };
      }
      return { success: true, result: data };
    } catch (error) {
      console.error('[gradeSubjectiveAnswer] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createPracticeTestRecord(params: {
    subjectId?: string;
    chapterId?: string;
    topicId?: string;
    totalMarks: number;
    createdBy: string;
  }): Promise<{ success: boolean; testId?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const today = new Date().toLocaleDateString();
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tests`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          title: `Practice - ${today}`,
          test_type: 'practice',
          subject_id: params.subjectId || null,
          chapter_id: params.chapterId || null,
          topic_id: params.topicId || null,
          total_marks: params.totalMarks,
          duration_minutes: 0,
          is_active: false,
          created_by: params.createdBy,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.warn('[createPracticeTestRecord] Failed:', data);
        return { success: true, testId: undefined };
      }
      return { success: true, testId: data?.[0]?.id || undefined };
    } catch (error) {
      console.warn('[createPracticeTestRecord] Error:', error);
      return { success: true, testId: undefined };
    }
  }

  async savePracticeTestResult(params: {
    testId?: string;
    studentId: string;
    subjectId?: string;
    score: number;
    totalQuestions: number;
    percentage: number;
    answers: Record<string, string>;
    gradingStatus: 'graded' | 'pending';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/test_results`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          test_id: params.testId || null,
          student_id: params.studentId,
          subject_id: params.subjectId || null,
          test_type: 'practice',
          score: params.score,
          total_questions: params.totalQuestions,
          percentage: params.percentage,
          time_taken_seconds: null,
          answers: params.answers,
          grading_status: params.gradingStatus,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('[savePracticeTestResult] Error:', data);
        return { success: false, error: data.message || 'Failed to save result' };
      }
      return { success: true };
    } catch (error) {
      console.error('[savePracticeTestResult] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async uploadAnswerImage(params: {
    userId: string;
    questionId: string;
    imageUri: string;
    mimeType: string;
  }): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return { success: false, error: 'Not authenticated' };

      const ext = params.mimeType.split('/')[1] || 'jpg';
      const filePath = `${params.userId}/${params.questionId}_${Date.now()}.${ext}`;

      const fileResponse = await fetch(params.imageUri);
      const blob = await fileResponse.blob();

      const uploadResponse = await fetch(
        `${SUPABASE_URL}/storage/v1/object/student-answers/${filePath}`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': params.mimeType,
            'Cache-Control': '3600',
          },
          body: blob,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json().catch(() => ({}));
        return { success: false, error: err.message || 'Upload failed' };
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/student-answers/${filePath}`;
      return { success: true, publicUrl };
    } catch (error) {
      console.error('[uploadAnswerImage] Error:', error);
      return { success: false, error: 'Upload failed' };
    }
  }

  async extractAnswerFromImage(params: {
    imageUrl: string;
    questionContext: string;
  }): Promise<{ success: boolean; extractedText?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-answer-from-image`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: params.imageUrl,
          question_context: params.questionContext,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Extraction failed' };
      }

      if (data.extracted_text === 'UNREADABLE') {
        return { success: true, extractedText: '[Image answer uploaded - pending review]' };
      }
      return { success: true, extractedText: data.extracted_text };
    } catch (error) {
      console.error('[extractAnswerFromImage] Error:', error);
      return { success: true, extractedText: '[Image answer uploaded - AI extraction failed]' };
    }
  }

  async getPyqQuestions(subjectId: string, pyqType: string, _chapterId?: string, _topicId?: string, limit: number = 50, offset: number = 0): Promise<{ success: boolean; questions?: PyqQuestion[]; hasMore?: boolean; error?: string }> {
    // NOTE: chapter_id/topic_id params kept for API compat but ignored — all PYQ data is subject-level (chapter_id=null in DB)
    try {
      const accessToken = await this.getAccessToken();
      const fields = 'id,subject_id,chapter_id,topic_id,pyq_type,question_text,question_format,options,marks,difficulty,question_image_url';
      let url = `${SUPABASE_URL}/rest/v1/pyq_questions?select=${fields}&subject_id=eq.${subjectId}&pyq_type=eq.${pyqType}&order=created_at.desc&limit=${limit + 1}&offset=${offset}`;

      const headers: Record<string, string> = { ...this.headers };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch PYQ questions' };
      }

      const hasMore = data.length > limit;
      const questions = hasMore ? data.slice(0, limit) : data;

      return { success: true, questions, hasMore };
    } catch (error) {
      console.error('[getPyqQuestions] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getBlogPosts(): Promise<{ success: boolean; posts?: BlogPost[]; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/blog_posts?status=eq.published&order=published_at.desc&select=id,title,slug,meta_description,keywords,featured_image_url,published_at,notification_time,course_id,courses(name,slug)`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch blog posts' };
      }

      return { success: true, posts: data };
    } catch (error) {
      console.error('[getBlogPosts] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getBlogPostBySlug(slug: string): Promise<{ success: boolean; post?: BlogPostDetail; error?: string }> {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*,courses(name,slug)`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to fetch blog post' };
      }

      if (!data || data.length === 0) {
        return { success: false, error: 'Blog post not found' };
      }

      return { success: true, post: data[0] };
    } catch (error) {
      console.error('[getBlogPostBySlug] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async recordDailyAttendance(): Promise<{
    success: boolean;
    streak?: number;
    monthlyPercentage?: number;
    last7Days?: boolean[];
    error?: string;
  }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/record-daily-attendance?device_type=mobile`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to record attendance' };
      }

      return {
        success: true,
        streak: data.streak,
        monthlyPercentage: data.monthly_percentage,
        last7Days: data.last_7_days,
      };
    } catch (error) {
      console.error('[recordDailyAttendance] Error:', error);
      return { success: false, error: 'Network error' };
    }
  }
}

export interface PyqQuestion {
  id: string;
  subject_id: string;
  chapter_id?: string;
  topic_id?: string;
  pyq_type: 'consolidated' | 'important' | 'predictive';
  question_text: string;
  question_format: 'mcq' | 'subjective' | 'true_false';
  options?: Record<string, string | { text: string }>;
  marks?: number;
  difficulty?: 'Low' | 'Medium' | 'Intermediate' | 'Advanced';
  question_image_url?: string;
  is_verified?: boolean;
  created_at: string;
}

// Blog Types
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  meta_description: string;
  keywords: string[];
  featured_image_url: string | null;
  published_at: string;
  notification_time: string | null;
  course_id: string | null;
  courses: { name: string; slug: string } | null;
}

export interface BlogSection {
  heading: string;
  content: string;
  image_url: string | null;
}

export interface BlogPostDetail extends BlogPost {
  sections: BlogSection[];
}

// Forum Types
export interface ForumCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  subject_id: string | null;
  is_general: boolean;
  is_active: boolean;
  display_order: number;
  post_count?: number;
}

export interface ForumPost {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  content: string;
  is_answered: boolean;
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  category?: ForumCategory;
}

export interface ForumReply {
  id: string;
  post_id: string;
  author_id: string | null;
  content: string;
  is_ai_generated: boolean;
  is_accepted_answer: boolean;
  upvotes: number;
  created_at: string;
  updated_at: string;
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  has_upvoted?: boolean;
}

export interface ForumGroup {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  is_private: boolean;
  member_count: number;
  max_members?: number;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  is_member?: boolean;
  role?: 'admin' | 'member' | null;
}

export interface ForumGroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'emoji' | 'sticker' | 'gif';
  file_url: string | null;
  reply_to_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string;
  sender?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  reply_to?: ForumGroupMessage | null;
}

export interface ForumGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  user?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email?: string;
  };
}

// Forum API methods extension
class ForumService {
  async getForumCategories(): Promise<{ success: boolean; categories?: ForumCategory[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_categories?select=*,forum_posts(count)&is_active=eq.true&order=display_order.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch categories' };
      }

      const data = await response.json();
      const categories: ForumCategory[] = data.map((cat: any) => ({
        ...cat,
        post_count: cat.forum_posts?.[0]?.count || 0,
      }));

      return { success: true, categories };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getForumPosts(categoryId?: string): Promise<{ success: boolean; posts?: ForumPost[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      let url = `${SUPABASE_URL}/rest/v1/forum_posts?select=*,author:student_profiles!author_id(full_name,avatar_url),category:forum_categories!category_id(id,name,slug,is_general)&is_deleted=eq.false&order=is_pinned.desc,created_at.desc`;
      
      if (categoryId) {
        url += `&category_id=eq.${categoryId}`;
      }

      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch posts' };
      }

      const posts = await response.json();
      return { success: true, posts };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getForumPostsByCategory(categoryId: string): Promise<{ success: boolean; posts?: ForumPost[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // First fetch posts without embedded relations
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_posts?category_id=eq.${categoryId}&order=created_at.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Forum posts fetch error:', response.status, errorText);
        return { success: false, error: `Failed to fetch posts: ${response.status}` };
      }

      const posts = await response.json();
      
      // Fetch author info for each post
      if (posts.length > 0) {
        const authorIds = Array.from(new Set(posts.map((p: any) => p.author_id).filter(Boolean)));
        if (authorIds.length > 0) {
          const authorsResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/student_profiles?select=id,full_name,avatar_url&id=in.(${authorIds.map(id => `"${id}"`).join(',')})`,
            {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (authorsResponse.ok) {
            const authors = await authorsResponse.json();
            const authorsMap = new Map(authors.map((a: any) => [a.id, a]));
            posts.forEach((post: any) => {
              const author = authorsMap.get(post.author_id);
              post.author = author || { full_name: null, avatar_url: null };
            });
          }
        }
      }
      
      return { success: true, posts };
    } catch (error) {
      console.error('Forum posts network error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getForumPost(postId: string): Promise<{ success: boolean; post?: ForumPost; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Increment view count (fire and forget - don't block on errors)
      fetch(
        `${SUPABASE_URL}/rest/v1/forum_posts?id=eq.${postId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ view_count: 'view_count + 1' }),
        }
      ).catch(() => {});

      // Fetch the post
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_posts?id=eq.${postId}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Forum post fetch error:', response.status, errorText);
        return { success: false, error: 'Failed to fetch post' };
      }

      const data = await response.json();
      if (data.length === 0) {
        return { success: false, error: 'Post not found' };
      }

      const post = data[0];

      // Fetch author info
      if (post.author_id) {
        const authorResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/student_profiles?select=id,full_name,avatar_url&id=eq.${post.author_id}`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (authorResponse.ok) {
          const authors = await authorResponse.json();
          post.author = authors[0] || { full_name: null, avatar_url: null };
        }
      }

      // Fetch category info
      if (post.category_id) {
        const categoryResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/forum_categories?select=id,name,slug,is_general&id=eq.${post.category_id}`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (categoryResponse.ok) {
          const categories = await categoryResponse.json();
          post.category = categories[0] || null;
        }
      }

      return { success: true, post };
    } catch (error) {
      console.error('Forum post network error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createForumPost(categoryId: string, title: string, content: string): Promise<{ success: boolean; post?: ForumPost; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_posts`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            category_id: categoryId,
            author_id: user.id,
            title,
            content,
          }),
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to create post' };
      }

      const data = await response.json();
      return { success: true, post: data[0] };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getForumReplies(postId: string): Promise<{ success: boolean; replies?: ForumReply[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const userId = userData ? JSON.parse(userData).id : null;

      // Fetch replies without embedded relations
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_replies?post_id=eq.${postId}&order=is_accepted_answer.desc,upvotes.desc,created_at.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Forum replies fetch error:', response.status, errorText);
        return { success: false, error: 'Failed to fetch replies' };
      }

      const replies = await response.json();

      // Fetch author info for each reply
      if (replies.length > 0) {
        const authorIds = Array.from(new Set(replies.map((r: any) => r.author_id).filter(Boolean)));
        if (authorIds.length > 0) {
          const authorsResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/student_profiles?select=id,full_name,avatar_url&id=in.(${authorIds.map(id => `"${id}"`).join(',')})`,
            {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (authorsResponse.ok) {
            const authors = await authorsResponse.json();
            const authorsMap = new Map(authors.map((a: any) => [a.id, a]));
            replies.forEach((reply: any) => {
              const author = authorsMap.get(reply.author_id);
              reply.author = author || { full_name: null, avatar_url: null };
            });
          }
        }
      }

      // Check which replies user has upvoted (only if there are replies)
      if (userId && replies.length > 0) {
        const replyIds = replies.map((r: any) => `"${r.id}"`).join(',');
        const upvotesResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/forum_upvotes?select=reply_id&user_id=eq.${userId}&reply_id=in.(${replyIds})`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (upvotesResponse.ok) {
          const upvotes = await upvotesResponse.json();
          const upvotedIds = new Set(upvotes.map((u: any) => u.reply_id));
          replies.forEach((r: any) => {
            r.has_upvoted = upvotedIds.has(r.id);
          });
        }
      }

      return { success: true, replies };
    } catch (error) {
      console.error('Forum replies network error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createForumReply(postId: string, content: string): Promise<{ success: boolean; reply?: ForumReply; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_replies`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            post_id: postId,
            author_id: user.id,
            content,
          }),
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to create reply' };
      }

      const data = await response.json();
      return { success: true, reply: data[0] };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async toggleUpvote(replyId: string): Promise<{ success: boolean; upvoted?: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      // Check if already upvoted
      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_upvotes?reply_id=eq.${replyId}&user_id=eq.${user.id}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const existing = await checkResponse.json();

      if (existing.length > 0) {
        // Remove upvote
        await fetch(
          `${SUPABASE_URL}/rest/v1/forum_upvotes?reply_id=eq.${replyId}&user_id=eq.${user.id}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        return { success: true, upvoted: false };
      } else {
        // Add upvote
        await fetch(
          `${SUPABASE_URL}/rest/v1/forum_upvotes`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              reply_id: replyId,
              user_id: user.id,
            }),
          }
        );
        return { success: true, upvoted: true };
      }
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async acceptAnswer(replyId: string, postId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      // Mark reply as accepted
      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_replies?id=eq.${replyId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_accepted_answer: true }),
        }
      );

      // Mark post as answered
      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_posts?id=eq.${postId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_answered: true }),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getForumGroups(): Promise<{ success: boolean; groups?: ForumGroup[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const userId = userData ? JSON.parse(userData).id : null;

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_groups?select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch groups' };
      }

      let groups = await response.json();

      // Check membership status
      if (userId) {
        const membershipResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/forum_group_members?select=group_id,role&user_id=eq.${userId}`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (membershipResponse.ok) {
          const memberships = await membershipResponse.json();
          const membershipMap = new Map(memberships.map((m: any) => [m.group_id, m.role]));
          groups = groups.map((g: any) => ({
            ...g,
            is_member: membershipMap.has(g.id),
            role: membershipMap.get(g.id) || null,
          }));
        }
      }

      return { success: true, groups };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async createForumGroup(name: string, description: string, isPrivate: boolean): Promise<{ success: boolean; group?: ForumGroup; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_groups`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            name,
            description,
            is_private: isPrivate,
            created_by: user.id,
            member_count: 1,
          }),
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to create group' };
      }

      const data = await response.json();
      const group = data[0];

      // Add creator as admin member
      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            group_id: group.id,
            user_id: user.id,
            role: 'admin',
          }),
        }
      );

      return { success: true, group: { ...group, is_member: true, role: 'admin' } };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async joinGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            group_id: groupId,
            user_id: user.id,
            role: 'member',
          }),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async leaveGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members?group_id=eq.${groupId}&user_id=eq.${user.id}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async flagContent(postId: string | null, replyId: string | null, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_flags`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_id: postId,
            reply_id: replyId,
            flagged_by: user.id,
            reason,
            status: 'pending',
          }),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getGroupDetails(groupId: string): Promise<{ success: boolean; group?: ForumGroup; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const userId = userData ? JSON.parse(userData).id : null;

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_groups?id=eq.${groupId}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch group' };
      }

      const data = await response.json();
      if (data.length === 0) {
        return { success: false, error: 'Group not found' };
      }

      let group = data[0];

      if (userId) {
        const membershipResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/forum_group_members?group_id=eq.${groupId}&user_id=eq.${userId}&select=role`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (membershipResponse.ok) {
          const membership = await membershipResponse.json();
          group = {
            ...group,
            is_member: membership.length > 0,
            role: membership.length > 0 ? membership[0].role : null,
          };
        }
      }

      return { success: true, group };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getGroupMessages(groupId: string): Promise<{ success: boolean; messages?: ForumGroupMessage[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_messages?group_id=eq.${groupId}&select=*&order=created_at.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch messages' };
      }

      let messages = await response.json();

      if (messages.length > 0) {
        const senderIds = Array.from(new Set(messages.map((m: any) => m.sender_id).filter(Boolean)));
        if (senderIds.length > 0) {
          const profilesResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/student_profiles?id=in.(${senderIds.map(id => `"${id}"`).join(',')})&select=id,full_name,avatar_url`,
            {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (profilesResponse.ok) {
            const profiles = await profilesResponse.json();
            const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
            messages = messages.map((m: any) => ({
              ...m,
              sender: profileMap.get(m.sender_id) || null,
            }));
          }
        }
      }

      return { success: true, messages };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async sendGroupMessage(
    groupId: string, 
    content: string, 
    messageType: 'text' | 'image' | 'file' | 'emoji' | 'sticker' | 'gif' = 'text',
    fileUrl?: string,
    replyToId?: string
  ): Promise<{ success: boolean; message?: ForumGroupMessage; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!accessToken || !userData) {
        return { success: false, error: 'Not authenticated' };
      }

      const user = JSON.parse(userData);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_messages`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            group_id: groupId,
            sender_id: user.id,
            content,
            message_type: messageType,
            file_url: fileUrl || null,
            reply_to_id: replyToId || null,
          }),
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to send message' };
      }

      const data = await response.json();
      return { success: true, message: data[0] };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async deleteGroupMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_messages?id=eq.${messageId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_deleted: true }),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getGroupMembers(groupId: string): Promise<{ success: boolean; members?: ForumGroupMember[]; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members?group_id=eq.${groupId}&select=*&order=role.asc,joined_at.asc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch members' };
      }

      let members = await response.json();

      if (members.length > 0) {
        const userIds = members.map((m: any) => m.user_id);
        const profilesResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/student_profiles?id=in.(${userIds.map((id: string) => `"${id}"`).join(',')})&select=id,full_name,avatar_url`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (profilesResponse.ok) {
          const profiles = await profilesResponse.json();
          const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
          members = members.map((m: any) => ({
            ...m,
            user: profileMap.get(m.user_id) || { id: m.user_id, full_name: null, avatar_url: null },
          }));
        }
      }

      return { success: true, members };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async addGroupMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            group_id: groupId,
            user_id: userId,
            role,
          }),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async removeGroupMember(groupId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members?group_id=eq.${groupId}&user_id=eq.${userId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async updateMemberRole(groupId: string, userId: string, role: 'admin' | 'member'): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_group_members?group_id=eq.${groupId}&user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async updateGroup(groupId: string, updates: { name?: string; description?: string; avatar_url?: string; is_private?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await supabase.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      await fetch(
        `${SUPABASE_URL}/rest/v1/forum_groups?id=eq.${groupId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
}

export const forumService = new ForumService();

export const supabase = new SupabaseService();

// Centralized accessor for modules outside SupabaseService. Routes every
// authenticated request through the same proactive token refresh in
// getAccessToken(), so direct callers never send an expired JWT.
export async function getValidAccessToken(): Promise<string | null> {
  return supabase.getAccessToken();
}

// --- Reactive refresh-and-retry interceptor -------------------------------
// Even with proactive refresh, a token can still be rejected mid-flight
// (clock skew, server-side invalidation while the refresh token is valid,
// races). This installs a single global fetch wrapper that, ONLY for our
// authenticated Supabase requests, transparently refreshes once and retries
// the original request on a 401 — so no authenticated call site ever surfaces
// a "JWT expired" failure, without having to edit every call site.
function readHeaderValue(headers: any, name: string): string | null {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return null;
}

function withHeaderValue(headers: any, name: string, value: string): any {
  if (headers && typeof headers.set === 'function') {
    const next = new Headers(headers as Headers);
    next.set(name, value);
    return next;
  }
  const copy: Record<string, string> = { ...(headers || {}) };
  const lower = name.toLowerCase();
  for (const key of Object.keys(copy)) {
    if (key.toLowerCase() === lower) delete copy[key];
  }
  copy[name] = value;
  return copy;
}

function installAuthRetryInterceptor(): void {
  const g: any = globalThis as any;
  if (g.__slAuthRetryFetchInstalled || typeof g.fetch !== 'function') return;
  g.__slAuthRetryFetchInstalled = true;

  const originalFetch: typeof fetch = g.fetch.bind(g);

  g.fetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const authHeader = readHeaderValue(init && init.headers, 'Authorization');
    const isOurAuthedRequest =
      typeof url === 'string' &&
      url.startsWith(SUPABASE_URL) &&
      !!authHeader &&
      /^Bearer\s+/i.test(authHeader) &&
      !(init && init.__slAuthRetried);

    const response = await originalFetch(input, init);

    if (!isOurAuthedRequest || response.status !== 401) {
      return response;
    }

    // Skip anonymous requests (apikey only) — there's no user session to refresh.
    const sentToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!sentToken || sentToken === SUPABASE_ANON_KEY) {
      return response;
    }

    // refreshSession() is single-flight, so concurrent 401s share one refresh.
    const refreshed = await supabase.refreshSession();
    if (!refreshed.success) {
      return response;
    }
    const newToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!newToken) {
      return response;
    }

    const retryInit = { ...(init || {}), __slAuthRetried: true };
    retryInit.headers = withHeaderValue(init && init.headers, 'Authorization', `Bearer ${newToken}`);
    return originalFetch(input, retryInit);
  };
}

installAuthRetryInterceptor();
