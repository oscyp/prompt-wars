# Mockup parity — consumer inventory

Source inventory of the 21 existing screens. This confirms presentation entry points, not completion of every native state. Components inherit the central icon/text/card/button system. Startup and legacy redirects remain separate; no former mandatory screen was recreated.

| Screen | Shared presentation entry points |
|---|---|
| `app/(auth)/reset-password.tsx` | GameButton, GameField, GameHeader, GamePanel, GameSymbol, GameText |
| `app/(auth)/sign-in.tsx` | GameButton, GameField, GameHeader, GamePanel, GameSymbol, GameText |
| `app/(auth)/sign-up.tsx` | GameButton, GameField, GameHeader, GamePanel, GameSymbol, GameText |
| `app/(battle)/matchmaking.tsx` | ArenaTips, FighterEntrance, GameBevel, GameButton, GameDisplayTitle, GameFooter |
| `app/(battle)/prompt-entry.tsx` | GameDisplayTitle, GameField, GameFooter, GameIcon, GameSymbol, VersusStrip |
| `app/(battle)/result.tsx` | ConfirmSheet, GameBevel, GameButton, GameDisplayTitle, GameFooter, GamePanel, GameSymbol, ReportBlockSheet |
| `app/(battle)/round-result.tsx` | GameBevel, GameButton, GameDisplayTitle, GameFooter, GameSymbol |
| `app/(battle)/waiting.tsx` | ArenaTips, GameButton, GameDisplayTitle, GameFooter, GamePanel, GameSymbol, VersusStrip |
| `app/(onboarding)/create-character.tsx` | ConfirmSheet, FighterCard, GameButton, GameDisplayTitle, GameField, GameSymbol, GameText |
| `app/(onboarding)/welcome.tsx` | GameButton, GameHeader, GamePanel, GameScreen, GameText |
| `app/(profile)/blocked.tsx` | GameButton, GameDisplayTitle, GamePanel, GameSymbol |
| `app/(profile)/edit-character.tsx` | ArchetypeSheet, ConfirmSheet, CreditChip, GameButton, GameDisplayTitle, GameText, RenderRevealSheet, SegmentedCategoryBar |
| `app/(profile)/settings.tsx` | GameDisplayTitle, GameNavRow, GamePanel |
| `app/(profile)/shop.tsx` | BottomSheet, ConfirmSheet, CreditChip, GameHeader, GameMasthead, ShopButton, ShopCategoryTabs, ShopEquippedSummary, ShopFilterControl, ShopItemCard, ShopTrustFooter |
| `app/(profile)/stats.tsx` | GameButton, GameHeader, GamePanel, GameSymbol, GameText, MoveUsageChips |
| `app/(profile)/wallet.tsx` | GameBevel, GameDisplayTitle, GamePanel, GameSymbol |
| `app/(tabs)/battles.tsx` | GameBevel, GameButton, GameHeader, GameSymbol, GameText |
| `app/(tabs)/home.tsx` | ArenaFighter, CreditChip, GameAttentionStrip, GameSymbol |
| `app/(tabs)/profile.tsx` | FighterHero, GameButton, GameHeader, GameNavRow, GamePanel |
| `app/(tabs)/rankings.tsx` | GameHeader, GamePanel, GameSymbol, GameText |
| `app/create.tsx` | GameButton, GameHeader, GameScreen |

## Additional surfaces

- Root/tab layouts, `ArenaTabBar`, `BackButton`, `GameNavRow`, `PracticeReplayButton` and `SegmentedCategoryBar` retain routing events, focus, labels and fallback destinations while rendering the new family.
- Startup `app/index.tsx`, `BrandMark`, common banners/errors/toasts and `ResultShareCard` reuse existing presentation primitives. Legacy face-off/move-select routes redirect; generated-video branding stays untouched.
- App sheets: `BottomSheet`, `ConfirmSheet`, `BattleModeSheet`, `ReportBlockSheet`, `FirstTimeOfferModal`, `RenderRevealSheet`, `CosmeticPreview`, creator archetype/item/custom-item sheets and portrait viewers preserve scroll/footer/focus/mutation ownership. Internal action/status glyphs flow through `GameSymbol`.
- Move displays: `MoveTypeSelector`, `MoveTypeChipRow`, `MoveUsageChips`, `MoveSting`, workspace move badges and round results use custom move glyphs. Reveal judge/winner/verdict/payoff beats share the family; named winner icons retain explicit accessibility labels.
- Remaining `MaterialCommunityIcons` in `ArtStylePicker` and `ItemGrid` identify specific illustration genres/item classes. Broken-heart/handshake in round outcomes remain consistent semantic utility exceptions. Native Apple/payment/permission/system-dialog symbols remain native. `GameSymbol` preserves library fallback for unmapped utility icons and direct icon press handlers.

The acceptance matrix is authoritative for native evidence and blockers. No visual-only source scan can establish keyboard, screen-reader, performance or payment recovery acceptance.
