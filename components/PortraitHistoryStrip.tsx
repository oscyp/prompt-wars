import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import type { PortraitHistoryEntry } from '@/utils/characters';

export interface PortraitHistoryStripProps {
  entries: PortraitHistoryEntry[];
  /** Portrait id currently being restored, if any. */
  restoringId?: string | null;
  /** Opens the render for a full-size look. Restoring happens from there. */
  onSelect: (portraitId: string) => void;
}

/**
 * Previous renders, newest first. Tapping previews; restoring happens in the
 * viewer.
 *
 * Regenerating is paid and random, so without a way back the only remedy for a
 * bad roll is to pay again. Restoring is free and deliberately labelled as
 * such: the point is to make re-rolling feel low-stakes.
 *
 * A tap used to swap the live portrait immediately, which meant judging a
 * render and committing to it were the same gesture on a 46pt thumbnail. The
 * two are now separate.
 */
export default function PortraitHistoryStrip({
  entries,
  restoringId,
  onSelect,
}: PortraitHistoryStripProps) {
  const colors = useThemedColors();
  if (entries.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
        <Text style={[styles.title, { color: colors.textTertiary }]}>
          Previous renders · free to restore
        </Text>
      </View>
      <View style={styles.row}>
        {entries.map((entry) => {
          const busy = restoringId === entry.portraitId;
          return (
            <TouchableOpacity
              key={entry.portraitId}
              onPress={() => onSelect(entry.portraitId)}
              disabled={Boolean(restoringId)}
              accessibilityRole="button"
              accessibilityLabel="Preview this earlier render"
              style={[
                styles.thumb,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: restoringId && !busy ? 0.5 : 1,
                },
              ]}
            >
              <Image
                source={{ uri: entry.imageUrl }}
                style={styles.image}
                resizeMode="cover"
                accessibilityLabel=""
              />
              {busy ? (
                <View style={styles.busyOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const THUMB_W = 46;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    fontSize: Typography.sizes.xs,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  thumb: {
    width: THUMB_W,
    // 2:3, matching PortraitPreview's fullBody framing.
    height: Math.round(THUMB_W * 1.5),
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,10,0.55)',
  },
});
