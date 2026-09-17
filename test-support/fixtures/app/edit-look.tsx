import React, { useEffect, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GameButton,
  GameDisplayTitle,
  GameIcon,
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
type Sheet = 'card' | 'history' | 'save' | 'render' | null;

/** Presentation only: no persistent draft hook, account provider, or server action. */
export default function EditLookFixture() {
  const router = useRouter();
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
            : 'Current artwork · drawing is optional';
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
            DEV · local presentation · {window.width} × {window.height} ·{' '}
            {controls ? 'hide' : 'controls'}
          </GameText>
        </Pressable>
        {keyboardVisible &&
          control('Dismiss keyboard', () => Keyboard.dismiss())}
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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to native fixtures"
          onPress={() => router.back()}
          style={styles.back}
        >
          <GameIcon name="chevron-left" size={24} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <GameDisplayTitle
            style={{
              textAlign: 'center',
              fontSize: window.fontScale > 1.3 ? 24 : 30,
            }}
          >
            Edit Look
          </GameDisplayTitle>
        </View>
        <GameText variant="caption" style={{ color: colors.ornament }}>
          12 credits
        </GameText>
      </View>
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
        onLayout={() => {
          if (!keyboardVisible) return;
          const focused = TextInput.State.currentlyFocusedInput?.();
          const handle = focused
            ? findNodeHandle(
                focused as unknown as Parameters<typeof findNodeHandle>[0],
              )
            : null;
          if (handle)
            scroll.current?.scrollResponderScrollNativeHandleToKeyboard(
              handle,
              footerHeight + 12,
              true,
            );
        }}
      >
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
              actionLabel="Check render"
              onAction={localOnly}
            />
          </View>
        )}
        {presentation === 'failure' && (
          <View style={styles.notice}>
            <InlineBanner
              tone="error"
              text="The last drawing could not finish. Your choices and current artwork are kept."
              actionLabel="Check render"
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
              presentation === 'locked' ? 'Manage 2 battles' : 'Check render'
            }
            onDisabledAction={localOnly}
            onRetry={localOnly}
            onEquip={(id) => stage('signatureItemId', id)}
          />
        )}
        <View style={styles.notice}>
          <GameButton
            label="Shuffle & draw · 5 credits"
            tone="secondary"
            gameIcon="replay"
            disabled={disabled}
            onPress={() => show('render')}
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
          status={status}
          renderLabel={
            presentation === 'pending' || presentation === 'failure'
              ? 'Check render'
              : 'Draw this look · 3 credits'
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
        <GameText variant="caption">Current artwork</GameText>
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
        visible={sheet === 'save' || sheet === 'render'}
        returnFocusRef={returnFocusRef}
        title={sheet === 'save' ? 'Save your changes?' : 'Draw this look?'}
        subtitle={
          sheet === 'save'
            ? 'Update your fighter’s choices. Your current artwork stays as it is.'
            : 'A new drawing uses your selected look and signature item.'
        }
        lines={
          sheet === 'save'
            ? [
                'Your staged choices will be saved for free.',
                'Drawing new artwork is optional.',
              ]
            : undefined
        }
        rows={
          sheet === 'save'
            ? []
            : [
                { label: 'Price', value: '3 credits' },
                { label: 'Balance', value: '12 credits' },
                { label: 'After', value: '9 credits' },
              ]
        }
        thumbnailUri={sheet === 'render' ? localArt.portraitUri : undefined}
        accentColor={accent}
        footnote="DEV preview only. Confirm closes this sheet; no request or account change is made."
        confirmLabel={
          sheet === 'save' ? 'Save changes · Free' : 'Draw · 3 credits'
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
