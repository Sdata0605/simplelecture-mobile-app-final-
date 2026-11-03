import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import App from './App';

// Same Expo Go check as src/services/fcmService.ts
const isExpoGo = Constants.appOwnership === 'expo';

// Background/quit-state FCM handler. Registered here (outside any component) as
// required by @react-native-firebase. The messaging module is loaded with a dynamic
// import so it never runs at top level, which keeps Expo Go safe.
if (!isExpoGo && (Platform.OS === 'android' || Platform.OS === 'ios')) {
  import('@react-native-firebase/messaging')
    .then(({ default: messaging }) => {
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        try {
          if (remoteMessage.data?.type === 'reminder_audio') {
            const { handleReminderAudioPush } = await import('./src/services/reminders/audioPush');
            await handleReminderAudioPush(remoteMessage.data as Record<string, string>);
          }
        } catch (e) {
          console.warn('[FCM] background reminder_audio handling failed:', e);
        }
      });
    })
    .catch((e) => console.warn('[FCM] background handler setup failed:', e));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
