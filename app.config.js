require('dotenv').config();

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config: _config }) => {
  return {
    name: IS_DEV ? 'Prompt Wars Dev' : 'Prompt Wars',
    slug: 'prompt-wars',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: IS_DEV
      ? 'com.promptwars.promptwars.dev'
      : 'com.promptwars.promptwars',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/splash-screen.png',
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: IS_DEV
        ? 'com.promptwars.promptwars.dev'
        : 'com.promptwars.promptwars',
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
      package: IS_DEV
        ? 'com.promptwars.promptwars.dev'
        : 'com.promptwars.promptwars',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-notifications',
      'expo-apple-authentication',
      'expo-sharing',
    ],
    experiments: {
      typedRoutes: true,
    },
    newArchEnabled: true,
    extra: {
      router: {
        origin: false,
      },
    },
    prebuild: {
      enabled: true,
    },
  };
};
