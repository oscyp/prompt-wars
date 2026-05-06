/**
 * App route constants for type-safe navigation
 */
export const AppRoutes = {
  // Auth
  Auth: '/(auth)',
  SignIn: '/(auth)/sign-in',
  SignUp: '/(auth)/sign-up',

  // Onboarding
  Onboarding: '/(onboarding)',
  Welcome: '/(onboarding)/welcome',
  CreateCharacter: '/(onboarding)/create-character',

  // Main tabs
  Tabs: '/(tabs)',
  Home: '/(tabs)/home',
  Battles: '/(tabs)/battles',
  Create: '/(tabs)/create',
  Rankings: '/(tabs)/rankings',
  Profile: '/(tabs)/profile',

  // Battle flow
  Battle: '/(battle)',
  Matchmaking: '/(battle)/matchmaking',
  PromptEntry: '/(battle)/prompt-entry',
  Waiting: '/(battle)/waiting',
  Result: '/(battle)/result',

  // Profile & Settings
  Settings: '/(profile)/settings',
  Wallet: '/(profile)/wallet',
  Stats: '/(profile)/stats',
} as const;
