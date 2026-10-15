import { useMemo } from 'react';
import { V4NarrationSegment } from '../services/v4PlayerService';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  sentenceIndex: number;
}

export interface KaraokeState {
  words: WordTiming[];
  activeSentenceIndex: number;
  activeWordIndex: number;
}

const LEAD_MS = 0.08;

function charWeight(char: string): number {
  if ('.!?'.includes(char)) return 8;
  if (',;:'.includes(char)) return 4;
  return 1;
}

function segmentWeight(text: string): number {
  let w = 0;
  for (const c of text) w += charWeight(c);
  return Math.max(w, 1);
}

export function buildWordTimings(segments: V4NarrationSegment[]): WordTiming[] {
  const timings: WordTiming[] = [];
  let sentenceIdx = 0;

  for (const seg of segments) {
    const segStart = seg.start_seconds ?? 0;
    const segDur = seg.duration_seconds ?? seg.duration ?? 0;
    if (!seg.text || segDur <= 0) continue;

    const rawWords = seg.text.trim().split(/\s+/);
    if (rawWords.length === 0) continue;

    const totalWeight = rawWords.reduce((s, w) => s + segmentWeight(w), 0);
    let cursor = segStart - LEAD_MS;

    for (let i = 0; i < rawWords.length; i++) {
      const word = rawWords[i];
      const w = segmentWeight(word);
      const dur = (w / totalWeight) * segDur;
      timings.push({
        word,
        start: cursor,
        end: cursor + dur,
        sentenceIndex: sentenceIdx,
      });
      cursor += dur;
      if (/[.!?]$/.test(word)) sentenceIdx++;
    }
  }

  return timings;
}

export function getKaraokeState(timings: WordTiming[], currentTime: number): KaraokeState {
  let activeWordIndex = -1;
  let activeSentenceIndex = 0;

  for (let i = 0; i < timings.length; i++) {
    if (currentTime >= timings[i].start) {
      activeWordIndex = i;
      activeSentenceIndex = timings[i].sentenceIndex;
    } else {
      break;
    }
  }

  return { words: timings, activeSentenceIndex, activeWordIndex };
}

export function useV4Karaoke(segments: V4NarrationSegment[]): WordTiming[] {
  return useMemo(() => buildWordTimings(segments), [segments]);
}
