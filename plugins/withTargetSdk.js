const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withTargetSdk(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) =>
        item.key !== 'android.targetSdkVersion' &&
        item.key !== 'android.compileSdkVersion'
    );
    // API 36 (Android 16) — Play Console rejects uploads targeting below 36.
    // Supported by RN 0.81 / Expo SDK 54; compileSdk must be >= targetSdk.
    config.modResults.push({ type: 'property', key: 'android.targetSdkVersion', value: '36' });
    config.modResults.push({ type: 'property', key: 'android.compileSdkVersion', value: '36' });
    return config;
  });
};
