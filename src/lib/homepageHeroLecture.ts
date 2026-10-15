/**
 * Single source of truth for the homepage hero lecture video.
 * Mirror of the web app's src/lib/homepageHeroLecture.ts.
 * Update this file when the featured lecture changes — no other code needs to change.
 */
export interface HomepageHeroLecture {
  jobId: string;
  vimeoId: string;
  /** Direct progressive MP4 URL — use this, NOT the Vimeo iframe (domain-restricted). */
  videoMp4Url: string;
  title: string;
  subtitle: string;
}

export const HOMEPAGE_HERO_LECTURE: HomepageHeroLecture = {
  jobId: 'SocialScience_20260630115302591_5462fd6a',
  vimeoId: '1205802274',
  videoMp4Url:
    'https://player.vimeo.com/progressive_redirect/playback/1205802274/rendition/720p/file.mp4%20%28720p%29.mp4?loc=external&oauth2_token_id=1806524992&signature=58cc606332ec40e26eee1fd34d8c57a5e5354f8eb83b4696201fbe31d45ee9f8',
  title: 'Discovery of a New Sea Route to India',
  subtitle: 'SSLC 10 — Social Science • Chapter 1 (Topic 1.3)',
};
