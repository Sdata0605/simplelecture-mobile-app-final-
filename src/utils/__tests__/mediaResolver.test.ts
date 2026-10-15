import {
  getYouTubeVideoId,
  isYouTubeUrl,
  resolveMediaPath,
  extractJobIdFromUrl,
  getCdnMediaUrl,
} from '../mediaResolver';

const ID = 'dQw4w9WgXcQ'; // 11 chars

describe('getYouTubeVideoId', () => {
  it('extracts the id from every common YouTube URL shape', () => {
    expect(getYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://www.youtube.com/v/${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(getYouTubeVideoId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('accepts a bare 11-character id', () => {
    expect(getYouTubeVideoId(ID)).toBe(ID);
  });

  it('returns null for non-YouTube and invalid inputs', () => {
    expect(getYouTubeVideoId('https://zoom.us/j/123456')).toBeNull();
    expect(getYouTubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(getYouTubeVideoId('https://youtu.be/short')).toBeNull(); // not 11 chars
    expect(getYouTubeVideoId(null)).toBeNull();
    expect(getYouTubeVideoId(undefined)).toBeNull();
    expect(getYouTubeVideoId('')).toBeNull();
  });

  it('isYouTubeUrl mirrors getYouTubeVideoId', () => {
    expect(isYouTubeUrl(`https://youtu.be/${ID}`)).toBe(true);
    expect(isYouTubeUrl('https://zoom.us/j/1')).toBe(false);
  });
});

describe('resolveMediaPath', () => {
  it('prefixes the avatar folder and adds .mp4 when missing', () => {
    expect(resolveMediaPath('section_1_avatar', 'avatar')).toBe('avatars/section_1_avatar.mp4');
  });

  it('prefixes the videos folder by default', () => {
    expect(resolveMediaPath('clip', 'video')).toBe('videos/clip.mp4');
    expect(resolveMediaPath('clip')).toBe('videos/clip.mp4');
  });

  it('leaves an already-qualified path untouched', () => {
    expect(resolveMediaPath('avatars/foo.mp4', 'avatar')).toBe('avatars/foo.mp4');
    expect(resolveMediaPath('videos/bar.webm')).toBe('videos/bar.webm');
  });

  it('adds .mp4 to a subfoldered path that lacks a video extension', () => {
    expect(resolveMediaPath('videos/bar', 'video')).toBe('videos/bar.mp4');
  });

  it('returns falsy paths as-is', () => {
    expect(resolveMediaPath('')).toBe('');
  });
});

describe('extractJobIdFromUrl', () => {
  it('reads the job query param', () => {
    expect(extractJobIdFromUrl('https://x.com/p?job=abc123')).toBe('abc123');
  });

  it('reads the job_id query param', () => {
    expect(extractJobIdFromUrl('https://x.com/p?job_id=xyz789')).toBe('xyz789');
  });

  it('reads an id from a /player|/video|/watch|/review path', () => {
    expect(extractJobIdFromUrl('https://x.com/player/JOB_123')).toBe('JOB_123');
    expect(extractJobIdFromUrl('https://x.com/review/rev-9')).toBe('rev-9');
  });

  it('falls back to a UUID anywhere in the URL', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(extractJobIdFromUrl(`https://x.com/foo/${uuid}`)).toBe(uuid);
  });

  it('returns null when nothing matches', () => {
    expect(extractJobIdFromUrl('https://x.com/nothing/here')).toBeNull();
    expect(extractJobIdFromUrl(null)).toBeNull();
    expect(extractJobIdFromUrl('')).toBeNull();
  });
});

describe('getCdnMediaUrl', () => {
  it('returns the raw path when no jobId is given', () => {
    expect(getCdnMediaUrl(null, 'videos/clip.mp4')).toBe('videos/clip.mp4');
  });

  it('passes absolute URLs through unchanged', () => {
    expect(getCdnMediaUrl('job1', 'https://cdn.example.com/x.mp4'))
      .toBe('https://cdn.example.com/x.mp4');
  });

  it('builds a proxy URL with the cleaned file path and job id', () => {
    const url = getCdnMediaUrl('job1', '//videos//clip.mp4');
    const parsed = new URL(url);
    expect(parsed.pathname).toContain('/functions/v1/video-generation-proxy');
    expect(parsed.searchParams.get('action')).toBe('cdn_proxy');
    expect(parsed.searchParams.get('job_id')).toBe('job1');
    expect(parsed.searchParams.get('file_path')).toBe('videos/clip.mp4');
  });
});
