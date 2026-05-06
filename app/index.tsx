import { Redirect } from 'expo-router';

/**
 * Root index redirects to auth flow
 * Navigation is handled by _layout.tsx based on auth state
 */
export default function Index() {
  return <Redirect href="/(auth)/sign-in" />;
}
