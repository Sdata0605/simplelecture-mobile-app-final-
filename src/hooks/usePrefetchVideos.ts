import { useEffect, useRef, useCallback } from 'react';
import { 
  prefetchSectionVideos, 
  extractSectionVideos, 
  isVideoCached,
  PrefetchProgress,
  PrefetchCallback 
} from '../services/videoCacheService';

interface PresentationSection {
  section_id: number;
  section_type: string;
  title: string;
  avatar_video?: string;
  narration?: {
    segments?: Array<{
      beat_videos?: string[];
    }>;
  };
}

interface UsePrefetchVideosOptions {
  sections: PresentationSection[] | null;
  currentSectionIndex: number;
  jobId: string | null;
  isPlaying: boolean;
  onPrefetchProgress?: PrefetchCallback;
}

export function usePrefetchVideos({
  sections,
  currentSectionIndex,
  jobId,
  isPlaying,
  onPrefetchProgress,
}: UsePrefetchVideosOptions) {
  const prefetchedSections = useRef<Set<number>>(new Set());
  const isPrefetching = useRef(false);
  
  const prefetchSection = useCallback(async (sectionIndex: number) => {
    if (!sections || sectionIndex >= sections.length) return;
    if (prefetchedSections.current.has(sectionIndex)) return;
    if (isPrefetching.current) return;
    
    const section = sections[sectionIndex];
    const { avatarUrl, beatVideoUrls } = extractSectionVideos(section, jobId);
    
    const allUrls = avatarUrl ? [avatarUrl, ...beatVideoUrls] : beatVideoUrls;
    const allCached = allUrls.every(url => isVideoCached(url));
    
    if (allCached) {
      console.log(`[Prefetch] Section ${sectionIndex} already cached`);
      prefetchedSections.current.add(sectionIndex);
      return;
    }
    
    isPrefetching.current = true;
    console.log(`[Prefetch] Starting prefetch for section ${sectionIndex}: ${section.title}`);
    
    try {
      await prefetchSectionVideos(section, jobId, onPrefetchProgress);
      prefetchedSections.current.add(sectionIndex);
      console.log(`[Prefetch] Completed section ${sectionIndex}`);
    } catch (error) {
      console.error(`[Prefetch] Error prefetching section ${sectionIndex}:`, error);
    } finally {
      isPrefetching.current = false;
    }
  }, [sections, jobId, onPrefetchProgress]);
  
  useEffect(() => {
    if (!sections || sections.length === 0) return;
    
    prefetchSection(0);
  }, [sections, prefetchSection]);
  
  useEffect(() => {
    if (!sections || !isPlaying) return;
    
    const nextSectionIndex = currentSectionIndex + 1;
    if (nextSectionIndex < sections.length) {
      const timer = setTimeout(() => {
        prefetchSection(nextSectionIndex);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [currentSectionIndex, sections, isPlaying, prefetchSection]);
  
  const resetPrefetchState = useCallback(() => {
    prefetchedSections.current.clear();
    isPrefetching.current = false;
  }, []);
  
  return {
    prefetchSection,
    resetPrefetchState,
    isPrefetching: isPrefetching.current,
  };
}

export function useVideoCacheStatus(
  section: PresentationSection | null,
  jobId: string | null
) {
  const checkCacheStatus = useCallback(() => {
    if (!section) return { avatarCached: false, beatVideosCached: false, allCached: false };
    
    const { avatarUrl, beatVideoUrls } = extractSectionVideos(section, jobId);
    
    const avatarCached = avatarUrl ? isVideoCached(avatarUrl) : true;
    const beatVideosCached = beatVideoUrls.length === 0 || 
      beatVideoUrls.every(url => isVideoCached(url));
    
    return {
      avatarCached,
      beatVideosCached,
      allCached: avatarCached && beatVideosCached,
    };
  }, [section, jobId]);
  
  return checkCacheStatus;
}
