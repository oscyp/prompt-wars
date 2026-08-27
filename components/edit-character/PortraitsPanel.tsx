import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { ART_STYLE_LABELS, type ArtStyle } from '@/constants/CharacterTraits';
import { formatCredits } from '@/utils/credits';
import type { EditPricing } from '@/utils/editCooldowns';
import type { PortraitHistoryEntry } from '@/utils/characters';
import PortraitPreview from '../PortraitPreview';
import PortraitHistoryStrip from '../PortraitHistoryStrip';
import ArtStylePicker from '../ArtStylePicker';
import EditCardShell from './EditCardShell';
import { editStyles as s } from './styles';

const PROMPT_MAX = 120;

export interface PortraitsPanelProps {
  portraitUri: string;
  avatarUri: string;
  accentColor: string;
  hasPortrait: boolean;
  hasAvatar: boolean;
  /** False before the first render exists; the first one is free. */
  hasPortraitSeed: boolean;
  portraitStale: boolean;
  artStyle: ArtStyle;
  pricing: EditPricing;
  pricingVerified: boolean;
  history: PortraitHistoryEntry[];
  restoringId: string | null;
  busyKey: string | null;
  disabled?: boolean;
  onRenderPortrait: () => void;
  onRenderAvatar: () => void;
  onChangeArtStyle: (style: ArtStyle) => void;
  onDescribeNew: (prompt: string) => void;
  onPreviewHistory: (portraitId: string) => void;
  onOpenViewer: () => void;
}

/**
 * Everything that produces or replaces an image, in one place.
 *
 * Rendering used to be reachable from two places at once -- the hero's CTA and
 * this panel's Regenerate row -- which meant the same purchase had two
 * different labels and two different prices on screen. The hero is now inert
 * and every paid render lives here, beside the large preview you would want to
 * look at before paying for a different one.
 */
export default function PortraitsPanel({
  portraitUri,
  avatarUri,
  accentColor,
  hasPortrait,
  hasAvatar,
  hasPortraitSeed,
  portraitStale,
  artStyle,
  pricing,
  pricingVerified,
  history,
  restoringId,
  busyKey,
  disabled = false,
  onRenderPortrait,
  onRenderAvatar,
  onChangeArtStyle,
  onDescribeNew,
  onPreviewHistory,
  onOpenViewer,
}: PortraitsPanelProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const [style, setStyle] = useState<ArtStyle>(artStyle);
  const [prompt, setPrompt] = useState('');

  const renderCost = hasPortraitSeed
    ? (pricing.prices.regenerate_portrait?.credits ?? 1)
    : 0;
  const avatarCost = hasAvatar
    ? (pricing.prices.regenerate_avatar?.credits ?? 1)
    : 0;
  const newPortraitCost = pricing.prices.new_portrait?.credits ?? 2;

  // "See new look" read as though the render already existed and was merely
  // being shown. It does not: this makes one.
  const renderLabel = !hasPortraitSeed
    ? 'Generate portrait'
    : portraitStale
      ? 'Render updated look'
      : 'Regenerate portrait';

  const paidBlocked = disabled || !pricingVerified;
  const styleDirty = style !== artStyle;
  const promptReady = prompt.trim().length > 0;

  return (
    <ScrollView
      style={s.panelScroll}
      contentContainerStyle={s.panel}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        onPress={onOpenViewer}
        disabled={!hasPortrait}
        accessibilityRole="button"
        accessibilityLabel="View portrait full screen"
        style={styles.previewWrap}
      >
        <PortraitPreview
          uri={portraitUri}
          variant="fullBody"
          size={168}
          accentColor={accentColor}
          loading={busyKey === 'renderPortrait'}
          accessibilityLabel="Full-body portrait"
        />
      </TouchableOpacity>

      <EditCardShell
        title="Full-body portrait"
        subtitle={
          portraitStale
            ? 'Your look changed since this was rendered.'
            : 'Used on the reveal poster and as the video reference.'
        }
        cost={renderCost}
        disabled={paidBlocked && renderCost > 0}
      >
        <TouchableOpacity
          onPress={onRenderPortrait}
          disabled={
            busyKey === 'renderPortrait' || (paidBlocked && renderCost > 0)
          }
          accessibilityRole="button"
          accessibilityLabel={`${renderLabel}, ${formatCredits(renderCost, 'sentence')}`}
          style={[
            s.primaryBtn,
            { backgroundColor: colors.primary },
            busyKey === 'renderPortrait' && s.btnDisabled,
          ]}
        >
          {busyKey === 'renderPortrait' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={s.primaryBtnText}>
              {`${renderLabel} · ${formatCredits(renderCost, 'sentence')}`}
            </Text>
          )}
        </TouchableOpacity>
      </EditCardShell>

      <EditCardShell
        title="Avatar"
        subtitle={
          hasAvatar
            ? 'Head-and-shoulders render used in battle strips.'
            : 'No avatar yet — strips crop your full render instead.'
        }
        cost={avatarCost}
        disabled={paidBlocked && avatarCost > 0}
      >
        <View style={s.row}>
          <PortraitPreview
            uri={avatarUri}
            variant="circle"
            size={72}
            accentColor={accentColor}
            loading={busyKey === 'renderAvatar'}
            accessibilityLabel="Character avatar"
          />
          <TouchableOpacity
            onPress={onRenderAvatar}
            disabled={
              busyKey === 'renderAvatar' || (paidBlocked && avatarCost > 0)
            }
            accessibilityRole="button"
            accessibilityLabel={`${hasAvatar ? 'Regenerate avatar' : 'Generate avatar'}, ${formatCredits(avatarCost, 'sentence')}`}
            style={[
              s.primaryBtn,
              s.flex1,
              { backgroundColor: colors.primary },
              busyKey === 'renderAvatar' && s.btnDisabled,
            ]}
          >
            {busyKey === 'renderAvatar' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>
                {hasAvatar ? 'Regenerate' : 'Generate'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </EditCardShell>

      <EditCardShell
        title="Art style"
        subtitle={`Currently ${ART_STYLE_LABELS[artStyle]}. Changing it re-renders your portrait.`}
        cost={newPortraitCost}
        disabled={paidBlocked}
      >
        <ArtStylePicker
          title=""
          value={style}
          onChange={setStyle}
          disabled={busyKey === 'changeArtStyle'}
        />
        <TouchableOpacity
          onPress={() => onChangeArtStyle(style)}
          disabled={!styleDirty || busyKey === 'changeArtStyle'}
          accessibilityRole="button"
          accessibilityLabel={`Apply art style, ${formatCredits(newPortraitCost, 'sentence')}`}
          style={[
            s.primaryBtn,
            { backgroundColor: colors.primary },
            (!styleDirty || busyKey === 'changeArtStyle') && s.btnDisabled,
          ]}
        >
          {busyKey === 'changeArtStyle' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={s.primaryBtnText}>
              {styleDirty
                ? `Apply style · ${formatCredits(newPortraitCost)}`
                : 'Pick a different style'}
            </Text>
          )}
        </TouchableOpacity>
      </EditCardShell>

      <EditCardShell
        // "Re-prompt" is implementation language: it names the mechanism, not
        // what the player gets.
        title="Describe a new portrait"
        subtitle="Write your own description instead of using your traits."
        cost={newPortraitCost}
        disabled={paidBlocked}
      >
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="A new vision for your fighter"
          placeholderTextColor={colors.textTertiary}
          maxLength={PROMPT_MAX}
          multiline
          style={[
            s.input,
            s.multiline,
            { backgroundColor: colors.background, color: colors.text },
          ]}
          accessibilityLabel="New portrait description"
        />
        <Text style={[s.counter, { color: colors.textTertiary }]}>
          {`${prompt.length}/${PROMPT_MAX}`}
        </Text>
        <TouchableOpacity
          onPress={() => onDescribeNew(prompt.trim())}
          disabled={!promptReady || busyKey === 'describeNew'}
          accessibilityRole="button"
          accessibilityLabel={`Render this description, ${formatCredits(newPortraitCost, 'sentence')}`}
          style={[
            s.primaryBtn,
            { backgroundColor: colors.primary },
            (!promptReady || busyKey === 'describeNew') && s.btnDisabled,
          ]}
        >
          {busyKey === 'describeNew' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={s.primaryBtnText}>
              {`Render description · ${formatCredits(newPortraitCost)}`}
            </Text>
          )}
        </TouchableOpacity>
      </EditCardShell>

      {history.length > 0 ? (
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PortraitHistoryStrip
            entries={history}
            restoringId={restoringId}
            onSelect={onPreviewHistory}
          />
          <Text
            style={[s.hint, accessibleText, { color: colors.textTertiary }]}
          >
            Tap a render to see it full size, then restore it for free.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  previewWrap: {
    alignItems: 'center',
  },
});
