import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TeacherPrefs {
  apiKey: string;
  apiMode: 'admin' | 'own';
  voice: string;
  teacherName: string;
  preset: string;
  custom: string;
  language: string;
}

export const DEFAULT_PREFS: TeacherPrefs = {
  apiKey: '',
  apiMode: 'admin',
  voice: 'Aoede',
  teacherName: 'AI Teacher',
  preset: 'friendly',
  custom: '',
  language: 'auto',
};

export const PRESET_OPTIONS = [
  { id: 'friendly', emoji: '😊', label: 'Friendly', desc: 'Warm, patient and encouraging' },
  { id: 'strict', emoji: '🧑‍🏫', label: 'Strict', desc: 'Disciplined, precise, keeps you focused' },
  { id: 'fun', emoji: '🎉', label: 'Fun', desc: 'Energetic, playful, a few jokes' },
  { id: 'calm', emoji: '🌿', label: 'Calm', desc: 'Gentle, never rushed, tiny steps' },
  { id: 'storyteller', emoji: '📖', label: 'Storyteller', desc: 'Explains through stories and scenes' },
  { id: 'coach', emoji: '🏆', label: 'Exam coach', desc: 'Marks, key points and memory tricks' },
];

export const VOICE_OPTIONS = [
  { id: 'Aoede', desc: 'Breezy & Natural' },
  { id: 'Kore', desc: 'Firm & Clear' },
  { id: 'Puck', desc: 'Upbeat & Friendly' },
  { id: 'Charon', desc: 'Informative' },
  { id: 'Fenrir', desc: 'Excitable' },
  { id: 'Leda', desc: 'Youthful' },
  { id: 'Orus', desc: 'Steady' },
  { id: 'Zephyr', desc: 'Bright' },
];

// The labels say what the teacher actually speaks: Hindi, Marathi and Kannada are spoken the way Indian
// classrooms do it, with the subject words left in English (the same list as the web app).
export const LANGUAGE_OPTIONS = [
  { id: 'auto', label: 'Match my language' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी (Hinglish: Hindi + English)' },
  { id: 'mr', label: 'मराठी (Menglish: Marathi + English)' },
  { id: 'kn', label: 'ಕನ್ನಡ (Kanglish: Kannada + English)' },
];

export const STORAGE_KEY = '@aiteacher_prefs_v1';

let cachedPrefs: TeacherPrefs = { ...DEFAULT_PREFS };
let prefsLoaded = false;
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
};

export async function loadPrefs(): Promise<TeacherPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedPrefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      prefsLoaded = true;
      return cachedPrefs;
    }
  } catch {
    // fallback
  }
  cachedPrefs = { ...DEFAULT_PREFS };
  prefsLoaded = true;
  return cachedPrefs;
}

export function getCachedPrefs(): TeacherPrefs {
  return cachedPrefs;
}

export async function savePrefs(p: TeacherPrefs): Promise<void> {
  try {
    cachedPrefs = { ...p };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    notifyListeners();
  } catch (err) {
    console.error('Failed to save AI Teacher prefs:', err);
  }
}

export function useTeacherPrefs(): [TeacherPrefs, (patch: Partial<TeacherPrefs>) => Promise<void>] {
  const [prefs, setPrefs] = useState<TeacherPrefs>(cachedPrefs);

  useEffect(() => {
    const sync = () => setPrefs({ ...cachedPrefs });
    listeners.add(sync);

    if (!prefsLoaded) {
      loadPrefs().then((loaded) => setPrefs(loaded));
    }

    return () => {
      listeners.delete(sync);
    };
  }, []);

  const update = useCallback(async (patch: Partial<TeacherPrefs>) => {
    const updated = { ...cachedPrefs, ...patch };
    await savePrefs(updated);
  }, []);

  return [prefs, update];
}

export const personaPayload = (p: TeacherPrefs) => ({
  name: p.teacherName,
  preset: p.preset,
  custom: p.custom,
  language: p.language,
  voice: p.voice || undefined,
});
