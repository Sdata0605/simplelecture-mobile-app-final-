import { useState, useEffect, useRef } from 'react';

const CDN_BASE_URL = 'https://server1.simplelecture.com/video';

const normalizeLanguage = (value: unknown): string => String(value || '').trim().toLowerCase();

const isCompletedStatus = (value: unknown): boolean => {
  const status = String(value || '').trim().toLowerCase();
  return status === 'completed' || status === 'ready' || status === 'success';
};

const getUsableAvatarUrl = (avatar: any, jobId: string, sectionId: number): string | null => {
  if (avatar?.video_url) return avatar.video_url;
  if (avatar?.b2_url) return avatar.b2_url;
  if (avatar?.vimeo_url) return avatar.vimeo_url;
  if (avatar?.video_path && jobId && sectionId) {
    return `https://${CDN_BASE_URL}/${jobId}/${String(avatar.video_path).replace(/^\/+/, '')}`;
  }
  return null;
};

interface LectureLanguagesResult {
  languages: string[];
  isLoading: boolean;
  error: string | null;
}

const globalCache = new Map<string, { languages: string[]; timestamp: number }>();
const CACHE_TTL_MS = 60_000;

function getCached(jobId: string): { languages: string[] } | null {
  const entry = globalCache.get(jobId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    globalCache.delete(jobId);
    return null;
  }
  return { languages: entry.languages };
}

function setCached(jobId: string, languages: string[]) {
  globalCache.set(jobId, { languages, timestamp: Date.now() });
}

export function useAvailableLanguagesForLecture(externalJobId: string | null | undefined): LectureLanguagesResult {
  const [languages, setLanguages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef(externalJobId);

  useEffect(() => {
    jobIdRef.current = externalJobId;
    if (!externalJobId) {
      setLanguages([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cached = getCached(externalJobId);
    if (cached) {
      setLanguages(cached.languages);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchLanguages = async () => {
      try {
        const url = `${CDN_BASE_URL}/${externalJobId}/presentation.json?t=${Date.now()}`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const presJson = await res.json();
        const sections: any[] = Array.isArray(presJson?.sections) ? presJson.sections : [];
        const totalSections = sections.length;

        const languageCoverage: Record<string, number> = {};

        for (const section of sections) {
          const sectionId = section.section_id ?? 0;

          if (!languageCoverage['english']) languageCoverage['english'] = 0;
          languageCoverage['english']++;

          const avatars: any[] = Array.isArray(section.avatar_languages) ? section.avatar_languages : [];
          for (const avatar of avatars) {
            if (!avatar?.language) continue;
            const lang = normalizeLanguage(avatar.language);
            if (lang === 'english') continue;
            if (!isCompletedStatus(avatar.status)) continue;
            if (!getUsableAvatarUrl(avatar, externalJobId, sectionId)) continue;

            if (!languageCoverage[lang]) languageCoverage[lang] = 0;
            if (!languageCoverage[`__counted_${lang}_${sectionId}`]) {
              languageCoverage[lang]++;
              languageCoverage[`__counted_${lang}_${sectionId}`] = 1;
            }
          }
        }

        const result: string[] = [];
        if (totalSections > 0) {
          result.push('english');
          for (const [lang, count] of Object.entries(languageCoverage)) {
            if (lang.startsWith('__counted_')) continue;
            if (lang === 'english') continue;
            if (count >= totalSections) result.push(lang);
          }
        }

        if (!cancelled && jobIdRef.current === externalJobId) {
          setCached(externalJobId, result);
          setLanguages(result);
          setIsLoading(false);
        }
      } catch (e: any) {
        if (e.name === 'AbortError' || cancelled) return;
        if (!cancelled && jobIdRef.current === externalJobId) {
          setLanguages([]);
          setError(e.message || 'Failed to fetch languages');
          setIsLoading(false);
        }
      }
    };

    fetchLanguages();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [externalJobId]);

  return { languages, isLoading, error };
}
