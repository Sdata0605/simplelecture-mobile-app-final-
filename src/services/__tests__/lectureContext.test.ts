import { buildSectionTimeline, getTimelinePosition, type V5Section } from '../v5PlayerService';
import { buildAskContext, getSectionNarration } from '../askAssistant/lectureContext';

const sections: V5Section[] = [
  {
    section_id: 1,
    title: 'Introduction',
    key_points: ['What is a revolution?'],
    narration: { total_duration_seconds: 30, segments: [{ text: 'Welcome.' }, { text: 'Today we begin.' }] },
  },
  {
    section_id: 2,
    title: '  Causes  ',
    key_points: [{ text: 'Heavy taxes' }, 'Bread prices'],
    narration: { total_duration_seconds: 60, segments: [{ text: 'The peasants paid most tax.' }, { text: '  ' }, { text: 'Prices rose.' }] },
  },
];

describe('getSectionNarration', () => {
  it('joins the spoken segments and skips empty ones', () => {
    expect(getSectionNarration(sections[1])).toBe('The peasants paid most tax. Prices rose.');
    expect(getSectionNarration({ section_id: 9 })).toBe('');
  });
});

describe('buildAskContext', () => {
  const timeline = buildSectionTimeline(sections, null);

  it('describes the section being played when the student taps Ask AI', () => {
    const { active } = getTimelinePosition(timeline, 45, 90); // 45 s of a 90 s lecture: the second section
    expect(buildAskContext(timeline, active, 45, 90)).toMatchObject({
      currentTime: 45,
      duration: 90,
      sectionIndex: 2,
      sectionCount: 2,
      sectionTitle: 'Causes',
      keyPoints: ['Heavy taxes', 'Bread prices'],
      narration: 'The peasants paid most tax. Prices rose.',
    });
  });

  it('still returns something usable with no active section or no duration yet', () => {
    expect(buildAskContext([], null, Number.NaN, Number.NaN)).toEqual({
      currentTime: 0,
      duration: 0,
      sectionIndex: 0,
      sectionCount: 0,
      sectionTitle: undefined,
      keyPoints: [],
      narration: '',
    });
  });
});
