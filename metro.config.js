// Metro config. Extends Expo's defaults (do not replace them).
//
// Release-only behaviour: strip console.log / console.info / console.debug calls
// from MINIFIED bundles (EAS release builds, `expo export`). console.warn and
// console.error are kept for diagnostics. Metro only runs the minifier when
// minify is on (release / --minify true), so `expo start` and dev builds are
// unaffected. terser's `pure_funcs` only removes a call whose result is unused,
// and still keeps the side effects of its arguments (e.g. console.log(foo())
// becomes foo()).
//
// Escape hatch: set SL_KEEP_CONSOLE=1 to build a release bundle with all console
// calls kept (useful for debugging a release build or for A/B size comparison).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.SL_KEEP_CONSOLE !== '1') {
  const minifierConfig = config.transformer.minifierConfig || {};
  config.transformer = {
    ...config.transformer,
    minifierConfig: {
      ...minifierConfig,
      compress: {
        ...(minifierConfig.compress || {}),
        pure_funcs: [
          ...((minifierConfig.compress && minifierConfig.compress.pure_funcs) || []),
          'console.log',
          'console.info',
          'console.debug',
        ],
      },
    },
  };
}

module.exports = config;
