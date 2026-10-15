const { withAndroidManifest } = require('@expo/config-plugins');

const TARGET_NAME = 'com.google.firebase.messaging.default_notification_color';
const TARGET_COLOR = '@color/notification_icon_color';

/**
 * Expo config plugin to fix the Android manifest merger conflict between
 * expo-notifications and @react-native-firebase/messaging.
 *
 * Both plugins declare default_notification_color meta-data. The merger fails
 * unless the app entry has tools:replace="android:resource".
 *
 * Strategy: remove any existing entries and re-add a single authoritative one
 * with tools:replace explicitly set, bypassing fragile attribute-patching.
 */
module.exports = function withFirebaseMessagingFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure xmlns:tools namespace is declared on the root manifest element
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (!application) return config;

    // Remove any existing default_notification_color entries (added by either
    // expo-notifications or @react-native-firebase/messaging plugin)
    const metaDataList = application['meta-data'] ?? [];
    application['meta-data'] = metaDataList.filter(
      (item) => item.$?.['android:name'] !== TARGET_NAME
    );

    // Re-add a single authoritative entry with tools:replace so the app value
    // wins over the library's default (@color/white) during manifest merge
    application['meta-data'].push({
      $: {
        'android:name': TARGET_NAME,
        'android:resource': TARGET_COLOR,
        'tools:replace': 'android:resource',
      },
    });

    return config;
  });
};
