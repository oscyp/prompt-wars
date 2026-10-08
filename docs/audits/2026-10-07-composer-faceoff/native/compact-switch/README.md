# Compact mode switch — 7 October 2026

Applied the user-approved Compact switch design to Face-off. The production route and isolated composer fixture now share `ComposerModeSwitch`: two wrapping Barlow labels, one filled lavender selection without checkmarks/icons, minimum 56-point targets, selected/disabled accessibility states, and a changing system-font description. Selecting a mode does not advance; Next remains separate. Existing mode handlers, separate drafts and legacy controls are preserved.

## Completed checks

- TypeScript: `yarn tsc --noEmit` passed.
- ESLint: new component, production prompt-entry route and composer fixture passed.
- Prettier: new component passed.
- Existing Jest suites: `promptComposerFlow`, `promptComposerPanel`, `usePromptComposer`, and `battleWorkspaceLayout`: **105 tests passed**. These cover the real route's mode selection, Next/Back, draft preservation, disabled/closed states and submission behavior.
- `node scripts/visual-fixtures-check.cjs` passed the fixture isolation checks.
- Independent code review found no material issue; the existing spoken label “Write your own prompt” was retained for accessibility and route compatibility.
- Existing iPhone 17 Pro development host, iOS 26.5, 402 points, normal text: the shared component rendered with the approved geometry, selection and helper copy. Screenshot: `ios-402-build-selected.jpg`. This is a local component fixture, not a live battle.

## Unverified native checks

The simulator initially included a stale development connection-error layer in its accessibility tree. A tap on Write your own was reported successful but did not change the rendered selection. After restarting the existing host, screenshots rendered while the runtime accessibility snapshot returned no interactive targets. The cause was not established; native mode-change/Next/Back checks are **not a pass**. No code workaround was introduced for this tooling behavior.

Narrow-screen and enlarged-text rendering of this native component, VoiceOver/TalkBack traversal and Android checks remain unverified in this follow-up. The earlier HTML mockup checks do not certify native rendering. The component permits wrapping without fixed text heights or truncation.

No build, installation, OTA, store submission, live account operation, backend change or deployment was performed. The task-owned isolated Metro server was stopped after checking. Simulator content size was only read (`large`), not changed; XcodeBuildMCP session defaults were restored.
