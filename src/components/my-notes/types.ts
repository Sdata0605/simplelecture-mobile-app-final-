/**
 * Shared client-side types for the My Notes feature UI.
 *
 * These mirror the shapes the screens expect from
 * `services/studentNotesService.ts` and `hooks/useStudentNoteEditor.ts`
 * (which are owned/implemented separately). They are declared here so the
 * navigation + screen layer stays typed and self-contained.
 */

export interface EnrolledCourseNotebook {
  course_id: string;
  course_name: string;
  course_slug?: string | null;
  thumbnail_url?: string | null;
  short_description?: string | null;
  duration_months?: number | null;
  enrolled_at?: string | null;
  progress?: number | null;
}

export interface CourseNotebookSubject {
  /** course_subjects.id */
  id: string;
  course_id: string;
  subject_id: string;
  display_order?: number | null;
  subject: {
    id: string;
    name: string;
    thumbnail_url?: string | null;
  };
}

export interface NotebookChapter {
  id: string;
  subject_id: string;
  chapter_number: number;
  title: string;
  sequence_order?: number | null;
  description?: string | null;
}

/** Context passed to the note editor hook / load / delete helpers. */
export interface ChapterNotebookContext {
  userId: string;
  subjectId: string;
  chapterId: string;
}
