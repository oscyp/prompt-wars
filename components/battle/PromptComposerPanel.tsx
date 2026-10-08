import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { GameButton, GamePanel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import SegmentedCategoryBar, {
  type SegmentedCategoryItem,
} from '@/components/SegmentedCategoryBar';
import { MOVE_META } from '@/constants/MoveTypes';
import { ComposerChoiceRecap } from '@/components/battle/ComposerChoiceRecap';
import type { ComposerActionSuggestion, MoveType } from '@/utils/battles';
import type {
  ApproachHint,
  BuilderChange,
  ComposerState,
  IntentHint,
} from '@/utils/promptComposer';

/** Selection-only composer. Editing belongs exclusively to Write your own. */
export function PromptComposerPanel({
  state,
  suggestions,
  disabled,
  onChange,
  onMoveType,
  stage = 'action',
  intentHints,
  approachHints,
  actionsLoading = false,
}: {
  state: ComposerState;
  suggestions: ComposerActionSuggestion[];
  onMoveType: (move: MoveType) => void;
  stage?: 'action' | 'intent' | 'approach' | 'all';
  disabled: boolean;
  onChange: (change: BuilderChange) => void;
  intentHints?: IntentHint[];
  approachHints?: ApproachHint[];
  actionsLoading?: boolean;
  // Compatibility for existing fixture consumers; these no longer expose controls.
  affordanceId?: string | null;
  paidIds?: string[];
  ideasRevision?: number;
  viewedBank?: MoveType | null;
  onViewAll?: () => void;
  onActionSelected?: (anchor: View | null) => void;
  onUndo?: () => void;
  onConfirm?: (field: 'intent' | 'approach') => void;
  onFieldFocus?: (field: TextInput | null) => void;
}) {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const actions = state.moveType
    ? suggestions.filter((choice) => choice.moveType === state.moveType)
    : [];
  const intents = intentHints ?? state.intentHints ?? [];
  const approaches = approachHints ?? state.approachHints ?? [];
  const showAction = stage === 'action' || stage === 'all';
  const selectedText =
    stage === 'intent'
      ? state.intentText
      : stage === 'approach'
        ? state.approachText
        : state.actionText;
  const selectedVisible =
    stage === 'intent'
      ? intents.some((hint) => hint.id === state.intentId)
      : stage === 'approach'
        ? approaches.some((hint) => hint.id === state.approachId)
        : actions.some((choice) => choice.id === state.actionId);
  return (
    <View style={styles.panel}>
      {showAction ? (
        <View style={styles.section}>
          <GameText variant="label" accessibilityRole="header">
            What do you do?
          </GameText>
          <ComposerMoveTypeControl
            value={state.moveType}
            onChange={onMoveType}
            disabled={disabled}
          />
          {actionsLoading && !actions.length ? (
            <GamePanel
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Preparing actions. This may take a few seconds."
              accessibilityState={{ busy: true }}
              accessibilityLiveRegion="polite"
              style={styles.loading}
            >
              {reduceMotion ? (
                <GameIcon name="clock" size={32} color={colors.primary} />
              ) : (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  accessible={false}
                />
              )}
              <GameText style={{ color: colors.textSecondary }}>
                Preparing actions…
              </GameText>
              <GameText
                variant="caption"
                style={{ color: colors.textSecondary }}
              >
                This may take a few seconds.
              </GameText>
            </GamePanel>
          ) : state.moveType ? (
            actions.map((choice) => (
              <GameButton
                key={choice.id}
                label={choice.action ?? choice.body}
                tone="secondary"
                chrome="utility"
                selectionIndicator="accent-edge"
                labelStyle={styles.choiceLabel}
                accessibilityRole="radio"
                selected={!state.detached && state.actionId === choice.id}
                disabled={disabled}
                onPress={() =>
                  onChange({
                    type: 'action',
                    text: choice.action ?? choice.body,
                    id: choice.id ?? null,
                    moveType: choice.moveType,
                    intentHints: choice.intentHints,
                  })
                }
              />
            ))
          ) : (
            <GameText>Choose a move type to see three actions.</GameText>
          )}
          {state.moveType && !actions.length && !actionsLoading ? (
            <GameText>Actions aren’t available yet.</GameText>
          ) : null}
        </View>
      ) : null}
      {stage === 'intent' || stage === 'approach' ? (
        <View style={styles.section}>
          <View style={styles.recap}>
            <ComposerChoiceRecap
              key={JSON.stringify([
                state.contextKey,
                stage,
                state.moveType,
                state.actionId,
                state.actionText,
                ...(stage === 'approach'
                  ? [state.intentId, state.intentText]
                  : []),
              ])}
              moveType={state.moveType}
              actionText={state.actionText}
              intentText={stage === 'approach' ? state.intentText : undefined}
            />
          </View>
          <GameText variant="label" accessibilityRole="header">
            {stage === 'intent'
              ? 'What are you trying to achieve?'
              : 'How will you make it work?'}
          </GameText>
          {stage === 'intent'
            ? intents.map((hint) => (
                <GameButton
                  key={hint.id}
                  label={hint.text}
                  tone="secondary"
                  chrome="utility"
                  selectionIndicator="accent-edge"
                  labelStyle={styles.choiceLabel}
                  accessibilityRole="radio"
                  selected={state.intentId === hint.id}
                  disabled={disabled}
                  onPress={() =>
                    onChange({
                      type: 'intent',
                      id: hint.id,
                      text: hint.text,
                      approachHints: hint.approachHints,
                    })
                  }
                />
              ))
            : approaches.map((hint) => (
                <GameButton
                  key={hint.id}
                  label={hint.text}
                  tone="secondary"
                  chrome="utility"
                  selectionIndicator="accent-edge"
                  labelStyle={styles.choiceLabel}
                  accessibilityRole="radio"
                  selected={state.approachId === hint.id}
                  disabled={disabled}
                  onPress={() =>
                    onChange({ type: 'approach', id: hint.id, text: hint.text })
                  }
                />
              ))}
          {!(stage === 'intent' ? intents.length : approaches.length) ? (
            <GameText>
              These choices are unavailable. Go Back to choose another action or
              return to Face-off to write your own.
            </GameText>
          ) : null}
        </View>
      ) : null}
      {selectedText && !selectedVisible ? (
        <View style={styles.section}>
          <GameText variant="label">Current selection</GameText>
          <GameText>{selectedText}</GameText>
        </View>
      ) : null}
    </View>
  );
}
const TYPES: MoveType[] = ['attack', 'defense', 'finisher'];
const LABELS = { attack: 'Attack', defense: 'Defense', finisher: 'Finisher' };
const MOVE_OPTIONS: SegmentedCategoryItem[] = TYPES.map((move) => ({
  key: move,
  label: LABELS[move],
  gameIcon: MOVE_META[move].gameIcon,
}));
export function ComposerMoveTypeControl({
  value,
  onChange,
  disabled = false,
}: {
  value: MoveType | null;
  onChange: (move: MoveType) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.section}>
      <GameText variant="label">Move type</GameText>
      <SegmentedCategoryBar
        items={MOVE_OPTIONS}
        value={value ?? ''}
        disabled={disabled}
        itemRole="radio"
        compact
        onChange={(move) => {
          if (TYPES.includes(move as MoveType) && move !== value) {
            onChange(move as MoveType);
          }
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 20, marginBottom: 20 },
  section: { gap: 8 },
  recap: { marginBottom: 12 },
  loading: {
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  choiceLabel: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
    textAlign: 'left',
    flex: 1,
  },
});
