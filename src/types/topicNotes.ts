/**
 * Types for the AI Study Notes feature.
 *
 * Notes are generated from presentation_json.sections of the latest published
 * + completed video_generation_jobs row for the selected topic.
 * They are NOT personal user annotations.
 */

export interface TopicNoteSection {
  section_id?: string | number;
  section_type?: string;
  title?: string;
  narration?: {
    full_text?: string;
    segments?: Array<{
      text?: string;
      purpose?: string;
      duration_seconds?: number;
    }>;
  };
  visual_beats?: Array<{
    visual_type?: string;
    display_text?: unknown;
    image_url?: string;
    latex?: string;
    start_time?: number;
    end_time?: number;
  }>;
  summary?: unknown;
  key_points?: unknown;
}

export interface NotesQuestion {
  id: string;
  question_text: string;
  is_important: boolean;
  subtopic_id: string | null;
  difficulty: string;
  explanation: string | null;
  options: Record<string, { text: string } | string> | null;
  correct_answer: string;
  question_type?: string | null;
  question_format?: string | null;
  is_ai_generated?: boolean | null;
  is_verified?: boolean | null;
}

export interface NotesBulletItem {
  text: string;
}

export interface NotesCallout {
  type: 'definition' | 'formula' | 'equation';
  text: string;
}

export interface NotesImage {
  url: string;
}

/** A single rendered page produced from one or more section chunks. */
export interface NotePage {
  /** Stable key: `${sectionId}-${pageInSection}` */
  id: string;
  sectionIndex: number;
  sectionId: string;
  sectionTitle: string;
  sectionType: string;
  isFirstPageOfSection: boolean;
  isLastPageOfSection: boolean;
  /** 0-based page within the section */
  pageInSection: number;
  totalPagesInSection: number;
  /** Cleaned narration prose for this page only */
  prose: string;
  /** Callouts appear on the FIRST page of each section */
  callouts: NotesCallout[];
  /** Bullets appear on the LAST page of each section */
  bullets: NotesBulletItem[];
  /** Images appear on the LAST page of each section */
  images: NotesImage[];
  /** Questions appear on the LAST page of each section */
  questions: {
    important: NotesQuestion[];
    practice: NotesQuestion[];
  };
}

export interface TopicNotesState {
  loading: boolean;
  pages: NotePage[];
  sectionTitles: string[];
  sectionFirstPageIndexes: number[];
  error: string | null;
  jobTitle: string | null;
  isEmpty: boolean;
}
