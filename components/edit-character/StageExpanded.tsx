import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ForcedColorSchemeProvider,
  useThemedColors,
} from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
  Scrim,
} from '@/constants/DesignTokens';
import {
  RENDER_PHASE_LABEL,
  type ButtonCopy,
  type RenderPhase,
} from '@/utils/editDialogCopy';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import type { PortraitHistoryEntry } from '@/utils/characters';
import { describeChangedSinceRender } from '@/utils/lookDiff';
import PosterGradient from '../PosterGradient';
import PortraitPreview from '../PortraitPreview';
import InlineBanner from '../InlineBanner';
import CosmeticTitle from '../CosmeticTitle';
import CosmeticBadge from '../CosmeticBadge';
import { historyRowsThatFit } from './stageMath';
import type { EditNotice } from './editNotices';

export interface StageExpandedProps {
  name: string;
  /** e.g. "Comic Book style" — the archetype has its own chip. */
  subtitle: string;
  /** The class chip (`ArchetypeChip`), rendered under the name. */
  archetypeChip?: React.ReactNode;
  fighterUri: string;
  avatarUri: string;
  hasPortrait: boolean;
  accentColor: string;
  cosmetics: EquippedCosmetics;
  /** From `fighterHeight()`; the render is drawn at 2:3 inside it. */
  fighterHeight: number;
  busy: boolean;
  portraitStale: boolean;
  /** From `changedSinceRender()`; only read while `portraitStale`. */
  changedFields: string[];
  notice: EditNotice | null;
  history: PortraitHistoryEntry[];
  restoringId: string | null;
  renderButton: ButtonCopy;
  randomButton: ButtonCopy;
  rendering: boolean;
  renderPhase: RenderPhase | null;
  /** `Date.now()` when the render started; drives the elapsed counter. */
  renderStartedAt: number | null;
  renderExpectedCopy: string;
  renderingCaption: string;
  onRender: () => void;
  onRandom: () => void;
  onOpenViewer: () => void;
  onSelectHistory: (portraitId: string) => void;
}

const WHITE = '#FFFFFF';
const WHITE_72 = 'rgba(255,255,255,0.72)';
const AVATAR_SIZE = 72;
const HISTORY_THUMB_W = 28;
const DICE_SIZE = 48;

/**
 * The Stage at rest: the character as a character, not a settings row.
 *
 * A cinematic surface like `PortraitViewer`, so it commits to the near-black
 * poster treatment in both themes. The subtree is forced to the dark scheme so
 * the themed children (banner, portrait frames, cosmetics) resolve colours
 * that read against it rather than against the app background.
 */
export default function StageExpanded(props: StageExpandedProps) {
  return (
    <ForcedColorSchemeProvider scheme="dark">
      <StageExpandedBody {...props} />
    </ForcedColorSchemeProvider>
  );
}

function StageExpandedBody({
  name,
  subtitle,
  archetypeChip,
  fighterUri,
  avatarUri,
  hasPortrait,
  accentColor,
  cosmetics,
  fighterHeight,
  busy,
  portraitStale,
  changedFields,
  notice,
  history,
  restoringId,
  renderButton,
  randomButton,
  rendering,
  renderPhase,
  renderStartedAt,
  renderExpectedCopy,
  renderingCaption,
  onRender,
  onRandom,
  onOpenViewer,
  onSelectHistory,
}: StageExpandedProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const fighterWidth = Math.round(fighterHeight / 1.5);
  const historyRows = historyRowsThatFit(fighterHeight);
  const visibleHistory = history.slice(0, historyRows);
  const changedLine = describeChangedSinceRender(changedFields, portraitStale);

  const renderDisabled = rendering || renderButton.intent === 'disabled';
  const randomDisabled = rendering || randomButton.intent === 'disabled';

  return (
    <View style={styles.root}>
      <PosterGradient base={accentColor} />
      <View style={styles.content}>
        {notice ? (
          <InlineBanner
            tone={notice.tone}
            text={notice.text}
            actionLabel={notice.actionLabel}
            onAction={notice.onAction}
          />
        ) : null}

        <View style={styles.columns}>
          <Pressable
            onPress={onOpenViewer}
            disabled={!hasPortrait}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s portrait full screen`}
            accessibilityState={{ disabled: !hasPortrait }}
            style={styles.fighter}
          >
            <PortraitPreview
              variant="fullBody"
              size={fighterWidth}
              uri={fighterUri}
              accentColor={accentColor}
              frame={cosmetics.frame}
              loading={busy}
            />
            {hasPortrait ? (
              <View style={styles.expandPill} pointerEvents="none">
                <Ionicons name="expand-outline" size={14} color={WHITE} />
              </View>
            ) : null}
          </Pressable>

          <View style={styles.side}>
            <PortraitPreview
              variant="circle"
              size={AVATAR_SIZE}
              uri={avatarUri}
              accentColor={accentColor}
              frame={cosmetics.frame}
              avatarEffect={cosmetics.avatarEffect}
              accessibilityLabel={`${name}, battle avatar`}
            />
            <Text style={[styles.sideCaption, accessibleText]}>In battle</Text>

            {visibleHistory.length > 0 ? (
              <View style={styles.history}>
                <Text
                  style={[styles.historyCaption, accessibleText]}
                  numberOfLines={2}
                >
                  Previous renders · free to restore
                </Text>
                {visibleHistory.map((entry) => {
                  const restoring = restoringId === entry.portraitId;
                  return (
                    <TouchableOpacity
                      key={entry.portraitId}
                      onPress={() => onSelectHistory(entry.portraitId)}
                      disabled={Boolean(restoringId)}
                      accessibilityRole="button"
                      accessibilityLabel="Preview this earlier render"
                      accessibilityState={{ disabled: Boolean(restoringId) }}
                      style={[
                        styles.historyRow,
                        restoringId && !restoring && styles.dimmed,
                      ]}
                    >
                      <Image
                        source={{ uri: entry.imageUrl }}
                        style={styles.historyThumb}
                        resizeMode="cover"
                        accessibilityLabel=""
                      />
                      <Text
                        style={[styles.historyText, accessibleText]}
                        numberOfLines={1}
                      >
                        Earlier render
                      </Text>
                      {restoring ? (
                        <ActivityIndicator size="small" color={WHITE} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text
            style={[styles.name, accessibleText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {name}
          </Text>
          <CosmeticBadge badge={cosmetics.badge} size={20} />
        </View>
        {archetypeChip ? (
          <View style={styles.chipRow}>{archetypeChip}</View>
        ) : null}
        <CosmeticTitle title={cosmetics.title} />
        <Text style={[styles.subtitle, accessibleText]} numberOfLines={2}>
          {subtitle}
        </Text>

        {changedLine ? (
          <View style={styles.changedRow}>
            <Ionicons name="sync-outline" size={14} color={colors.warning} />
            <Text
              style={[
                styles.changed,
                accessibleText,
                { color: colors.warning },
              ]}
              numberOfLines={2}
            >
              {changedLine}
            </Text>
          </View>
        ) : null}

        {rendering ? (
          <DrawingBlock
            phase={renderPhase}
            startedAt={renderStartedAt}
            expectedCopy={renderExpectedCopy}
            caption={renderingCaption}
          />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onRender}
              disabled={renderDisabled}
              accessibilityRole="button"
              accessibilityLabel={renderButton.accessibilityLabel}
              accessibilityState={{ disabled: renderDisabled }}
              style={[
                styles.renderBtn,
                { backgroundColor: colors.primary },
                renderDisabled && styles.disabled,
              ]}
            >
              <Text
                style={[styles.renderLabel, accessibleText]}
                numberOfLines={1}
              >
                {renderButton.label}
              </Text>
              {renderButton.caption ? (
                <Text
                  style={[styles.renderCaption, accessibleText]}
                  numberOfLines={1}
                >
                  {renderButton.caption}
                </Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRandom}
              disabled={randomDisabled}
              accessibilityRole="button"
              accessibilityLabel={randomButton.accessibilityLabel}
              accessibilityState={{ disabled: randomDisabled }}
              style={[styles.diceBtn, randomDisabled && styles.disabled]}
            >
              <Ionicons name="dice-outline" size={22} color={WHITE} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const FALLBACK_PHASE_LABEL = 'Drawing…';

interface DrawingBlockProps {
  phase: RenderPhase | null;
  startedAt: number | null;
  expectedCopy: string;
  caption: string;
}

/**
 * Replaces the actions row while a render is in flight: which leg is running,
 * how long it has been, how long it usually takes, and what is being drawn.
 */
function DrawingBlock({
  phase,
  startedAt,
  expectedCopy,
  caption,
}: DrawingBlockProps) {
  const accessibleText = useAccessibleTextStyle();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = phase ? RENDER_PHASE_LABEL[phase] : FALLBACK_PHASE_LABEL;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(label);
  }, [label]);

  const elapsed =
    startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <View style={styles.drawing}>
      <View style={styles.drawingHead}>
        <ActivityIndicator color={WHITE} />
        <Text style={[styles.drawingPhase, accessibleText]} numberOfLines={2}>
          {label}
        </Text>
        <Text
          style={[styles.drawingElapsed, accessibleText]}
          accessibilityLabel={`${elapsed} seconds elapsed`}
        >
          {`${elapsed}s`}
        </Text>
      </View>
      <Text style={[styles.drawingExpected, accessibleText]} numberOfLines={1}>
        {expectedCopy}
      </Text>
      <Text style={[styles.drawingCaption, accessibleText]} numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  fighter: {
    alignSelf: 'flex-start',
  },
  expandPill: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Scrim.pill,
  },
  side: {
    flex: 1,
    alignItems: 'flex-start',
  },
  sideCaption: {
    marginTop: Spacing.xs,
    minHeight: 16,
    fontSize: Typography.sizes.xs,
    color: WHITE_72,
    // The avatar is 72 wide; centre the caption under it.
    width: AVATAR_SIZE,
    textAlign: 'center',
  },
  history: {
    marginTop: Spacing.sm,
    alignSelf: 'stretch',
  },
  historyCaption: {
    minHeight: 16,
    fontSize: Typography.sizes.xs,
    color: WHITE_72,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
  },
  historyThumb: {
    width: HISTORY_THUMB_W,
    height: Math.round(HISTORY_THUMB_W * 1.5),
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  historyText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: WHITE,
  },
  dimmed: { opacity: 0.5 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
  },
  name: {
    flexShrink: 1,
    fontSize: Typography.sizes.display,
    fontWeight: Typography.weights.bold,
    color: WHITE,
  },
  chipRow: {
    flexDirection: 'row',
    minHeight: 32,
  },
  subtitle: {
    minHeight: 18,
    fontSize: Typography.sizes.sm,
    color: WHITE_72,
  },
  changedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 18,
  },
  changed: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  renderBtn: {
    flex: 1,
    minHeight: DICE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
  },
  renderLabel: {
    color: WHITE,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  renderCaption: {
    color: WHITE_72,
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  diceBtn: {
    width: DICE_SIZE,
    height: DICE_SIZE,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  disabled: { opacity: 0.5 },
  drawing: {
    minHeight: DICE_SIZE,
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  drawingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 24,
  },
  drawingPhase: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: WHITE,
  },
  drawingElapsed: {
    ...NumericFontVariant,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: WHITE,
  },
  drawingExpected: {
    minHeight: 16,
    fontSize: Typography.sizes.xs,
    color: WHITE_72,
  },
  drawingCaption: {
    minHeight: 16,
    fontSize: Typography.sizes.sm,
    fontStyle: 'italic',
    color: WHITE_72,
  },
});
