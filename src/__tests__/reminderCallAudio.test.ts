// Tests for the device-voice picker in hooks/useReminderCallAudio.ts. Spec: _scratch/reminders-v2-plan.md E.9 and D-9.
// Native modules are mocked: the test runs in the node environment without a React Native runtime.

jest.mock('react-native', () => ({ Vibration: { vibrate: jest.fn(), cancel: jest.fn() } }));
jest.mock('expo-av', () => ({ Audio: {} }));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));

import { pickVoiceForLanguage } from '../hooks/useReminderCallAudio';

const VOICES = [
  { identifier: 'us-female', language: 'en-US' },
  { identifier: 'in-english', language: 'en_IN' },
  { identifier: 'hindi-male', language: 'hi-IN' },
];

describe('pickVoiceForLanguage', () => {
  it('prefers an exact tag match, including underscore tags from Android', () => {
    expect(pickVoiceForLanguage(VOICES, 'en-IN')?.identifier).toBe('in-english');
  });

  it('falls back to a voice with the same base language', () => {
    const onlyUs = [{ identifier: 'us-female', language: 'en-US' }];
    expect(pickVoiceForLanguage(onlyUs, 'en-IN')?.identifier).toBe('us-female');
  });

  it('matches Hindi by exact tag', () => {
    expect(pickVoiceForLanguage(VOICES, 'hi-IN')?.identifier).toBe('hindi-male');
  });

  it('returns null when the device has no voice for the language, so the caller shows text', () => {
    expect(pickVoiceForLanguage(VOICES, 'kn-IN')).toBeNull();
    expect(pickVoiceForLanguage([], 'en-IN')).toBeNull();
  });
});
