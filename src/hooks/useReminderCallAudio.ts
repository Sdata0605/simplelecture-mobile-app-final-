/**
 * Audio helpers for the Study "Call reminder" feature.
 *
 * - useReminderCallAudio(localUri): plays the pre-generated mp3 for a reminder
 *   (one-way audio, loudspeaker, works in iOS silent mode).
 * - useRingtone(active): loops the bundled ring tone and vibrates while an
 *   incoming call is ringing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Vibration } from 'react-native';
import { voiceLock } from '../services/voiceLock';

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
