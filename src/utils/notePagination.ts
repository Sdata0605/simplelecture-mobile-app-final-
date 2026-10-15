/**
 * Pure pagination logic for AI Study Notes.
 *
 * buildNotePages() converts presentation_json sections + bucketed questions
 * into an array of NotePage objects ready for the book reader.
 *
 * All functions are side-effect-free and unit-testable.
 */

import {
  TopicNoteSection,
  NotePage,
  NotesBulletItem,
  NotesCallout,
  NotesImage,
  NotesQuestion,
} from '../types/topicNotes';
import { cleanNarrationText, toDisplayString } from './noteText';

/** Approximate character limit per page of prose. */
export const PAGE_CHAR_LIMIT = 900;

// ---------------------------------------------------------------------------
// Section field extractors
// ---------------------------------------------------------------------------

function extractBullets(section: TopicNoteSection): NotesBulletItem[] {
  const results: NotesBulletItem[] = [];
  const beats = section.visual_beats ?? [];

  for (const beat of beats) {
    if (!beat) continue;
    const vt = (beat.visual_type ?? '').toLowerCase();
    const isBullet =
      vt === 'bullet' ||
      vt === 'bullets' ||
      vt === 'list' ||
      vt === 'key_points' ||
      vt.includes('bullet');
    if (!isBullet) continue;

    const raw = toDisplayString(beat.display_text);
    if (!raw) continue;

    // Each newline is a separate bullet
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => results.push({ text: line }));
  }

  // key_points at section level
  if (section.key_points) {
    const kp = toDisplayString(section.key_points);
    kp
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (!results.some((b) => b.text === line)) {
          results.push({ text: line });
        }
      });
  }

  return results;
}

function extractCallouts(section: TopicNoteSection): NotesCallout[] {
  const beats = section.visual_beats ?? [];
  const results: NotesCallout[] = [];

  for (const beat of beats) {
    if (!beat) continue;
    const vt = (beat.visual_type ?? '').toLowerCase();
    let type: 'definition' | 'formula' | 'equation' | null = null;
    if (vt === 'definition') type = 'definition';
    else if (vt === 'formula') type = 'formula';
    else if (vt === 'equation') type = 'equation';
    if (!type) continue;

    const text =
      toDisplayString(beat.display_text) ||
      (typeof beat.latex === 'string' ? beat.latex : '');
    if (text) results.push({ type, text });
  }

  return results;
}

function extractImages(section: TopicNoteSection): NotesImage[] {
  const beats = section.visual_beats ?? [];
  return beats
    .filter(
      (b) =>
        b &&
        typeof b.image_url === 'string' &&
        b.image_url.startsWith('http'),
    )
    .map((b) => ({ url: b.image_url! }));
}

function buildNarrationText(section: TopicNoteSection): string {
  try {
    const segs = section.narration?.segments;
    if (Array.isArray(segs) && segs.length > 0) {
      const joined = segs
        .map((s) => (typeof s.text === 'string' ? s.text : ''))
        .filter(Boolean)
        .join(' ');
      return cleanNarrationText(joined);
    }
    const full = section.narration?.full_text;
    if (typeof full === 'string' && full) return cleanNarrationText(full);
  } catch {
    // tolerate malformed narration
  }
  return '';
}

// ---------------------------------------------------------------------------
// Prose chunking
// ---------------------------------------------------------------------------

/**
 * Split a cleaned multi-paragraph narration string into chunks that each fit
 * within `limit` characters. Never splits in the middle of a word.
 *
 * - Respects \n\n paragraph boundaries first.
 * - Long paragraphs are further split at word boundaries.
 */
export function splitIntoParagraphChunks(
  text: string,
  limit = PAGE_CHAR_LIMIT,
): string[] {
  if (!text) return [];

  const paragraphs = text.split('\n\n').filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const addition = current ? `\n\n${para}` : para;
    if (current.length + addition.length <= limit) {
      current += addition;
    } else {
      // Flush current before this paragraph
      if (current) {
        chunks.push(current);
        current = '';
      }
      // If a single paragraph still exceeds the limit, split at word boundaries
      if (para.length <= limit) {
        current = para;
      } else {
        const words = para.split(' ');
        let line = '';
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (candidate.length <= limit) {
            line = candidate;
          } else {
            if (line) chunks.push(line);
            line = word; // start new chunk (single long word is pushed as-is)
          }
        }
        if (line) current = line;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ---------------------------------------------------------------------------
// Main page builder
// ---------------------------------------------------------------------------

/**
 * Convert an array of presentation sections + per-section questions into
 * an array of NotePage objects ready for the reader.
 *
 * Rules:
 * - Callouts go on the FIRST page of each section.
 * - Bullets, images, and questions go on the LAST page of each section.
 * - Middle pages (if narration is long) display prose only.
 * - No blank pages are emitted.
 */
export function buildNotePages(
  sections: TopicNoteSection[],
  questionsBySection: Map<string, NotesQuestion[]>,
): NotePage[] {
  const pages: NotePage[] = [];

  sections.forEach((section, sectionIndex) => {
    const sectionId = String(section.section_id ?? sectionIndex);
    const sectionTitle = section.title ?? `Section ${sectionIndex + 1}`;
    const sectionType = section.section_type ?? 'content';

    const narration = buildNarrationText(section);
    const bullets = extractBullets(section);
    const callouts = extractCallouts(section);
    const images = extractImages(section);

    const allQ = questionsBySection.get(sectionId) ?? [];
    const important = allQ.filter((q) => q.is_important).slice(0, 2);
    const practice = allQ.filter((q) => !q.is_important).slice(0, 3);

    // At minimum one chunk so every section gets at least one page
    const chunks = splitIntoParagraphChunks(narration);
    if (chunks.length === 0) chunks.push('');

    const totalPages = chunks.length;

    chunks.forEach((chunk, pageInSection) => {
      const isFirst = pageInSection === 0;
      const isLast = pageInSection === totalPages - 1;

      const page: NotePage = {
        id: `${sectionId}-${pageInSection}`,
        sectionIndex,
        sectionId,
        sectionTitle,
        sectionType,
        isFirstPageOfSection: isFirst,
        isLastPageOfSection: isLast,
        pageInSection,
        totalPagesInSection: totalPages,
        prose: chunk,
        callouts: isFirst ? callouts : [],
        bullets: isLast ? bullets : [],
        images: isLast ? images : [],
        questions: isLast
          ? { important, practice }
          : { important: [], practice: [] },
      };

      const hasContent =
        page.prose ||
        page.callouts.length > 0 ||
        page.bullets.length > 0 ||
        page.images.length > 0 ||
        page.questions.important.length > 0 ||
        page.questions.practice.length > 0;

      // Always emit the first page of a section even if content is thin
      if (hasContent || isFirst) {
        pages.push(page);
      }
    });
  });

  return pages;
}

// ---------------------------------------------------------------------------
// Section merging (one page per section)
// ---------------------------------------------------------------------------

/**
 * Merge an already-built pages array back into ONE NotePage per section.
 * Used by the reader to show a whole section on a single (vertically
 * scrollable) screen. Prose chunks are re-joined with paragraph breaks;
 * callouts/bullets/images/questions are collected across the section's pages.
 */
export function mergePagesIntoSectionPages(pages: NotePage[]): NotePage[] {
  const bySection = new Map<string, NotePage>();
  const order: string[] = [];

  for (const page of pages) {
    const existing = bySection.get(page.sectionId);
    if (!existing) {
      order.push(page.sectionId);
      bySection.set(page.sectionId, {
        ...page,
        id: `${page.sectionId}-full`,
        isFirstPageOfSection: true,
        isLastPageOfSection: true,
        pageInSection: 0,
        totalPagesInSection: 1,
        prose: page.prose,
        callouts: [...page.callouts],
        bullets: [...page.bullets],
        images: [...page.images],
        questions: {
          important: [...page.questions.important],
          practice: [...page.questions.practice],
        },
      });
      continue;
    }
    if (page.prose) {
      existing.prose = existing.prose
        ? `${existing.prose}\n\n${page.prose}`
        : page.prose;
    }
    existing.callouts.push(...page.callouts);
    existing.bullets.push(...page.bullets);
    existing.images.push(...page.images);
    existing.questions.important.push(...page.questions.important);
    existing.questions.practice.push(...page.questions.practice);
  }

  return order.map((id, sectionIndex) => {
    const merged = bySection.get(id)!;
    merged.sectionIndex = sectionIndex;
    return merged;
  });
}

// ---------------------------------------------------------------------------
// Section index
// ---------------------------------------------------------------------------

/**
 * Build parallel arrays of section titles and their first-page indexes
 * from an already-built pages array.
 */
export function buildSectionIndex(pages: NotePage[]): {
  sectionTitles: string[];
  sectionFirstPageIndexes: number[];
} {
  const seen = new Set<string>();
  const sectionTitles: string[] = [];
  const sectionFirstPageIndexes: number[] = [];

  pages.forEach((page, idx) => {
    if (!seen.has(page.sectionId)) {
      seen.add(page.sectionId);
      sectionTitles.push(page.sectionTitle);
      sectionFirstPageIndexes.push(idx);
    }
  });

  return { sectionTitles, sectionFirstPageIndexes };
}
