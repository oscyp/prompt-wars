import React, { useState } from 'react';
import { Link, type Href } from 'expo-router';
import { isLoaded } from 'expo-font';
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import {
  GameText,
  GameButton,
  GameField,
  GameHeader,
  GameDisplayTitle,
  GameMasthead,
  GameIcon,
} from '@/components/game';
import { GAME_GLYPHS } from '@/components/game/icons/glyphs';
import type { GameIconName } from '@/components/game/icons/GameIcon';
import FighterCard from '@/components/game/FighterCard';
import { FighterStatTray } from '@/components/game/FighterStatTray';
import CreditChip from '@/components/CreditChip';
import VersusStrip from '@/components/VersusStrip';
import { BattleThemePlaque } from '@/components/game/battle/BattleThemePlaque';
import { BattleMovePicker } from '@/components/game/battle/BattleMovePicker';
import {
  BattleLockInControl,
  type LockInState,
} from '@/components/game/battle/BattleLockInControl';
import { ShopCategoryTabs } from '@/components/shop/ShopCategoryTabs';
import { ShopEquippedSummary } from '@/components/shop/ShopEquippedSummary';
import { ShopFilterControl } from '@/components/shop/ShopFilterControl';
import { ShopItemCard } from '@/components/shop/ShopItem';
import { ShopTrustFooter } from '@/components/shop/ShopTrustFooter';
import type { CosmeticType } from '@/utils/cosmetics';
import type { MoveType } from '@/utils/battles';
import {
  catalog,
  deadline,
  equipment,
  fighter,
  frameSlugs,
  names,
  statCases,
  themes,
} from '../mockupParity';

const states: LockInState[] = [
  'ready',
  'holding',
  'unavailable',
  'submitting',
  'failure',
  'submitted',
];
export default function NativeFixtures() {
  const [screen, setScreen] = useState('Arena');
  const [widthIndex, setWidthIndex] = useState(0);
  const [controls, setControls] = useState(true);
  const [nameIndex, setNameIndex] = useState(0);
  const [stats, setStats] = useState(0);
  const [frame, setFrame] = useState(0);
  const [long, setLong] = useState(false);
  const [single, setSingle] = useState(false);
  const [practice, setPractice] = useState(false);
  const [p2, setP2] = useState(false);
  const [score, setScore] = useState(false);
  const [move, setMove] = useState<MoveType>('attack');
  const [prompt, setPrompt] = useState(
    'I bind the forgotten stories into a shield of starlight.',
  );
  const [guided, setGuided] = useState(false);
  const [ideas, setIdeas] = useState(false);
  const [stateIndex, setStateIndex] = useState(0);
  const [category, setCategory] = useState<CosmeticType>('frame');
  const [owned, setOwned] = useState(false);
  const [message, setMessage] = useState('');
  const [failedArt, setFailedArt] = useState(false);
  const progress = useSharedValue(0);
  const { width, fontScale } = useWindowDimensions();
  const fixtureWidths = [width, 320, 375, 390];
  const fixtureWidth = Math.min(width, fixtureWidths[widthIndex]);
  const character = fighter(names[nameIndex]);
  const cosmetics = equipment(frame);
  const state = states[stateIndex];
  const localAction = () =>
    setMessage('Development preview only — no account changes.');
  const control = (label: string, action: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={action}
      style={styles.control}
    >
      <GameText>{label}</GameText>
    </Pressable>
  );
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {control(
            controls
              ? 'Development / read-only · Hide fixture controls'
              : 'Show development fixture controls',
            () => setControls(!controls),
          )}
          <Link href={'/edit-look' as Href} asChild>
            <Pressable accessibilityRole="button" style={styles.control}>
              <GameText>Edit Look fixture</GameText>
            </Pressable>
          </Link>
          {controls && (
            <View style={styles.controls}>
              <GameText>
                Native fixture · {width}pt · text {fontScale.toFixed(2)} ·
                bundled art · no live writes
              </GameText>
              <GameText>
                Display fonts:{' '}
                {isLoaded('BarlowCondensed-Bold') &&
                isLoaded('BarlowCondensed-ExtraBoldItalic')
                  ? 'loaded'
                  : 'unavailable — system fallback'}
              </GameText>
              <View style={styles.wrap}>
                {['Arena', 'Battle', 'Shop', 'Icons', 'Stats'].map((label) =>
                  control(label, () => setScreen(label)),
                )}
              </View>
              <View style={styles.wrap}>
                {control('Layout: ' + fixtureWidth + 'pt', () =>
                  setWidthIndex((widthIndex + 1) % fixtureWidths.length),
                )}
                {control('Name case', () =>
                  setNameIndex((nameIndex + 1) % names.length),
                )}
                {control(
                  'Stats: ' +
                    (stats === 0 ? 'mixed' : stats === 1 ? '1' : '10'),
                  () => setStats((stats + 1) % 3),
                )}
                {control('Frame: ' + (frameSlugs[frame] ?? 'none'), () =>
                  setFrame((frame + 1) % 3),
                )}
                {control('Long content: ' + long, () => setLong(!long))}
                {control('Missing art: ' + failedArt, () =>
                  setFailedArt(!failedArt),
                )}
              </View>
              {screen === 'Battle' && (
                <View style={styles.wrap}>
                  {control(single ? 'Single' : 'Bo3', () => setSingle(!single))}
                  {control(practice ? 'Practice' : 'Ranked', () =>
                    setPractice(!practice),
                  )}
                  {control(p2 ? 'Viewer P2' : 'Viewer P1', () => setP2(!p2))}
                  {control(score ? 'Score 1–0' : 'Score 0–0', () =>
                    setScore(!score),
                  )}
                  {control('Lock: ' + state, () => {
                    const next = (stateIndex + 1) % states.length;
                    setStateIndex(next);
                    progress.value = states[next] === 'holding' ? 0.65 : 0;
                  })}
                </View>
              )}
            </View>
          )}
          <View
            testID="native-fixture-capture"
            style={[
              styles.capture,
              { width: fixtureWidth - 40, alignSelf: 'center' },
            ]}
          >
            {screen === 'Stats' && (
              <>
                <GameHeader
                  title="Four fighter stats"
                  subtitle={`Native container ${fixtureWidth - 40}pt · text ${fontScale.toFixed(2)}`}
                />
                <FighterStatTray
                  stats={statCases[stats]}
                  availableWidth={fixtureWidth - 40}
                  fontScale={fontScale}
                />
              </>
            )}
            {screen === 'Arena' && (
              <>
                <GameMasthead
                  trailing={
                    <CreditChip
                      credits={long ? 123456789 : 1250}
                      onPress={localAction}
                    />
                  }
                  avatar={
                    <Image
                      accessibilityLabel={character.name}
                      source={{ uri: character.avatarUri }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                    />
                  }
                />
                <GameHeader
                  title="Your Arena"
                  subtitle="Write. Battle. Become a legend."
                />
                <FighterCard
                  name={character.name}
                  archetype="Mystic"
                  battleCry="Every story leaves a spark."
                  itemName="The starbound codex"
                  renderUri={
                    failedArt
                      ? 'file:///native-fixture-intentionally-missing.png'
                      : character.portraitUri
                  }
                  avatarUri={character.avatarUri}
                  signatureColor={character.signatureColor}
                  stats={statCases[stats]}
                  cosmetics={cosmetics}
                />
                <View style={styles.wrap}>
                  <GameButton
                    label="Customize"
                    gameIcon="hanger"
                    onPress={localAction}
                  />
                  <GameButton
                    label="Cosmetics"
                    gameIcon="mask"
                    onPress={localAction}
                  />
                </View>
              </>
            )}
            {screen === 'Battle' && (
              <>
                <GameDisplayTitle
                  style={{ textAlign: 'center', fontSize: 34, lineHeight: 40 }}
                >
                  {single ? 'YOUR MOVE' : 'ROUND 1 OF 3'}
                </GameDisplayTitle>
                <GameText style={styles.center}>
                  {practice ? 'Practice · AI opponent' : 'Ranked'}
                  {single ? '' : ' · First to 2 wins'}
                </GameText>
                <VersusStrip
                  left={{
                    name: character.name,
                    archetype: 'Mystic',
                    signatureColor: character.signatureColor,
                    portraitUrl: character.avatarUri,
                    cosmetics,
                    hp: 30,
                    hpMax: 40,
                    label: 'YOU',
                  }}
                  right={{
                    name: long ? names[3] : 'Rook',
                    archetype: 'Titan',
                    signatureColor: '#F2A060',
                    hp: 22,
                    hpMax: 40,
                    label: 'OPPONENT',
                  }}
                  series={
                    single
                      ? undefined
                      : {
                          score: { p1: score ? 1 : 0, p2: 0 },
                          currentRound: 1,
                          format: 'bo3',
                          viewer: p2 ? 'p2' : 'p1',
                        }
                  }
                />
                <BattleThemePlaque theme={themes[long ? 1 : 0]} />
                <GameText style={styles.center}>
                  {long ? deadline : 'Deadline: 15 September 2026, 23:59 CEST'}
                </GameText>
                <BattleMovePicker value={move} onChange={setMove} />
                <View style={styles.wrap}>
                  <GameText variant="label">YOUR PROMPT</GameText>
                  <GameButton
                    label="Ideas"
                    chrome="text"
                    onPress={() => setIdeas(!ideas)}
                  />
                </View>
                <GameButton
                  label={guided ? 'Guided writing' : 'Custom writing'}
                  chrome="text"
                  onPress={() => setGuided(!guided)}
                />
                {ideas && (
                  <GameText>
                    Local idea: Give the library a surprising defense. No paid
                    suggestion request is made.
                  </GameText>
                )}
                {guided && (
                  <GameText>
                    Describe your action, its target, and the dramatic result.
                  </GameText>
                )}
                <GameField
                  testID="fixture-prompt-editor"
                  accessibilityLabel="Your prompt"
                  multiline
                  value={prompt}
                  onChangeText={setPrompt}
                  style={{ minHeight: 160, textAlignVertical: 'top' }}
                />
                <GameText>
                  {state === 'failure'
                    ? 'Draft save failed · local text retained'
                    : 'Draft saved locally for this fixture session'}
                </GameText>
                {state === 'failure' && (
                  <GameText>
                    Submission failed. Your prompt is still here.
                  </GameText>
                )}
                <BattleLockInControl
                  state={state}
                  reason={
                    state === 'unavailable'
                      ? 'Fixture unavailable state'
                      : undefined
                  }
                  progress={progress}
                  screenReaderEnabled={false}
                  onStart={() => {
                    progress.value = 0.65;
                    setStateIndex(1);
                  }}
                  onCancel={() => {
                    progress.value = 0;
                    setStateIndex(0);
                  }}
                  onConfirm={localAction}
                />
                <GameText style={styles.center}>
                  You can’t change your prompt after locking in.
                </GameText>
                <GameButton
                  label="Use confirmation instead"
                  chrome="text"
                  onPress={localAction}
                />
              </>
            )}
            {screen === 'Shop' && (
              <>
                <GameMasthead
                  centered
                  leading={
                    <GameButton
                      label="Arena"
                      chrome="text"
                      onPress={() => setScreen('Arena')}
                    />
                  }
                  trailing={<CreditChip credits={1250} onPress={localAction} />}
                />
                <GameHeader
                  title="Cosmetic Shop"
                  subtitle="Make your legend unmistakable."
                />
                <ShopEquippedSummary
                  category={category}
                  items={catalog}
                  equipped={{ frame: frameSlugs[frame] }}
                  character={character}
                  characterStatus="ready"
                  onEdit={localAction}
                  onImageError={() => {}}
                />
                <ShopCategoryTabs value={category} onChange={setCategory} />
                <ShopFilterControl ownedOnly={owned} onChange={setOwned} />
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
                >
                  {catalog
                    .filter(
                      (item) =>
                        item.cosmetic_type === category &&
                        (!owned || item.owned),
                    )
                    .map((item) => (
                      <View
                        key={item.id}
                        style={{
                          width:
                            fixtureWidth >= 390 && fontScale <= 1.15
                              ? (fixtureWidth - 52) / 2
                              : '100%',
                        }}
                      >
                        <ShopItemCard
                          item={item}
                          character={character}
                          wearing={item.slug === frameSlugs[frame]}
                          onPreview={localAction}
                          onImageError={() => {}}
                        />
                      </View>
                    ))}
                </View>
                {catalog.filter(
                  (item) =>
                    item.cosmetic_type === category && (!owned || item.owned),
                ).length === 0 && (
                  <GameText>No owned items in this fixture category.</GameText>
                )}
                <ShopTrustFooter />
              </>
            )}
            {screen === 'Icons' && (
              <>
                <GameHeader
                  title="Icon contact sheet"
                  subtitle="Native labels and vector ornaments"
                />
                <View style={styles.wrap}>
                  {(Object.keys(GAME_GLYPHS) as GameIconName[]).map((name) => (
                    <View key={name} style={styles.icon}>
                      <GameIcon name={name} size={40} />
                      <GameText>{name}</GameText>
                    </View>
                  ))}
                </View>
                {names.map((name) => (
                  <GameDisplayTitle key={name} uppercase={false}>
                    {name}
                  </GameDisplayTitle>
                ))}
                <GameDisplayTitle finish="gold">
                  The Last Library
                </GameDisplayTitle>
                <GameDisplayTitle style={{ fontFamily: 'System' }}>
                  Explicit system font fallback
                </GameDisplayTitle>
              </>
            )}
          </View>
          {!!message && (
            <GameText accessibilityLiveRegion="polite">{message}</GameText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B13' },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  capture: { gap: 16 },
  controls: { padding: 8, backgroundColor: '#211C31', gap: 8 },
  control: {
    minHeight: 48,
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#76658D',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  center: { textAlign: 'center' },
  icon: { width: 100, minHeight: 90, alignItems: 'center', gap: 8 },
});
