/**
 * Regression tests for normalizeAITeachingResponse's handling of the
 * TOP-LEVEL media maps the AI Teaching API actually returns.
 *
 * Verified against the live endpoint (cached L1_redis response): Manim videos
 * are NOT per-slide fields — they arrive as a top-level `manimVideoUrls`
 * object keyed by the raw slide index as a string, each entry carrying
 * `{ url, duration_seconds }`. Slide images are duplicated in a top-level
 * `imageUrls` map the same way. Cached responses are camelCase; fresh ones
 * may be snake_case (`manim_video_urls` / `image_urls`).
 */
import { supabase } from '../supabase';

const normalize = (raw: any) => (supabase as any).normalizeAITeachingResponse(raw);

const B2 = 'https://s3.example.com/ai-teaching/job-1';

function slide(i: number, extra: any = {}) {
  return {
    title: `Slide ${i}`,
    content: `Content ${i}`,
    narration: `Narration ${i}`,
    keyPoints: [`kp ${i}`],
    infographicUrl: `${B2}/slide_${i}.png`,
    audioUrl: `${B2}/audio_${i}.wav`,
    duration: 10 + i,
    ...extra,
  };
}

describe('normalizeAITeachingResponse — top-level media maps', () => {
  it('overlays camelCase manimVideoUrls onto the right slides (cached shape)', () => {
    const raw = {
      cached: true,
      presentationSlides: [slide(0), slide(1), slide(2)],
      manimVideoUrls: {
        '1': { url: `${B2}/manim_1.mp4`, local_mp4: '/sdb/x.mp4', duration_seconds: 14.08 },
        '2': { url: `${B2}/manim_2.mp4`, duration_seconds: 13.92 },
      },
      imageUrls: {
        '0': { url: `${B2}/slide_0.png` },
        '1': { url: `${B2}/slide_1.png` },
        '2': { url: `${B2}/slide_2.png` },
      },
    };
    const out = normalize(raw);
    expect(out.presentationSlides).toHaveLength(3);
    expect(out.presentationSlides[0].manimVideoUrl).toBeUndefined();
    expect(out.presentationSlides[1].manimVideoUrl).toBe(`${B2}/manim_1.mp4`);
    expect(out.presentationSlides[1].manimDurationSeconds).toBeCloseTo(14.08);
    expect(out.presentationSlides[2].manimVideoUrl).toBe(`${B2}/manim_2.mp4`);
  });

  it('handles snake_case manim_video_urls / image_urls (fresh shape)', () => {
    const raw = {
      presentation_slides: [
        slide(0, { infographicUrl: undefined, infographic_url: undefined, audioUrl: undefined, key_points: ['kp'] }),
        slide(1, { key_points: ['kp'] }),
      ],
      manim_video_urls: { '0': { url: `${B2}/manim_0.mp4`, duration_seconds: 9.5 } },
      image_urls: { '0': { url: `${B2}/slide_0.png` } },
    };
    const out = normalize(raw);
    expect(out.presentationSlides[0].manimVideoUrl).toBe(`${B2}/manim_0.mp4`);
    expect(out.presentationSlides[0].manimDurationSeconds).toBeCloseTo(9.5);
    // Slide 0 had no infographicUrl of its own — backfilled from image_urls.
    expect(out.presentationSlides[0].infographicUrl).toBe(`${B2}/slide_0.png`);
    // Slide 1 keeps its own URL, not overwritten.
    expect(out.presentationSlides[1].infographicUrl).toBe(`${B2}/slide_1.png`);
  });

  it('map indices refer to RAW slide order, surviving the key-point filter', () => {
    const raw = {
      presentationSlides: [
        slide(0, { keyPoints: [] }), // filtered out
        slide(1),
        slide(2),
      ],
      manimVideoUrls: { '1': { url: `${B2}/manim_1.mp4`, duration_seconds: 5 } },
    };
    const out = normalize(raw);
    // Slide 0 was filtered; the video attached to raw index 1 must follow that slide.
    expect(out.presentationSlides).toHaveLength(2);
    expect(out.presentationSlides[0].title).toBe('Slide 1');
    expect(out.presentationSlides[0].manimVideoUrl).toBe(`${B2}/manim_1.mp4`);
  });

  it('per-slide manimVideoUrl (if upstream ever adds it) wins over the map', () => {
    const raw = {
      presentationSlides: [slide(0, { manimVideoUrl: `${B2}/inline.mp4`, manimDurationSeconds: 3 })],
      manimVideoUrls: { '0': { url: `${B2}/map.mp4`, duration_seconds: 99 } },
    };
    const out = normalize(raw);
    expect(out.presentationSlides[0].manimVideoUrl).toBe(`${B2}/inline.mp4`);
    expect(out.presentationSlides[0].manimDurationSeconds).toBe(3);
  });

  it('reads exam tip / real-life example from the NEW field names', () => {
    const out = normalize({
      presentationSlides: [slide(0)],
      exam_tip: 'Focus on the 1757 timeline.',
      real_life_example: 'Like a **modern** boardroom coup: $x$',
    });
    expect(out.examTip).toBe('Focus on the 1757 timeline.');
    expect(out.realLifeExample).toBe('Like a **modern** boardroom coup: $x$');
  });

  it('falls back to the OLD cached names (quick_tip / example)', () => {
    const out = normalize({
      presentationSlides: [slide(0)],
      quick_tip: 'Old tip',
      example: 'Old example',
    });
    expect(out.examTip).toBe('Old tip');
    expect(out.realLifeExample).toBe('Old example');
  });

  it('prefers new names over old ones when both are present', () => {
    const out = normalize({
      presentationSlides: [slide(0)],
      exam_tip: 'New tip',
      quick_tip: 'Old tip',
      real_life_example: 'New example',
      example: 'Old example',
    });
    expect(out.examTip).toBe('New tip');
    expect(out.realLifeExample).toBe('New example');
  });

  it('leaves the fields undefined when absent (current live responses)', () => {
    const out = normalize({ presentationSlides: [slide(0)] });
    expect(out.examTip).toBeUndefined();
    expect(out.realLifeExample).toBeUndefined();
  });

  it('tolerates missing/empty/array-shaped maps without breaking slides', () => {
    for (const weird of [undefined, null, {}, [], 'nope']) {
      const out = normalize({ presentationSlides: [slide(0)], manimVideoUrls: weird, imageUrls: weird });
      expect(out.presentationSlides).toHaveLength(1);
      expect(out.presentationSlides[0].manimVideoUrl).toBeUndefined();
    }
  });
});
