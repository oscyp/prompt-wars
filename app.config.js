require('dotenv').config();

module.exports = ({ config: _config }) => {
  const nativeFixtures = process.env.PROMPT_WARS_NATIVE_FIXTURES === '1';
  if (
    nativeFixtures &&
    (process.env.NODE_ENV !== 'development' || process.env.EAS_BUILD)
  ) {
    throw new Error(
      'Native fixtures are local development only; unset PROMPT_WARS_NATIVE_FIXTURES for builds.',
    );
  }
  return {
    name: 'Prompt Wars',
    slug: 'prompt-wars',
    owner: 'prompt-wars',
    version: '1.3.1',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'promptwars',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/branding/wordmark.png',
      resizeMode: 'contain',
      backgroundColor: '#0B0B13',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'gg.promptwars.app',
      useAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      package: 'gg.promptwars.app',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      ['expo-splash-screen', { image: './assets/branding/wordmark.png', imageWidth: 280, backgroundColor: '#0B0B13' }],
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/BarlowCondensed-Bold.ttf',
            './assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf',
          ],
        },
      ],
      'expo-notifications',
      'expo-apple-authentication',
      'expo-sharing',
      'expo-video',
      [
        'expo-audio',
        {
          microphonePermission: false,
          recordAudioAndroid: false,
          enableBackgroundPlayback: false,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    newArchEnabled: true,
    extra: {
      router: {
        origin: false,
        ...(nativeFixtures ? { root: './test-support/fixtures/app' } : {}),
      },
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
    prebuild: {
      enabled: true,
    },
  };
};
