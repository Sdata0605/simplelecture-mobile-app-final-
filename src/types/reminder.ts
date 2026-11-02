// Reminders v2 contract. Other packages import these names exactly. Do not rename them.
// Spec: _scratch/reminders-v2-plan.md section C.4.

export type ReminderKind = 'call' | 'message' | 'notification';
export type ReminderSection = 'calendar' | 'daily';
export type ReminderRepeat = 'none' | 'daily';            // v2 only writes these two
export type ReminderStatus = 'scheduled' | 'answered' | 'declined' | 'missed' | 'cancelled' | 'delivered';
export type AudioStatus = 'none' | 'pending' | 'ready' | 'failed';
export type ReminderMode = 'once' | 'today_only' | 'daily'; // UI-level choice

export interface Reminder {
  id: string; user_id: string;
  title: string;            // derived: first line of message_text, max 80
  message_text: string;     // the user's reminder text, max 480 in UI
  scheduled_at: string;     // ISO UTC; one-offs: the fire instant; daily: the next computed fire (informational)
  repeat_rule: ReminderRepeat | 'weekdays' | 'weekly';   // legacy values tolerated, treated as 'daily'
  kind: ReminderKind; section: ReminderSection;
  time_of_day: string | null;   // 'HH:MM' after normalisation (PostgREST returns 'HH:MM:SS')
  tz: string | null; enabled: boolean;
  call_enabled: boolean;        // mirror of kind === 'call'
  voice: string; language: VoiceLanguage;
  audio_path: string | null; audio_hash: string | null; audio_status: AudioStatus;
  status: ReminderStatus; last_fired_at: string | null;
  created_at: string; updated_at: string;
  // Timetable fields (additive and optional: absent on user rows and older servers).
  source?: 'user' | 'timetable';
  session_id?: string | null;
  target?: ReminderTarget | null;   // where "Open class" goes
  device_ready_at?: string | null;
  device_audio_hash?: string | null;
}

/** Where a timetable reminder leads: the Classes (videos) tab of this topic, chapter or subject. */
export interface ReminderTarget {
  courseId: string | null;
  subjectId: string | null;
  chapterId: string | null;
  topicId: string | null;
  topicTitle?: string | null;
}

/** Channel chosen per study session in the timetable. No value on the session (null) means no reminder. */
export type ReminderChannel = 'call' | 'message' | 'notification' | 'email';

/** Plan-creation and reminder-settings choice. 'none' means the student turned reminders off. */
export type ReminderChoice = ReminderChannel | 'none';

export interface ReminderInput {
  id?: string;                 // present when editing
  text: string;
  kind: ReminderKind;
  mode: ReminderMode;
  date?: string;               // 'YYYY-MM-DD' local, required for mode 'once'
  time: string;                // 'HH:MM' local 24h
  voice: VoiceName;
  language: VoiceLanguage;
}

export const VOICE_LANGUAGES = [
  { value: 'en-IN', label: 'English', sub: 'English (India)' },
  { value: 'hi-IN', label: 'हिन्दी', sub: 'Hindi' },
  { value: 'mr-IN', label: 'मराठी', sub: 'Marathi' },
  { value: 'kn-IN', label: 'ಕನ್ನಡ', sub: 'Kannada' },
] as const;
export type VoiceLanguage = typeof VOICE_LANGUAGES[number]['value'];

// The six Sarvam voices (the v1 list was removed with the v1 call reminders).
export const VOICES = [
  { value: 'shubh', label: 'Shubh' },
  { value: 'aditya', label: 'Aditya' },
  { value: 'ritu', label: 'Ritu' },
  { value: 'priya', label: 'Priya' },
  { value: 'kavya', label: 'Kavya' },
  { value: 'rahul', label: 'Rahul' },
] as const;
export type VoiceName = typeof VOICES[number]['value'];

export const REMINDER_NOTIF_PREFIX = 'reminder-';            // identifier = `reminder-${id}`
export const LEGACY_NOTIF_PREFIX = 'call-reminder-';         // v1, cancelled on every sync
export const CHANNELS = { call: 'reminder-call-v2', message: 'reminder-message', notification: 'reminder-plain' } as const;
export const CATEGORIES = { call: 'reminder-call', message: 'reminder-message' } as const;
export const ACTIONS = { answer: 'answer', decline: 'decline', done: 'done' } as const;
export const LIMITS = { textMax: 480, textWarn: 440, titleMax: 80, dailyMax: 20, budget: 38, minLeadMs: 60_000 } as const;
export const RING_SOUND_FILE = 'reminder_ring_27s.wav';

export interface ReminderNotificationData {
  type: 'reminder'; v: 2; reminderId: string; kind: ReminderKind; fp: string;
  src?: 'tt';              // study-timetable reminder
  t?: ReminderTarget;      // where a tap goes (timetable reminders only)
}
