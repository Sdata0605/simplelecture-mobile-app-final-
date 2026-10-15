import {
  DEFAULT_PREFS,
  STORAGE_KEY,
  PRESET_OPTIONS,
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  loadPrefs,
  savePrefs,
  getCachedPrefs,
  personaPayload,
  TeacherPrefs,
} from '../aiTeacherPrefs';
import {
  __reset,
  __setStore,
  __getStore,
} from './asyncStorageMock';

describe('aiTeacherPrefs Service', () => {
  beforeEach(() => {
    __reset();
  });

  describe('Constants and Option Definitions', () => {
    it('has standard default preferences', () => {
      expect(DEFAULT_PREFS).toEqual({
        apiKey: '',
        apiMode: 'admin',
        voice: 'Aoede',
        teacherName: 'AI Teacher',
        preset: 'friendly',
        custom: '',
        language: 'auto',
      });
    });

    it('contains preset options with required fields', () => {
      expect(Array.isArray(PRESET_OPTIONS)).toBe(true);
      expect(PRESET_OPTIONS.length).toBeGreaterThan(0);
      PRESET_OPTIONS.forEach((opt) => {
        expect(opt.id).toBeDefined();
        expect(opt.emoji).toBeDefined();
        expect(opt.label).toBeDefined();
        expect(opt.desc).toBeDefined();
      });
    });

    it('contains voice options with id and desc', () => {
      expect(Array.isArray(VOICE_OPTIONS)).toBe(true);
      expect(VOICE_OPTIONS.length).toBeGreaterThan(0);
      VOICE_OPTIONS.forEach((v) => {
        expect(v.id).toBeDefined();
        expect(v.desc).toBeDefined();
      });
      const ids = VOICE_OPTIONS.map((v) => v.id);
      expect(ids).toContain('Aoede');
    });

    it('contains language options with id and label', () => {
      expect(Array.isArray(LANGUAGE_OPTIONS)).toBe(true);
      const ids = LANGUAGE_OPTIONS.map((l) => l.id);
      expect(ids).toContain('auto');
      expect(ids).toContain('en');
      expect(ids).toContain('hi');
      expect(ids).toContain('kn');
    });
  });

  describe('loadPrefs and savePrefs', () => {
    it('returns default preferences when storage is empty', async () => {
      const prefs = await loadPrefs();
      expect(prefs).toEqual(DEFAULT_PREFS);
      expect(getCachedPrefs()).toEqual(DEFAULT_PREFS);
    });

    it('persists preferences to AsyncStorage and updates cache', async () => {
      const newPrefs: TeacherPrefs = {
        apiKey: 'AIzaSyTest1234567890',
        apiMode: 'own',
        voice: 'Puck',
        teacherName: 'Prof. Sharma',
        preset: 'coach',
        custom: 'Focus strictly on 2026 board exam questions',
        language: 'kn',
      };

      await savePrefs(newPrefs);

      const store = __getStore();
      expect(store[STORAGE_KEY]).toBeDefined();
      const parsed = JSON.parse(store[STORAGE_KEY]);
      expect(parsed).toEqual(newPrefs);

      expect(getCachedPrefs()).toEqual(newPrefs);

      const reloaded = await loadPrefs();
      expect(reloaded).toEqual(newPrefs);
    });

    it('gracefully handles missing keys by merging with DEFAULT_PREFS', async () => {
      __setStore({
        [STORAGE_KEY]: JSON.stringify({
          apiKey: 'test-key-abc',
          teacherName: 'Tutor X',
        }),
      });

      const prefs = await loadPrefs();
      expect(prefs.apiKey).toBe('test-key-abc');
      expect(prefs.teacherName).toBe('Tutor X');
      // Should fall back to defaults for missing fields:
      expect(prefs.voice).toBe(DEFAULT_PREFS.voice);
      expect(prefs.preset).toBe(DEFAULT_PREFS.preset);
      expect(prefs.language).toBe(DEFAULT_PREFS.language);
      expect(prefs.apiMode).toBe(DEFAULT_PREFS.apiMode);
    });

    it('gracefully falls back to DEFAULT_PREFS if stored JSON is corrupted', async () => {
      __setStore({ [STORAGE_KEY]: 'corrupted-json}{{' });
      const prefs = await loadPrefs();
      expect(prefs).toEqual(DEFAULT_PREFS);
    });
  });

  describe('personaPayload', () => {
    it('formats teacher preferences correctly for the AI edge function', () => {
      const testPrefs: TeacherPrefs = {
        apiKey: 'dummy-key',
        apiMode: 'own',
        voice: 'Fenrir',
        teacherName: 'Mentor Ananya',
        preset: 'fun',
        custom: 'Keep answers brief and give examples',
        language: 'hi',
      };

      const payload = personaPayload(testPrefs);

      expect(payload).toEqual({
        name: 'Mentor Ananya',
        preset: 'fun',
        custom: 'Keep answers brief and give examples',
        language: 'hi',
        voice: 'Fenrir',
      });
    });

    it('handles empty voice by providing undefined', () => {
      const testPrefs: TeacherPrefs = {
        apiKey: '',
        apiMode: 'admin',
        voice: '',
        teacherName: 'AI Teacher',
        preset: 'friendly',
        custom: '',
        language: 'en',
      };

      const payload = personaPayload(testPrefs);
      expect(payload.voice).toBeUndefined();
      expect(payload.name).toBe('AI Teacher');
      expect(payload.preset).toBe('friendly');
      expect(payload.language).toBe('en');
    });
  });
});
