import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GameButton,
  GameHeader,
  CreditAmount,
  GameText,
} from '@/components/game';
import FighterCard from '@/components/game/FighterCard';
import {
  EditorFooter,
  EditorPreview,
  EditorTabs,
} from '@/components/edit-character/EditorChrome';
import LookPanel, {
  type LookPanelProps,
} from '@/components/edit-character/LookPanel';
import IdentityPanel, {
  type IdentityPanelProps,
} from '@/components/edit-character/IdentityPanel';
import GearPanel from '@/components/edit-character/GearPanel';
import type { DescribeMode } from '@/components/edit-character/ModeToggle';
import BottomSheet from '@/components/sheets/BottomSheet';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';
import InlineBanner from '@/components/InlineBanner';
import type {
  DraftKey,
  DraftSection,
  DraftValues,
} from '@/hooks/useCharacterEditDraft';
import {
  useSheetReturnFocus,
  type SheetFocusRef,
} from '@/hooks/useSheetReturnFocus';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { CatalogSignatureItem } from '@/utils/characters';
import type { EditPricing } from '@/utils/editCooldowns';
import { spendRows } from '@/utils/editDialogCopy';
import { equipment, fighter, statCases } from '../mockupParity';

const identity: IdentityPanelProps['character'] = {
  name: 'Mira',
  archetype: 'mystic',
  battle_cry: 'Every story leaves a spark.',
  signature_color: '#B69AF8',
};
const initialLook: LookPanelProps['look'] = {
  artStyle: 'comic',
  palette: 'ember',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  era: 'modern',
  expression: 'calm',
  portraitPromptRaw: null,
};
const items: CatalogSignatureItem[] = [
  {
    id: 'fixture-pen',
    name: 'Fountain pen',
    description: 'A silver nib that turns bold ideas into legends.',
    itemClass: 'tool',
  },
  {
    id: 'fixture-compass',
    name: 'Compass',
    description: 'Always points toward the next impossible adventure.',
    itemClass: 'tool',
  },
  {
    id: 'fixture-hourglass',
    name: 'Hourglass',
    description: 'Keeps a little borrowed time close at hand.',
    itemClass: 'relic',
  },
  {
    id: 'fixture-crown',
    name: 'Crown fragment',
    description: 'The last piece of a forgotten kingdom.',
    itemClass: 'symbol',
  },
  {
    id: 'fixture-briefcase',
    name: 'Briefcase',
    description: 'Carries everything needed for a brilliant argument.',
    itemClass: 'tool',
  },
  {
    id: 'fixture-coin',
    name: 'Lucky coin',
    description: 'A familiar token carried through every battle.',
    itemClass: 'symbol',
  },
  {
    id: 'fixture-wrench',
    name: 'Wrench',
    description: 'For taking impossible problems apart.',
    itemClass: 'tool',
  },
  {
    id: 'fixture-microphone',
    name: 'Microphone',
    description: 'Makes every battle cry a headline.',
    itemClass: 'instrument',
  },
  {
    id: 'fixture-tarot',
    name: 'Tarot card',
    description: 'An illustrated glimpse of another possible future.',
    itemClass: 'relic',
  },
  {
    id: 'fixture-stopwatch',
    name: 'Stopwatch',
    description: 'Makes every second count.',
    itemClass: 'tool',
  },
  {
    id: 'fixture-chair',
    name: 'Folding Chair',
    description: 'A seat at any table.',
    itemClass: 'weaponized_mundane',
  },
  {
    id: 'fixture-polaroid',
    name: 'Polaroid',
    description: 'Captures the moment an idea becomes real.',
    itemClass: 'tool',
  },
  {
    id: 'fixture-fork',
    name: 'Tuning Fork',
    description: 'Finds the right frequency for every word.',
    itemClass: 'instrument',
  },
  {
    id: 'fixture-megaphone',
    name: 'Megaphone',
    description: 'A little more reach for a big idea.',
    itemClass: 'instrument',
  },
  {
    id: 'fixture-umbrella',
    name: 'Umbrella',
    description: 'A shelter for unexpected inspiration.',
    itemClass: 'weaponized_mundane',
  },
];
const pricing: EditPricing = {
  prices: {
    rename: { credits: 0, cooldownSeconds: 604800 },
    archetype: { credits: 0, cooldownSeconds: 1209600 },
    battle_cry: { credits: 0, cooldownSeconds: 86400 },
    signature_color: { credits: 0, cooldownSeconds: 86400 },
  },
  cooldownMs: {},
};
const lookKeys: DraftKey[] = [
  'artStyle',
  'portraitPromptRaw',
  'palette',
  'vibe',
  'silhouette',
  'era',
  'expression',
];
const identityKeys: DraftKey[] = [
  'name',
  'archetype',
  'battleCry',
  'signatureColor',
];
const localArt = fighter('Mira');
const cosmetics = equipment(2);
type Presentation = 'ready' | 'locked' | 'pending' | 'failure';
type Sheet = 'card' | 'history' | 'save' | 'render' | 'shuffle' | null;

/** Presentation only: no persistent draft hook, account provider, or server action. */
export default function EditLookFixture() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    section?: string;
    controls?: string;
    included?: string;
  }>();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const controlsRef = useRef<View>(null);
  const { remember, returnFocusRef } = useSheetReturnFocus(controlsRef);
  const [controls, setControls] = useState(true);
  const [section, setSection] = useState<DraftSection>('look');
  const [mode, setMode] = useState<DescribeMode>('guided');
  const [writtenText, setWrittenText] = useState(
    'A fearless storyteller in a violet cloak, carrying a silver fountain pen.',
  );
  const [editingDraft, setEditingDraft] = useState<DraftValues>({});
  type EditingDraftField = keyof typeof editingDraft;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [presentation, setPresentation] = useState<Presentation>('ready');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const includedDraws = Math.min(
    3,
    Math.max(0, Math.floor(Number(params.included) || 0)),
  );
  const revealFocusedInput = useCallback(() => {
    requestAnimationFrame(() => {
      const focused = TextInput.State.currentlyFocusedInput?.();
      if (!focused) return;
      const handle = findNodeHandle(
        focused as unknown as Parameters<typeof findNodeHandle>[0],
      );
      if (handle)
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(
          handle,
          12,
          true,
        );
    });
  }, []);
  useEffect(() => {
    if (keyboardVisible) revealFocusedInput();
  }, [
    keyboardVisible,
    footerHeight,
    window.width,
    window.height,
    window.fontScale,
    revealFocusedInput,
  ]);

  useEffect(() => {
    if (params.section === 'gear' || params.section === 'look')
      setSection(params.section);
    if (params.section === 'fighter') setSection('identity');
    if (params.controls === 'hide') setControls(false);
  }, [params.section, params.controls]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const stage = (key: EditingDraftField, value: string | null) => {
    if (presentation !== 'ready') return;
    setEditingDraft((current) => ({ ...current, [key]: value }));
    if (key === 'portraitPromptRaw' && value !== null) setWrittenText(value);
  };
  const switchMode = (next: DescribeMode) => {
    if (presentation !== 'ready') return;
    setMode(next);
    setEditingDraft((current) => ({
      ...current,
      portraitPromptRaw: next === 'prompt' ? writtenText : null,
    }));
  };
  const changeSection = (next: DraftSection) => {
    Keyboard.dismiss();
    setSection(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const show = (
    next: Exclude<Sheet, null>,
    opener: SheetFocusRef = controlsRef,
  ) => {
    Keyboard.dismiss();
    remember(opener);
    setSheet(next);
  };
  const reset = () => {
    Keyboard.dismiss();
    setEditingDraft({});
    setPresentation('ready');
    setMode('guided');
    setSection('look');
    setExpanded({});
    setMessage(null);
    setSheet(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const choose = (next: DraftSection, writing = false) => {
    setPresentation('ready');
    changeSection(next);
    if (next === 'look') {
      setMode(writing ? 'prompt' : 'guided');
      setEditingDraft((current) => ({
        ...current,
        portraitPromptRaw: writing ? writtenText : null,
      }));
    }
  };
  const setStatus = (next: Presentation) => {
    Keyboard.dismiss();
    setPresentation(next);
    setMessage(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const localOnly = () => {
    setSheet(null);
    setMessage('Preview only. Your account and artwork have not changed.');
  };
  const baseline: Record<DraftKey, string | null> = {
    name: identity.name,
    archetype: identity.archetype,
    battleCry: identity.battle_cry,
    signatureColor: identity.signature_color,
    ...initialLook,
    signatureItemId: items[0].id,
  };
  const changedKeys = new Set<DraftKey>(
    (Object.keys(editingDraft) as DraftKey[]).filter(
      (key) => editingDraft[key] !== baseline[key],
    ),
  );
  const dirty = changedKeys.size > 0;
  const dirtySections = {
    identity: identityKeys.some((key) => changedKeys.has(key)),
    look: lookKeys.some((key) => changedKeys.has(key)),
    gear: changedKeys.has('signatureItemId'),
  };
  const look: LookPanelProps['look'] = {
    artStyle:
      (editingDraft.artStyle as LookPanelProps['look']['artStyle']) ??
      initialLook.artStyle,
    palette:
      (editingDraft.palette as LookPanelProps['look']['palette']) ??
      initialLook.palette,
    vibe: editingDraft.vibe ?? initialLook.vibe,
    silhouette: editingDraft.silhouette ?? initialLook.silhouette,
    era: editingDraft.era ?? initialLook.era,
    expression: editingDraft.expression ?? initialLook.expression,
    portraitPromptRaw: mode === 'prompt' ? writtenText : null,
  };
  const stagedName = editingDraft.name ?? identity.name;
  const archetype = editingDraft.archetype ?? identity.archetype;
  const accent = editingDraft.signatureColor ?? identity.signature_color;
  const equippedId = editingDraft.signatureItemId ?? items[0].id;
  const disabled = presentation !== 'ready';
  const compact =
    keyboardVisible || window.fontScale > 1.3 || window.height < 740;
  const status =
    presentation === 'locked'
      ? 'View only during an active battle'
      : presentation === 'pending'
        ? 'Still processing · Check status'
        : presentation === 'failure'
          ? 'Drawing failed · your choices are kept'
          : dirty
            ? 'Unsaved changes · artwork unchanged'
            : '';
  const control = (label: string, action: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={'DEV ' + label}
      onPress={action}
      style={styles.control}
    >
      <GameText variant="caption" style={styles.controlLabel}>
        {label}
      </GameText>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      testID="edit-look-fixture"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.root,
        { paddingTop: insets.top, backgroundColor: colors.background },
      ]}
    >
      <View style={styles.devNote}>
        <Pressable
          ref={controlsRef}
          accessibilityRole="button"
          accessibilityLabel={
            controls
              ? 'Hide Edit Look fixture controls'
              : 'Show Edit Look fixture controls'
          }
          onPress={() => setControls(!controls)}
          style={{ flex: 1, paddingVertical: 4 }}
        >
          <GameText variant="caption" style={styles.devLabel}>
            {controls
              ? `DEV · local presentation · ${window.width} × ${window.height} · hide`
              : 'DEV · local presentation · controls'}
          </GameText>
        </Pressable>
      </View>
      {controls && !keyboardVisible && (
        <ScrollView
          horizontal
          style={styles.controlRail}
          contentContainerStyle={styles.controls}
          showsHorizontalScrollIndicator
        >
          {control('Look', () => choose('look'))}
          {control('Writing', () => choose('look', true))}
          {control('Fighter', () => choose('identity'))}
          {control('Gear', () => choose('gear'))}
          {control('Locked', () => setStatus('locked'))}
          {control('Pending', () => setStatus('pending'))}
          {control('Failure', () => setStatus('failure'))}
          {control('Card', () => show('card'))}
          {control('History', () => show('history'))}
          {control('Confirm', () => show('render'))}
          {control('Reset', reset)}
        </ScrollView>
      )}
      <GameHeader
        presentation="secondary"
        title="Edit Look"
        style={{ paddingHorizontal: 12 }}
        leading={
          <GameButton
            label="Back"
            chrome="text"
            tone="secondary"
            gameIcon="chevron-left"
            accessibilityLabel="Back to native fixtures"
            onPress={() => router.back()}
          />
        }
        trailing={!keyboardVisible && <CreditAmount amount={12} />}
      />
      {!keyboardVisible && window.fontScale <= 1.3 && (
        <EditorPreview
          name={stagedName}
          archetype={archetype}
          avatarUri={localArt.avatarUri}
          cosmetics={cosmetics}
          accentColor={accent}
          compact={compact}
          dirty={dirty}
          onView={(ref) => show('card', ref)}
          onHistory={(ref) => show('history', ref)}
        />
      )}
      <EditorTabs
        value={section}
        dirty={dirtySections}
        onChange={changeSection}
      />
      <ScrollView
        ref={scroll}
        testID="edit-look-fixture-form"
        style={styles.form}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        onLayout={revealFocusedInput}
        onContentSizeChange={() => {
          if (keyboardVisible) revealFocusedInput();
        }}
      >
        {!keyboardVisible && window.fontScale > 1.3 && (
          <EditorPreview
            name={stagedName}
            archetype={archetype}
            avatarUri={localArt.avatarUri}
            cosmetics={cosmetics}
            accentColor={accent}
            compact={compact}
            dirty={dirty}
            onView={(ref) => show('card', ref)}
            onHistory={(ref) => show('history', ref)}
          />
        )}

        {(status || (includedDraws > 0 && presentation === 'ready')) &&
          window.fontScale > 1.3 && (
            <GameText
              variant="caption"
              accessibilityLiveRegion="polite"
              style={{ paddingHorizontal: 16, paddingVertical: 8 }}
            >
              {includedDraws > 0 && presentation === 'ready'
                ? [`${includedDraws} included draws remaining`, status]
                    .filter(Boolean)
                    .join(' · ')
                : status}
            </GameText>
          )}
        {presentation === 'locked' && (
          <View style={styles.notice}>
            <InlineBanner
              tone="warning"
              text="This fighter is in 2 active battles. Editing is view only until they finish."
              actionLabel="Manage 2 battles"
              onAction={localOnly}
            />
          </View>
        )}
        {presentation === 'pending' && (
          <View style={styles.notice}>
            <InlineBanner
              text="Your drawing is still processing. You can leave and return; your current artwork remains available."
              actionLabel="Check status"
              onAction={localOnly}
            />
          </View>
        )}
        {presentation === 'failure' && (
          <View style={styles.notice}>
            <InlineBanner
              tone="error"
              text="The last drawing could not finish. Your choices and current artwork are kept."
              actionLabel="Check status"
              onAction={localOnly}
            />
          </View>
        )}
        {message && (
          <GameText
            variant="caption"
            accessibilityLiveRegion="polite"
            style={styles.notice}
          >
            {message}
          </GameText>
        )}
        {compact && (
          <GameButton
            label="Previous looks"
            labelStyle={{ fontSize: 16 }}
            chrome="text"
            tone="secondary"
            onPress={() => show('history')}
          />
        )}
        {section === 'look' ? (
          <LookPanel
            onInputFocus={revealFocusedInput}
            look={look}
            changedKeys={changedKeys}
            disabled={disabled}
            mode={mode}
            writtenText={writtenText}
            onModeChange={switchMode}
            onStage={(key, value) => stage(key as EditingDraftField, value)}
            expandedGroups={expanded}
            onExpandedGroupChange={(key, value) =>
              setExpanded((current) => ({ ...current, [key]: value }))
            }
          />
        ) : section === 'identity' ? (
          <IdentityPanel
            onInputFocus={revealFocusedInput}
            character={identity}
            staged={editingDraft}
            changedKeys={changedKeys}
            pricing={pricing}
            disabled={disabled}
            onStage={stage}
          />
        ) : (
          <GearPanel
            items={items}
            currentItem={items[0]}
            equippedId={equippedId}
            savedItemId={items[0].id}
            loading={false}
            error={null}
            disabled={disabled}
            disabledReason={
              presentation === 'locked'
                ? 'View only while this fighter is in 2 active battles.'
                : 'Wait for the current drawing to finish.'
            }
            disabledActionLabel={
              presentation === 'locked' ? 'Manage 2 battles' : 'Check status'
            }
            onDisabledAction={localOnly}
            onRetry={localOnly}
            onEquip={(id) => stage('signatureItemId', id)}
          />
        )}
        <View style={styles.notice}>
          <GameButton
            label="Shuffle & draw"
            amount={5}
            tone="secondary"
            gameIcon="dice"
            disabled={disabled}
            onPress={() => show('shuffle')}
          />
          {dirty && (
            <GameButton
              label="Discard changes"
              chrome="text"
              tone="danger"
              onPress={() => setEditingDraft({})}
            />
          )}
        </View>
      </ScrollView>
      <View style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
        <EditorFooter
          status={
            includedDraws > 0 && presentation === 'ready'
              ? [`${includedDraws} included draws remaining`, status]
                  .filter(Boolean)
                  .join(' · ')
              : status
          }
          renderLabel={
            presentation === 'pending' || presentation === 'failure'
              ? 'Check status'
              : 'Review & draw'
          }
          saveDisabled={!dirty || disabled}
          renderDisabled={presentation === 'locked'}
          keyboardVisible={keyboardVisible}
          savePrimary={dirty}
          onSave={(ref) => show('save', ref)}
          onRender={(ref) =>
            presentation === 'ready' ? show('render', ref) : localOnly()
          }
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        />
      </View>
      <BottomSheet
        visible={sheet === 'card'}
        title={stagedName}
        closeAccessibilityLabel="Close full-screen portrait"
        returnFocusRef={returnFocusRef}
        onClose={() => setSheet(null)}
        footer={
          <GameButton
            label="Back to editing"
            tone="secondary"
            onPress={() => setSheet(null)}
          />
        }
      >
        <FighterCard
          name={stagedName}
          archetype={archetype}
          renderUri={localArt.portraitUri}
          avatarUri={localArt.avatarUri}
          signatureColor={accent}
          cosmetics={cosmetics}
          stats={statCases[0]}
          battleCry={editingDraft.battleCry ?? identity.battle_cry}
        />
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'history'}
        title="Previous looks"
        subtitle="Your artwork is kept when you try a new look."
        closeAccessibilityLabel="Close previous looks"
        returnFocusRef={returnFocusRef}
        onClose={() => setSheet(null)}
        footer={
          <GameButton label="Back to editing" onPress={() => setSheet(null)} />
        }
      >
        {[1, 2].map((entry) => (
          <View key={entry} style={{ gap: 8, marginBottom: 16 }}>
            <Image
              source={{ uri: localArt.portraitUri ?? '' }}
              resizeMode="contain"
              style={{ width: '100%', height: 180 }}
            />
            <GameText variant="caption">
              Earlier artwork · local example {entry}
            </GameText>
            <GameButton
              label="Preview this look"
              tone="secondary"
              onPress={() => setSheet('card')}
            />
          </View>
        ))}
      </BottomSheet>
      <ConfirmSheet
        visible={sheet === 'save' || sheet === 'render' || sheet === 'shuffle'}
        returnFocusRef={returnFocusRef}
        title={
          sheet === 'save'
            ? 'Save your changes?'
            : sheet === 'shuffle'
              ? 'Shuffle a random character?'
              : 'Draw this look?'
        }
        subtitle={
          sheet === 'save'
            ? 'Update your fighter’s choices. Your current artwork stays as it is.'
            : 'A new drawing uses your selected look and signature item.'
        }
        lines={
          sheet === 'save'
            ? [
                'Preview of your staged choices only; no draft is persisted.',
                'Drawing new artwork is optional.',
              ]
            : sheet === 'render' && includedDraws > 0
              ? [
                  `Uses 1 included draw. ${includedDraws - 1} remaining afterwards.`,
                ]
              : undefined
        }
        rows={
          sheet === 'save'
            ? []
            : spendRows(sheet === 'shuffle' ? 5 : includedDraws > 0 ? 0 : 3, 12)
        }
        thumbnailUri={sheet === 'render' ? localArt.portraitUri : undefined}
        accentColor={accent}
        footnote="DEV preview only. Confirm closes this sheet; no request, account change, or durable draft is made."
        confirmLabel={
          sheet === 'save'
            ? 'Save changes'
            : sheet === 'shuffle'
              ? 'Shuffle and draw'
              : 'Draw this look'
        }
        onConfirm={localOnly}
        onCancel={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  devNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#211C31',
  },
  devLabel: { fontSize: 11, lineHeight: 14, color: '#D8C8EB' },
  controlRail: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#211C31',
    maxHeight: 44,
  },
  controls: { paddingHorizontal: 8, gap: 4 },
  control: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#76658D',
    borderRadius: 4,
  },
  controlLabel: { fontSize: 12, color: '#EEE3FC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  back: { width: 40, minHeight: 48, justifyContent: 'center' },
  form: { flex: 1, minHeight: 0 },
  notice: { marginHorizontal: 16, marginTop: 12, gap: 8 },
});
