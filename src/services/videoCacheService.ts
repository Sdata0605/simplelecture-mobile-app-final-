import * as FileSystem from 'expo-file-system';
import { getMediaUrl } from '../utils/mediaResolver';

const CACHE_FOLDER_NAME = 'video_cache';
const MIN_VALID_VIDEO_SIZE = 10240;

function getCacheDirUri(): string {
  return `${FileSystem.cacheDirectory}${CACHE_FOLDER_NAME}/`;
}

async function ensureCacheDir(): Promise<void> {
  const dirUri = getCacheDirUri();
  const dirInfo = await FileSystem.getInfoAsync(dirUri);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function getCacheKey(url: string): string {
  const hash = simpleHash(url);
  const urlPart = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 60);
  return `${urlPart}_${hash}`;
}

function getExtension(url: string): string {
  if (url.includes('.webm')) return '.webm';
  if (url.includes('.mp4')) return '.mp4';
  if (url.includes('.mov')) return '.mov';
  return '.mp4';
}

function getCachedFileUri(url: string): string {
  const key = getCacheKey(url);
  const extension = getExtension(url);
  return `${getCacheDirUri()}${key}${extension}`;
}

const syncCacheMap = new Map<string, string>();

export function isVideoCached(url: string): boolean {
  const inMap = syncCacheMap.has(url);
  if (inMap) {
    
  }
  return inMap;
}

export function registerCachedUri(url: string, fileUri: string): void {
  syncCacheMap.set(url, fileUri);
  console.log('[VideoCache] Registered in sync cache:', url.substring(url.lastIndexOf('/') + 1), '->', fileUri.substring(fileUri.lastIndexOf('/') + 1));
}

export async function isVideoCachedAsync(url: string): Promise<boolean> {
  try {
    if (syncCacheMap.has(url)) {
      console.log('[VideoCache] CACHE CHECK (sync map hit):', url.substring(url.lastIndexOf('/') + 1));
      return true;
    }
    await ensureCacheDir();
    const fileUri = getCachedFileUri(url);
    const info = await FileSystem.getInfoAsync(fileUri);
    const fileSize = info.exists && 'size' in info ? (info.size || 0) : 0;
    const sizeStr = fileSize > 0 ? ` (${(fileSize / 1024 / 1024).toFixed(2)}MB)` : '';
    if (info.exists && fileSize >= MIN_VALID_VIDEO_SIZE) {
      console.log(`[VideoCache] CACHE HIT${sizeStr}:`, url.substring(url.lastIndexOf('/') + 1));
      syncCacheMap.set(url, fileUri);
      return true;
    } else if (info.exists && fileSize < MIN_VALID_VIDEO_SIZE) {
      console.log(`[VideoCache] CACHE INVALID (${fileSize} bytes, min ${MIN_VALID_VIDEO_SIZE}):`, url.substring(url.lastIndexOf('/') + 1));
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      return false;
    } else {
      
    }
    return false;
  } catch (error) {
    console.warn('[VideoCache] Error checking cache:', error);
    return false;
  }
}

export function getCachedVideoUri(url: string): string | null {
  const cached = syncCacheMap.get(url);
  if (cached) {
    return cached;
  }
  return null;
}

export async function getCachedVideoUriAsync(url: string): Promise<string | null> {
  try {
    const syncCached = syncCacheMap.get(url);
    if (syncCached) {
      return syncCached;
    }
    await ensureCacheDir();
    const fileUri = getCachedFileUri(url);
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      const fileSize = 'size' in info ? (info.size || 0) : 0;
      if (fileSize < MIN_VALID_VIDEO_SIZE) {
        return null;
      }
      syncCacheMap.set(url, fileUri);
      return fileUri;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function getContentUri(fileUri: string): Promise<string> {
  try {
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    return contentUri;
  } catch (error) {
    return fileUri;
  }
}

export interface DownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  progress: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

const activeDownloads: Map<string, Promise<string>> = new Map();

export async function downloadVideo(
  url: string,
  onProgress?: ProgressCallback
): Promise<string> {
  await ensureCacheDir();

  const fileUri = getCachedFileUri(url);

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) {
    const fileSize = 'size' in info ? (info.size || 0) : 0;
    if (fileSize >= MIN_VALID_VIDEO_SIZE) {
      
      syncCacheMap.set(url, fileUri);
      return fileUri;
    }
    console.log(`[VideoCache] Deleting invalid cached file (${fileSize} bytes):`, url.substring(url.lastIndexOf('/') + 1));
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }

  if (activeDownloads.has(url)) {
    
    return activeDownloads.get(url)!;
  }

  const fileName = url.substring(url.lastIndexOf('/') + 1).substring(0, 60);
  const startTime = Date.now();
  

  const downloadPromise = (async () => {
    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        fileUri,
        {},
        (downloadProgress) => {
          if (onProgress && downloadProgress.totalBytesExpectedToWrite > 0) {
            onProgress({
              totalBytes: downloadProgress.totalBytesExpectedToWrite,
              downloadedBytes: downloadProgress.totalBytesWritten,
              progress: downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite,
            });
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (onProgress) {
        onProgress({
          totalBytes: 1,
          downloadedBytes: 1,
          progress: 1,
        });
      }

      const finalUri = result?.uri || fileUri;
      const dlInfo = await FileSystem.getInfoAsync(finalUri);
      const dlFileSize = dlInfo.exists && 'size' in dlInfo ? (dlInfo.size || 0) : 0;
      const dlSize = dlFileSize > 0 ? ` (${(dlFileSize / 1024 / 1024).toFixed(2)}MB)` : '';
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (dlFileSize < MIN_VALID_VIDEO_SIZE) {
        console.warn(`[VideoCache] DOWNLOAD INVALID - file too small (${dlFileSize} bytes) after ${elapsed}s: ${fileName}`);
        await FileSystem.deleteAsync(finalUri, { idempotent: true });
        return '';
      }
      
      console.log(`[VideoCache] DOWNLOAD COMPLETE${dlSize} in ${elapsed}s: ${fileName}`);
      syncCacheMap.set(url, finalUri);
      return finalUri;
    } catch (error: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        console.warn(`[VideoCache] DOWNLOAD 404 after ${elapsed}s: ${fileName}`);
        return '';
      }
      console.error(`[VideoCache] DOWNLOAD ERROR after ${elapsed}s: ${fileName}`, error);
      throw error;
    } finally {
      activeDownloads.delete(url);
    }
  })();

  activeDownloads.set(url, downloadPromise);
  return downloadPromise;
}

export interface VideoDownloadResult {
  url: string;
  type: 'avatar' | 'video';
  status: 'cached' | 'downloaded' | 'failed';
  sizeMB?: number;
  durationMs?: number;
}

export async function downloadVideoBatch(
  videos: { url: string; type: 'avatar' | 'video' }[],
  concurrency: number = 3,
  onProgress?: (completed: number, total: number, result: VideoDownloadResult) => void
): Promise<VideoDownloadResult[]> {
  const results: VideoDownloadResult[] = [];
  let completed = 0;
  const total = videos.length;

  const avatarVideos = videos.filter(v => v.type === 'avatar');
  const beatVideos = videos.filter(v => v.type === 'video');
  const ordered = [...avatarVideos, ...beatVideos];

  console.log(`[VideoCache] BATCH START: ${total} videos (${avatarVideos.length} AVATAR, ${beatVideos.length} BEAT), concurrency=${concurrency}`);
  const batchStart = Date.now();

  let index = 0;

  async function processNext(): Promise<void> {
    while (index < ordered.length) {
      const currentIndex = index++;
      const { url, type } = ordered[currentIndex];
      const fileName = url.substring(url.lastIndexOf('/') + 1).substring(0, 60);
      const label = type === 'avatar' ? 'AVATAR' : 'BEAT';
      const itemStart = Date.now();

      try {
        if (isVideoCached(url)) {
          const result: VideoDownloadResult = { url, type, status: 'cached' };
          results.push(result);
          completed++;
          
          onProgress?.(completed, total, result);
          continue;
        }

        const cachedUri = await downloadVideo(url);
        const durationMs = Date.now() - itemStart;

        if (cachedUri) {
          let sizeMB: number | undefined;
          try {
            const info = await FileSystem.getInfoAsync(cachedUri);
            if (info.exists && 'size' in info && info.size) {
              sizeMB = info.size / 1024 / 1024;
            }
          } catch {}
          const result: VideoDownloadResult = { url, type, status: 'downloaded', sizeMB, durationMs };
          results.push(result);
          completed++;
          console.log(`[VideoCache] [${label}] DOWNLOADED (${completed}/${total}): ${fileName} ${sizeMB ? `${sizeMB.toFixed(2)}MB` : ''} in ${(durationMs / 1000).toFixed(1)}s`);
          onProgress?.(completed, total, result);
        } else {
          const result: VideoDownloadResult = { url, type, status: 'failed', durationMs };
          results.push(result);
          completed++;
          console.log(`[VideoCache] [${label}] FAILED (${completed}/${total}): ${fileName}`);
          onProgress?.(completed, total, result);
        }
      } catch (error) {
        const durationMs = Date.now() - itemStart;
        const result: VideoDownloadResult = { url, type, status: 'failed', durationMs };
        results.push(result);
        completed++;
        console.warn(`[VideoCache] [${label}] ERROR (${completed}/${total}): ${fileName}`, error);
        onProgress?.(completed, total, result);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ordered.length) }, () => processNext());
  await Promise.all(workers);

  const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
  const avatarCached = results.filter(r => r.type === 'avatar' && r.status === 'cached').length;
  const avatarDownloaded = results.filter(r => r.type === 'avatar' && r.status === 'downloaded').length;
  const avatarFailed = results.filter(r => r.type === 'avatar' && r.status === 'failed').length;
  const beatCached = results.filter(r => r.type === 'video' && r.status === 'cached').length;
  const beatDownloaded = results.filter(r => r.type === 'video' && r.status === 'downloaded').length;
  const beatFailed = results.filter(r => r.type === 'video' && r.status === 'failed').length;

  console.log(`[VideoCache] BATCH COMPLETE in ${batchElapsed}s:`);
  console.log(`[VideoCache]   AVATAR: ${avatarCached} cached, ${avatarDownloaded} downloaded, ${avatarFailed} failed`);
  console.log(`[VideoCache]   BEAT:   ${beatCached} cached, ${beatDownloaded} downloaded, ${beatFailed} failed`);

  return results;
}

export interface SectionVideos {
  avatarUrl: string | null;
  beatVideoUrls: string[];
}

function normalizeMediaPath(path: string, type: 'avatar' | 'video' = 'video'): string {
  if (!path) return path;

  let fullPath = path;
  const hasSubfolder = path.includes('avatars/') || path.includes('videos/') || path.includes('audio/');

  if (!hasSubfolder) {
    if (type === 'avatar') fullPath = 'avatars/' + path;
    else if (type === 'video') fullPath = 'videos/' + path;
  }

  if (!fullPath.match(/\.(mp4|webm|mov)$/i)) {
    fullPath = fullPath + '.mp4';
  }

  return fullPath;
}

function resolveAvatarPath(section: any): string | null {
  if (section?.avatar_languages && Array.isArray(section.avatar_languages)) {
    const completed = section.avatar_languages.find(
      (al: any) => al.status === 'completed' && al.video_path
    );
    if (completed) return completed.video_path;
  }
  if (section?.avatar_video) return section.avatar_video;
  if (section?.avatar?.video_path) return section.avatar.video_path;
  if (section?.section_id !== undefined) return `avatars/section_${section.section_id}_avatar.mp4`;
  return null;
}

export function extractSectionVideos(
  section: any,
  jobId: string | null
): SectionVideos {
  const avatarVideo = resolveAvatarPath(section);
  let avatarUrl: string | null = null;

  if (avatarVideo && jobId) {
    const normalizedPath = normalizeMediaPath(avatarVideo, 'avatar');
    avatarUrl = getMediaUrl(jobId, normalizedPath);
  }

  const beatVideoUrls: string[] = [];

  if (section?.narration?.segments && jobId) {
    for (const segment of section.narration.segments) {
      if (segment.beat_videos && Array.isArray(segment.beat_videos)) {
        for (const beatVideo of segment.beat_videos) {
          if (beatVideo && !beatVideo.includes('vimeo.com')) {
            const normalizedPath = normalizeMediaPath(beatVideo, 'video');
            const videoUrl = getMediaUrl(jobId, normalizedPath);
            if (videoUrl && !beatVideoUrls.includes(videoUrl)) {
              beatVideoUrls.push(videoUrl);
            }
          }
        }
      }
    }
  }

  return { avatarUrl, beatVideoUrls };
}

export interface PrefetchProgress {
  total: number;
  completed: number;
  currentFile: string;
  fileProgress?: number;
}

export type PrefetchCallback = (progress: PrefetchProgress) => void;

export async function prefetchSectionVideos(
  section: any,
  jobId: string | null,
  onProgress?: PrefetchCallback
): Promise<void> {
  const { avatarUrl, beatVideoUrls } = extractSectionVideos(section, jobId);

  const allUrls: string[] = [];
  if (avatarUrl) allUrls.push(avatarUrl);
  allUrls.push(...beatVideoUrls);

  if (allUrls.length === 0) {
    console.log('[VideoCache] No videos to prefetch for section');
    return;
  }

  console.log(`[VideoCache] Prefetching ${allUrls.length} videos for section:`, section?.title);

  let completed = 0;

  for (const url of allUrls) {
    try {
      const cached = await isVideoCachedAsync(url);
      if (cached) {
        completed++;
        onProgress?.({
          total: allUrls.length,
          completed,
          currentFile: url.substring(url.lastIndexOf('/') + 1),
        });
        continue;
      }

      await downloadVideo(url, (progress) => {
        onProgress?.({
          total: allUrls.length,
          completed,
          currentFile: url.substring(url.lastIndexOf('/') + 1),
          fileProgress: progress.progress,
        });
      });

      completed++;
      onProgress?.({
        total: allUrls.length,
        completed,
        currentFile: url.substring(url.lastIndexOf('/') + 1),
      });
    } catch (error) {
      console.warn('[VideoCache] Failed to prefetch:', url, error);
      completed++;
    }
  }

  console.log(`[VideoCache] Prefetch complete: ${completed}/${allUrls.length} videos`);
}

export function getVideoUri(url: string): string {
  if (!url) return url;
  if (!url.startsWith('http')) {
    return url;
  }
  const cached = syncCacheMap.get(url);
  if (cached) {
    return cached;
  }
  return url;
}

export async function getVideoUriAsync(url: string): Promise<string> {
  if (!url) return url;
  if (!url.startsWith('http')) {
    return url;
  }
  const cachedUri = await getCachedVideoUriAsync(url);
  if (cachedUri) {
    
    return cachedUri;
  }
  return url;
}

export async function clearCorruptCache(): Promise<void> {
  try {
    const dirUri = getCacheDirUri();
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) return;

    const files = await FileSystem.readDirectoryAsync(dirUri);
    let deletedCount = 0;

    for (const fileName of files) {
      const filePath = `${dirUri}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      const fSize = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size || 0) : 0;
      if (fileInfo.exists && fSize < MIN_VALID_VIDEO_SIZE) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[VideoCache] Cleared ${deletedCount} invalid cached files (< ${MIN_VALID_VIDEO_SIZE} bytes)`);
    }
    syncCacheMap.clear();
  } catch (error) {
    console.warn('[VideoCache] Error clearing corrupt cache:', error);
  }
}

export async function clearCache(): Promise<void> {
  try {
    const dirUri = getCacheDirUri();
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(dirUri, { idempotent: true });
    }
    console.log('[VideoCache] Cache cleared');
  } catch (error) {
    console.error('[VideoCache] Error clearing cache:', error);
  }
}

export async function getCacheSize(): Promise<number> {
  try {
    const dirUri = getCacheDirUri();
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) return 0;

    const files = await FileSystem.readDirectoryAsync(dirUri);
    let totalSize = 0;

    for (const fileName of files) {
      const fileInfo = await FileSystem.getInfoAsync(`${dirUri}${fileName}`);
      if (fileInfo.exists && 'size' in fileInfo) {
        totalSize += fileInfo.size || 0;
      }
    }

    return totalSize;
  } catch (error) {
    console.error('[VideoCache] Error getting cache size:', error);
    return 0;
  }
}
