// Shared contract for the Study "Call reminder" feature.
// Other packages import these names exactly. Do not rename them.

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly';
export type ReminderStatus = 'scheduled' | 'answered' | 'declined' | 'missed' | 'cancelled';
export type AudioStatus = 'none' | 'pending' | 'ready' | 'failed';

export interface CallReminder {
  id: string;
  user_id: string;
  title: string;
  message_text: string;
  scheduled_at: string;
  repeat_rule: RepeatRule;
  call_enabled: boolean;
  voice: string;
  language: string;
  audio_path: string | null;
  audio_hash: string | null;
  audio_status: AudioStatus;
  status: ReminderStatus;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CallReminderInput = Pick<
  CallReminder,
  'title' | 'message_text' | 'scheduled_at' | 'repeat_rule' | 'call_enabled' | 'voice' | 'language'
>;

export const SARVAM_LANGUAGES = [
  { value: 'en-IN', label: 'English', sub: 'English (India)' },
  { value: 'hi-IN', label: 'हिन्दी', sub: 'Hindi' },
  { value: 'mr-IN', label: 'मराठी', sub: 'Marathi' },
  { value: 'kn-IN', label: 'ಕನ್ನಡ', sub: 'Kannada' },
  { value: 'ta-IN', label: 'தமிழ்', sub: 'Tamil' },
  { value: 'te-IN', label: 'తెలుగు', sub: 'Telugu' },
  { value: 'ml-IN', label: 'മലയാളം', sub: 'Malayalam' },
  { value: 'bn-IN', label: 'বাংলা', sub: 'Bengali' },
  { value: 'gu-IN', label: 'ગુજરાતી', sub: 'Gujarati' },
  { value: 'pa-IN', label: 'ਪੰਜਾਬੀ', sub: 'Punjabi' },
  { value: 'od-IN', label: 'ଓଡ଼ିଆ', sub: 'Odia' },
] as const;

// Gender labels UNVERIFIED. Confirm by listening before release.
export const SARVAM_VOICES = [
  { value: 'shubh', label: 'Shubh' },
  { value: 'aditya', label: 'Aditya' },
  { value: 'ritu', label: 'Ritu' },
  { value: 'priya', label: 'Priya' },
  { value: 'kavya', label: 'Kavya' },
  { value: 'rahul', label: 'Rahul' },
] as const;

export const CALL_NOTIF_PREFIX = 'call-reminder-';
export const CALL_CHANNEL_ID = 'study-call';
export const CALL_CATEGORY_ID = 'study-call';
export const CALL_ACTION_ANSWER = 'answer';
export const CALL_ACTION_DECLINE = 'decline';
