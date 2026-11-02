/**
 * Audio helpers for the Reminders call and message experience.
 *
 * - useReminderCallAudio(localUri): plays the pre-generated mp3 for a reminder
 *   (one-way audio, loudspeaker, works in iOS silent mode).
 * - useSpokenFallback(): speaks the spoken script with the phone's own voice
 *   (expo-speech). Used when the mp3 is missing or fails to play.
 * - useRingtone(active): loops the bundled ring tone and vibrates while an
 *   incoming call is ringing.
 *
 * Spec: _scratch/reminders-v2-plan.md E.9 (fallback ladder) and D-9.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Speech from 'expo-speech';
import { Vibration } from 'react-native';
import { voiceLock } from '../services/voiceLock';
import type { VoiceLanguage } from '../types/reminder';

export type ReminderCallAudioState = 'idle' | 'loading' | 'playing' | 'ended' | 'error';

export interface ReminderCallAudioResult {
  state: ReminderCallAudioState;
  play: () => void;
  stop: () => void;
  positionMs: number;
  durationMs: number;
}

const RING_VIBRATION_PATTERN = [0, 1000, 800];

export function useReminderCallAudio(localUri: string | null): ReminderCallAudioResult {
  const [state, setState] = useState<ReminderCallAudioState>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  // Bumped on every play/stop so late async callbacks from an old run are ignored.
  const generationRef = useRef(0);
  const uriRef = useRef(localUri);
  uriRef.current = localUri;
  const mountedRef = useRef(true);

  const teardown = useCallback(() => {
    generationRef.current += 1;
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      sound.setOnPlaybackStatusUpdate(null);
      sound.unloadAsync().catch(() => {});
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    if (mountedRef.current) {
      setState('ended');
    }
  }, [teardown]);

  const play = useCallback(() => {
    const uri = uriRef.current;
    teardown();
    if (!uri) {
      setState('error');
      return;
    }
    // Another voice feature (for example the AI teacher) holds the lock: do not overlap.
    if (voiceLock.getOwner() !== null) {
      setState('error');
      return;
    }

    const myGen = generationRef.current;
    setState('loading');
    setPositionMs(0);

    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        if (generationRef.current !== myGen || !mountedRef.current) return;

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 }
        );
        if (generationRef.current !== myGen || !mountedRef.current) {
          sound.unloadAsync().catch(() => {});
          return;
        }

        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (generationRef.current !== myGen) return;
          if (!status.isLoaded) {
            if (status.error) setState('error');
            return;
          }
          setPositionMs(status.positionMillis ?? 0);
          if (status.durationMillis) setDurationMs(status.durationMillis);
          if (status.isPlaying) {
            setState('playing');
          }
          if (status.didJustFinish) {
            setState('ended');
          }
        });
        setState('playing');
      } catch (e) {
        console.warn('[ReminderCallAudio] playback failed', e);
        if (generationRef.current === myGen && mountedRef.current) {
          setState('error');
        }
      }
    })();
  }, [teardown]);

  // Unload on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  return { state, play, stop, positionMs, durationMs };
}

export interface VoiceCandidate {
  identifier: string;
  language: string;
}

function normalizeTag(tag: string): string {
  return tag.replace(/_/g, '-').toLowerCase();
}

/**
 * Picks a device voice for a reminder language. An exact tag match (en-IN) wins;
 * otherwise any voice with the same base language (en-*) is accepted.
 * Returns null when the device has no usable voice, so the caller shows text.
 */
export function pickVoiceForLanguage(
  voices: ReadonlyArray<VoiceCandidate>,
  language: VoiceLanguage
): VoiceCandidate | null {
  const want = normalizeTag(language);
  const base = want.split('-')[0];
  const exact = voices.find((v) => normalizeTag(v.language) === want);
  if (exact) return exact;
  return voices.find((v) => normalizeTag(v.language).split('-')[0] === base) ?? null;
}

export type SpokenState = 'idle' | 'loading' | 'speaking' | 'ended' | 'error';

/**
 * - started:     speech was handed to the OS (watch `state` for onDone/onError)
 * - unavailable: no script, or no device voice for this language
 * - locked:      another voice feature holds the voice lock
 * - cancelled:   a newer speak or stop replaced this request
 */
export type SpeakOutcome = 'started' | 'unavailable' | 'locked' | 'cancelled';

export interface SpokenFallbackResult {
  state: SpokenState;
  speak: (script: string, language: VoiceLanguage) => Promise<SpeakOutcome>;
  stop: () => void;
}

export function useSpokenFallback(): SpokenFallbackResult {
  const [state, setState] = useState<SpokenState>('idle');
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      Speech.stop();
    };
  }, []);

  const setIfMounted = useCallback((next: SpokenState) => {
    if (mountedRef.current) setState(next);
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    Speech.stop();
    setIfMounted('ended');
  }, [setIfMounted]);

  const speak = useCallback(
    async (script: string, language: VoiceLanguage): Promise<SpeakOutcome> => {
      generationRef.current += 1;
      const myGen = generationRef.current;
      Speech.stop();

      const text = script.trim();
      if (!text) return 'unavailable';
      if (voiceLock.getOwner() !== null) {
        setIfMounted('error');
        return 'locked';
      }

      setIfMounted('loading');
      let voices: VoiceCandidate[] = [];
      try {
        voices = await Speech.getAvailableVoicesAsync();
      } catch {
        voices = [];
      }
      if (myGen !== generationRef.current) return 'cancelled';

      const voice = pickVoiceForLanguage(voices, language);
      if (!voice) {
        setIfMounted('error');
        return 'unavailable';
      }

      const isCurrent = () => myGen === generationRef.current && mountedRef.current;
      Speech.speak(text, {
        language,
        voice: voice.identifier,
        onStart: () => {
          if (isCurrent()) setState('speaking');
        },
        onDone: () => {
          if (isCurrent()) setState('ended');
        },
        onStopped: () => {
          if (isCurrent()) setState('ended');
        },
        onError: () => {
          if (isCurrent()) setState('error');
        },
      });
      return 'started';
    },
    [setIfMounted]
  );

  return { state, speak, stop };
}

/**
 * Loops the bundled ring tone and vibrates while `active` is true.
 * Stops and unloads when `active` becomes false or on unmount.
 */
export function useRingtone(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let sound: Audio.Sound | null = null;

    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          // Ring follows the silent switch on iOS (OS behaviour).
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const created = await Audio.Sound.createAsync(
          require('../../assets/sounds/study_call_ring.wav'),
          { shouldPlay: true, isLooping: true, volume: 1 }
        );
        if (cancelled) {
          created.sound.unloadAsync().catch(() => {});
          return;
        }
        sound = created.sound;
      } catch (e) {
        console.warn('[RingTone] could not start ring tone', e);
      }
    })();

    Vibration.vibrate(RING_VIBRATION_PATTERN, true);

    return () => {
      cancelled = true;
      Vibration.cancel();
      if (sound) {
        sound.setOnPlaybackStatusUpdate(null);
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        sound = null;
      }
    };
  }, [active]);
}
