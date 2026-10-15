/**
 * Renders nothing but holds a screen wake lock for its entire lifetime.
 * Mount it while playback is active; unmount it when paused or stopped
 * and the device resumes normal auto-sleep behavior.
 *
 * Usage:
 *   {isPlaying && <KeepScreenAwake />}
 */
import { useKeepAwake } from 'expo-keep-awake';

export default function KeepScreenAwake() {
  useKeepAwake();
  return null;
}
