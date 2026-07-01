module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated v4 relies on the Worklets babel plugin. It MUST be listed last.
    // Without it, Reanimated animations (entering transitions, count-ups, springs)
    // silently no-op.
    plugins: ['react-native-worklets/plugin'],
  };
};
