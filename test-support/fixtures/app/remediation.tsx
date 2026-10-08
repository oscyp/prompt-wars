import React, { useState } from 'react';
import { Image, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { GameButton, GameDisplayTitle, GameText } from '@/components/game';
import InlineBanner from '@/components/InlineBanner';
import ResultShareCard, {
  type ResultShareCardProps,
} from '@/components/ResultShareCard';
import ResultShareExport from '@/components/ResultShareExport';
import RevealWinnerBeat from '@/components/reveal/RevealWinnerBeat';
import CreatorArchetypePicker from '@/components/character/CreatorArchetypePicker';
import ArtStyleChoices from '@/components/character/ArtStyleChoices';
import { GameFeedback } from '@/components/game/GameFeedback';
import ProfileSkeleton from '@/components/profile/ProfileSkeleton';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import type { ArchetypeId } from '@/constants/Archetypes';
import type { ArtStyle } from '@/constants/CharacterTraits';
import { equipment, names } from '../mockupParity';

const pages = [
  'Headings',
  'Result',
  'Winner',
  'Creator',
  'Feedback',
  'Skeleton',
] as const;
const outcomes = ['won', 'lost', 'draw', 'no_contest'] as const;

/** Local, bundled component evidence. Never runs live account or battle operations. */
export default function RemediationFixture() {
  const dimensions = useWindowDimensions();
  const [page, setPage] = useState<(typeof pages)[number]>('Headings');
  const [nameIndex, setNameIndex] = useState(0);
  const [outcome, setOutcome] = useState(0);
  const [archetype, setArchetype] = useState<ArchetypeId | null>(null);
  const [style, setStyle] = useState<ArtStyle>('comic');
  const [exporting, setExporting] = useState(false);
  const [exportUri, setExportUri] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  const name = names[nameIndex % names.length];
  const art = archetypeIllustrationUri('mystic');
  const cosmetics = equipment(2);
  const card: ResultShareCardProps = {
    headline: 'Historical headline 2–1',
    outcome: outcomes[outcome % 4],
    isKo: true,
    scoreLine: '2–1',
    winnerSide: 'me',
    theme: 'The calm before the storm',
    me: {
      name,
      archetype: 'mystic',
      avatarUrl: art,
      signatureColor: '#B69AF8',
      cosmetics,
    },
    them: {
      name: 'Żaneta',
      archetype: 'strategist',
      avatarUrl: archetypeIllustrationUri('strategist'),
    },
    ratingLine: null,
    adjudicationRevision: outcome % 4 === 3 ? 2 : 0,
  };
  const controls = (
    <View style={{ gap: 8 }}>
      <GameText variant="caption">
        {`LOCAL FIXTURE · ${dimensions.width}pt · text ${dimensions.fontScale}`}
      </GameText>
      <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>
        {pages.map((value) => (
          <GameButton
            key={value}
            label={`DEV ${value}`}
            chrome="utility"
            tone="secondary"
            onPress={() => {
              setPage(value);
              setExportUri(null);
            }}
          />
        ))}
        <GameButton
          label="DEV Name"
          chrome="utility"
          tone="secondary"
          onPress={() => setNameIndex((n) => n + 1)}
        />
        <GameButton
          label="DEV Outcome"
          chrome="utility"
          tone="secondary"
          onPress={() => {
            setOutcome((n) => n + 1);
            setExportUri(null);
          }}
        />
      </ScrollView>
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0B13' }}>
      {controls}
      {page === 'Winner' ? (
        <>
          <RevealWinnerBeat
            winner={{
              profileId: null,
              name,
              archetype: 'mystic',
              signatureColor: '#B69AF8',
              battleCry: 'Every word leaves a mark.',
              moveType: 'attack',
              promptExcerpt: null,
              rubric: null,
              portraitUrl: art,
            }}
            isMe
            isKo={false}
            color="#B69AF8"
            fighterUrl={art}
            avatarUrl={art}
            cosmetics={cosmetics}
            sting={null}
            reduceMotion
            insets={{ top: 16, bottom: 16 }}
          />
          <GameButton
            label="Continue · fixture"
            tone="secondary"
            onPress={() => setPage('Result')}
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          {page === 'Headings' && (
            <>
              <GameDisplayTitle>Wallet & Subscription</GameDisplayTitle>
              <GameDisplayTitle uppercase={false}>
                Żaneta Łęcka
              </GameDisplayTitle>
              <GameDisplayTitle uppercase={false}>星の守護者</GameDisplayTitle>
              <InlineBanner
                tone="warning"
                text="Notifications are disabled. Enable them in your device settings to hear when your opponent is ready."
                actionLabel="Open notification settings"
                onAction={() => {}}
              />
            </>
          )}
          {page === 'Result' && (
            <>
              {exportUri ? (
                <Image
                  accessibilityLabel="Local result export"
                  source={{ uri: exportUri }}
                  resizeMode="contain"
                  style={{ width: '100%', height: 500 }}
                />
              ) : (
                <ResultShareCard {...card} />
              )}
              <GameButton
                label="Preview local export"
                busy={exporting}
                onPress={() => {
                  setExportError(false);
                  setExporting(true);
                }}
              />
              {exportError && (
                <GameText>Export unavailable. Retry the same artwork.</GameText>
              )}
            </>
          )}
          {page === 'Creator' && (
            <>
              <GameDisplayTitle>Choose your identity</GameDisplayTitle>
              <CreatorArchetypePicker
                value={archetype}
                onChange={setArchetype}
              />
              <ArtStyleChoices value={style} onChange={setStyle} />
            </>
          )}
          {page === 'Feedback' && (
            <>
              <GameFeedback
                icon="shield-check"
                title="No blocked players"
                message="Players you block will appear here."
              />
              <GameFeedback
                icon="replay"
                title="Couldn’t load fighters"
                message="Your known fighter remains available. Try again when connected."
                tone="error"
                action={{ label: 'Retry', onPress: () => {} }}
              />
            </>
          )}
          {page === 'Skeleton' && <ProfileSkeleton />}
        </ScrollView>
      )}
      {exporting && (
        <ResultShareExport
          key={`${name}:${outcome}`}
          card={card}
          onReady={async (ref) => {
            try {
              setExportUri(
                await captureRef(ref, { format: 'png', quality: 1 }),
              );
            } catch {
              setExportError(true);
            } finally {
              setExporting(false);
            }
          }}
          onError={() => {
            setExportError(true);
            setExporting(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}
