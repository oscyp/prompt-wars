#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -n "${EAS_BUILD:-}" ] || [ "${NODE_ENV:-}" = production ]; then
  echo 'Native fixtures cannot run in production or EAS builds.' >&2
  exit 1
fi
export NODE_ENV=development
export PROMPT_WARS_NATIVE_FIXTURES=1
# The ordinary server owns .expo/types and tsconfig; fixture routes are isolated.
export EXPO_NO_TYPESCRIPT_SETUP=1
# Shared presentational imports include the eager Supabase module. Give it a
# separate, non-serving local origin so it cannot restore a real app session.
export EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:9
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-native-fixture-placeholder
export EXPO_PUBLIC_SUPABASE_ANON_KEY=local-native-fixture-placeholder
exec npx expo start --dev-client --port 8082 "$@"
