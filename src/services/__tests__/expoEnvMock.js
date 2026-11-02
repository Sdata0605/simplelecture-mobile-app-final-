// Test stand-in for expo/virtual/env (babel-preset-expo inlines EXPO_PUBLIC_* through it).
module.exports = { env: process.env, default: process.env };
