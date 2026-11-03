/**
 * Audio helpers for the Reminders call and message experience.
 *
 * - primeReminderVoice / takeReminderVoice: load a reminder's local voice file
 *   (paused) while the phone rings, so Answer only has to press play.
 * - useReminderCallAudio(localUri, reminderId): plays the pre-generated voice file
 *   (wav from Gemini, or legacy mp3). Uses the primed sound when there is one.
 *   One-way audio, loudspeaker, works in iOS silent mode.
 * - useSpokenFallback(): speaks the spoken script with the phone's own voice
 *   (expo-speech). Used when the file is missing or fails to play.
 * - useRingtone(active): loops the bundled ring tone and vibrates while an
 *   incoming call is ringing.
 *
 * Spec: _scratch/gemini-voice-plan.md D.5, F and G; _scratch/reminders-v2-plan.md E.9 and D-9.
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
  /** True when the last play used a sound loaded during ringing. */
  preloaded: boolean;
}

const RING_VIBRATION_PATTERN = [0, 1000, 800];
// The ring stops by itself after this long if nobody answers.
const RING_DURATION_MS = 20_000;
// A primed sound nobody answers is unloaded after this long.
const PRIME_TTL_MS = 60000;

interface PrimedVoice {
  reminderId: string;
  uri: string;
  sound: Audio.Sound;
  expiry: ReturnType<typeof setTimeout>;
}

// One paused sound at a time (the call that is ringing).
let primed: PrimedVoice | null = null;
// Bumped by every prime and release so a slow load that lost the race is dropped.
let primeSeq = 0;

/** Drops the primed sound, if any. Safe to call at any time. */
export function releaseReminderVoice(): void {
  primeSeq += 1;
  const current = primed;
  primed = null;
  if (!current) return;
  clearTimeout(current.expiry);
  current.sound.setOnPlaybackStatusUpdate(null);
  current.sound.unloadAsync().catch(() => {});
}

/**
 * Loads a reminder's local file paused, ready to play. Disk only (the caller passes a
 * local uri). Errors are swallowed: Answer then uses the normal load path.
 */
export async function primeReminderVoice(reminderId: string, uri: string): Promise<void> {
  if (primed && primed.reminderId === reminderId && primed.uri === uri) return;
  releaseReminderVoice();
  const seq = primeSeq;
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, progressUpdateIntervalMillis: 250 }
    );
    if (seq !== primeSeq) {
      sound.unloadAsync().catch(() => {});
      return;
    }
    const expiry = setTimeout(() => {
      if (primed && primed.sound === sound) releaseReminderVoice();
    }, PRIME_TTL_MS);
    primed = { reminderId, uri, sound, expiry };
  } catch (e) {
    console.warn('[ReminderVoice] prime failed', e);
  }
}

/** Hands over the primed sound for this reminder and uri. The caller owns it afterwards. */
function takeReminderVoice(reminderId: string, uri: string): Audio.Sound | null {
  if (!primed || primed.reminderId !== reminderId || primed.uri !== uri) return null;
  const { sound, expiry } = primed;
  clearTimeout(expiry);
  primed = null;
  primeSeq += 1;
  return sound;
}

export function useReminderCallAudio(
  localUri: string | null,
  reminderId: string | null = null,
): ReminderCallAudioResult {
  const [state, setState] = useState<ReminderCallAudioState>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [preloaded, setPreloaded] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  // Bumped on every play/stop so late async callbacks from an old run are ignored.
  const generationRef = useRef(0);
  const uriRef = useRef(localUri);
  uriRef.current = localUri;
  const idRef = useRef(reminderId);
  idRef.current = reminderId;
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
    const primedId = idRef.current;
    setState('loading');
    setPositionMs(0);

    (async () => {
      let pre: Audio.Sound | null = null;
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        if (generationRef.current !== myGen || !mountedRef.current) return;

        // Use the sound loaded during ringing when it matches; otherwise load now.
        pre = primedId ? takeReminderVoice(primedId, uri) : null;
        let sound: Audio.Sound;
        if (pre) {
          if (generationRef.current !== myGen || !mountedRef.current) {
            pre.unloadAsync().catch(() => {});
            return;
          }
          await pre.playAsync();
          sound = pre;
        } else {
          const created = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true, progressUpdateIntervalMillis: 250 }
          );
          sound = created.sound;
        }
        if (mountedRef.current) setPreloaded(!!pre);
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
        if (pre) pre.unloadAsync().catch(() => {});
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

  return { state, play, stop, positionMs, durationMs, preloaded };
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
    const stopTimer = setTimeout(() => {
      Vibration.cancel();
      if (sound) sound.stopAsync().catch(() => {});
    }, RING_DURATION_MS);

    return () => {
      cancelled = true;
      clearTimeout(stopTimer);
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
