# Prompt Wars

Mobile-first competitive AI prompt battle game built with Expo and Supabase.

## Quick Start

### Prerequisites

- Node.js 18+ and yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator
- Supabase account

### Installation

1. Clone the repository:
```bash
cd /Users/patdom/sources/prompt-wars
```

2. Install dependencies:
```bash
yarn install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your Supabase and RevenueCat keys
```

4. Start the development server:
```bash
yarn start
```

5. Run on a platform:
```bash
# iOS (macOS only)
yarn ios

# Android
yarn android
```

## Available Scripts

- `yarn start` - Start the Expo development server
- `yarn ios` - Run on iOS simulator
- `yarn android` - Run on Android emulator
- `yarn test` - Run Jest tests
- `yarn test:watch` - Run tests in watch mode
- `yarn lint` - Lint code with ESLint
- `yarn format` - Format code with Prettier
- `yarn format:check` - Check code formatting

## Project Structure

```
prompt-wars/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Authentication screens
│   ├── (onboarding)/      # Onboarding flow
│   ├── (tabs)/            # Main tab navigation
│   ├── (battle)/          # Battle flow screens
│   ├── (profile)/         # Profile and settings
│   └── _layout.tsx        # Root layout
├── components/            # Reusable UI components
├── constants/             # App constants and config
├── hooks/                 # Custom React hooks
├── providers/             # React context providers
├── utils/                 # Utility functions
├── styles/                # Shared styles
└── assets/                # Images, fonts, etc.
```

## Architecture

See [docs/prompt-wars-implementation-concept.md](docs/prompt-wars-implementation-concept.md) for the full implementation plan.

- **Frontend**: Expo SDK 55 + React Native 0.83.2
- **Navigation**: Expo Router
- **Backend**: Supabase (Auth, Postgres, Realtime, Storage, Edge Functions)
- **Monetization**: RevenueCat
- **AI Providers**: xAI / X AI (video generation, LLM judge)

## Development

### Running Tests

```bash
yarn test
```

### Linting and Formatting

```bash
yarn lint
yarn format
```

### Building for Production

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

## MVP Phase Roadmap

- **Phase 0** (Current): Project scaffolding
- **Phase 1**: Concept prototype - navigation, auth, character creation
- **Phase 2**: Playable async MVP - battles, matchmaking, server resolution
- **Phase 3**: AI video integration - video generation pipeline
- **Phase 4**: Stats, rankings, and economy
- **Phase 5**: Retention and polish

## Contributing

This is a private project. For questions or issues, contact the team.

## License

Proprietary - All rights reserved
