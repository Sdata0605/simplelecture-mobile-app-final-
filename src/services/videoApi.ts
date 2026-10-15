// Video Generation API Service
// This service communicates with the Express backend for video generation

// Use environment variable or fallback to Replit domain
// For local dev, set EXPO_PUBLIC_BACKEND_URL in .env
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://90375c04-b4d3-4a77-b1d3-ce92fa738d8c-00-c0r6vygbwubw.worf.replit.dev';

export interface VideoSlide {
  title: string;
  keyPoints: string[];
  narration: string;
}

export interface VideoGenerationRequest {
  question: string;
  slides: VideoSlide[];
  audioBase64?: string;
}

export interface VideoGenerationResponse {
  success: boolean;
  videoUrl?: string;
  duration?: number;
  error?: string;
}

export interface VideoStatusResponse {
  exists: boolean;
  size?: number;
  createdAt?: string;
}

export const videoApi = {
  /**
   * Generate an educational video from slides and audio
   */
  generateVideo: async (request: VideoGenerationRequest): Promise<VideoGenerationResponse> => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/generate-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();
      
      if (data.success && data.videoUrl) {
        // Prepend the backend URL to get the full video URL
        return {
          success: true,
          videoUrl: `${BACKEND_URL}${data.videoUrl}`,
          duration: data.duration,
        };
      }
      
      return {
        success: false,
        error: data.error || 'Video generation failed',
      };
    } catch (error) {
      console.error('Video generation API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  },

  /**
   * Check if a video exists
   */
  checkVideoStatus: async (videoId: string): Promise<VideoStatusResponse> => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/video-status/${videoId}`);
      return await response.json();
    } catch (error) {
      console.error('Video status check error:', error);
      return { exists: false };
    }
  },

  /**
   * Get the full URL for a video
   */
  getVideoUrl: (videoPath: string): string => {
    if (videoPath.startsWith('http')) {
      return videoPath;
    }
    return `${BACKEND_URL}${videoPath}`;
  },
};
