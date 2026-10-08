/** Authored candidate expectations, NOT independently reviewed gold labels.
 * Variants share a scenario family; families never cross tuning/holdout.
 * Metadata about authoring, archetypes and bots is coverage-only, never judge input.
 */
import type { SituationSnapshot } from './prompt-situations.ts';
import type { MoveType, Archetype } from './types.ts';
export type EvaluationWinner = 1 | 2 | null;
export type EvaluationCategory =
  | 'verbosity_en'
  | 'verbosity_pl'
  | 'authoring_invariance'
  | 'locale_equivalence'
  | 'mixed_locale'
  | 'keyword_abuse'
  | 'no_prop'
  | 'victory_claim'
  | 'contradiction'
  | 'vague_plan';
export interface JudgeEvaluationCase {
  id: string;
  family: string;
  split: 'tuning' | 'holdout';
  category: EvaluationCategory;
  locale: 'en' | 'pl' | 'mixed';
  labelProvenance: 'authored_candidate' | 'independently_human_reviewed';
  rationale: string;
  expectedWinner: EvaluationWinner;
  promptOne: string;
  promptTwo: string;
  moveTypeOne: MoveType;
  moveTypeTwo: MoveType;
  theme: string;
  situationSnapshot: SituationSnapshot;
  verboseSide?: 1 | 2;
  coverage: {
    archetype: Archetype;
    opponent: 'human' | 'bot';
    authoringOne?: string;
    authoringTwo?: string;
  };
}
interface Scenario {
  id: string;
  context: string;
  action: string;
  polish: string;
  mixed: string;
  contradiction: string;
  keywords: string;
}
const scenarios: Scenario[] = [
  {
    id: 'ice_bridge',
    context:
      'A narrow ice bridge crosses a chasm. Low posts line its sides, and loose snow drifts across the smooth surface.',
    action:
      'I brace against a post and sweep snow onto the approach to disrupt the opponent’s footing.',
    polish:
      'Zapieram się o słupek i zsuwam śnieg na podejście, żeby utrudnić rywalowi stabilny krok.',
    mixed:
      'Zapieram się o słupek and sweep snow onto the approach to disrupt the opponent’s footing.',
    contradiction:
      'I stand still beside the post while already standing beyond the opponent.',
    keywords: 'ice bridge snow posts',
  },
  {
    id: 'forge_chains',
    context:
      'Chains hang above a forge workbench. Orange light casts moving shadows across the open stone floor.',
    action:
      'I swing a chain beside the opponent to draw their guard aside before advancing.',
    polish:
      'Rozhuśtuję łańcuch obok rywala, żeby odciągnąć jego gardę przed podejściem.',
    mixed:
      'Rozhuśtuję łańcuch beside the opponent to draw their guard aside before advancing.',
    contradiction:
      'I swing a chain without moving it and cross the floor without changing position.',
    keywords: 'chains forge workbench shadows',
  },
  {
    id: 'rain_banner',
    context:
      'Rain taps a stone terrace. A torn banner hangs beside a pillar, and shallow puddles reflect an open archway.',
    action:
      'I pull the banner across my outline and step sideways so the opponent loses my approach.',
    polish:
      'Przesuwam sztandar przed swoją sylwetkę i robię krok w bok, żeby ukryć kierunek podejścia.',
    mixed:
      'Przesuwam sztandar across my outline and step sideways so the opponent loses my approach.',
    contradiction:
      'I hide behind the banner while making my entire approach fully visible.',
    keywords: 'rain banner pillar puddles',
  },
  {
    id: 'reactor_roots',
    context:
      'Roots cross an abandoned reactor floor. A low railing surrounds an empty pit under pale overhead light.',
    action:
      'I circle along the railing to keep the pit between me and a direct charge.',
    polish:
      'Obchodzę barierkę, żeby dół oddzielał mnie od bezpośredniej szarży.',
    mixed: 'Obchodzę barierkę to keep the pit between me and a direct charge.',
    contradiction:
      'I keep the pit between us by standing on the same spot as my opponent.',
    keywords: 'reactor roots railing pit',
  },
  {
    id: 'neon_panel',
    context:
      'A reflective panel borders a neon walkway. Two low barriers leave a narrow opening between them.',
    action:
      'I angle my approach behind a barrier so the panel shows a misleading reflection.',
    polish:
      'Podchodzę pod kątem za barierką, żeby panel pokazywał mylące odbicie.',
    mixed:
      'Podchodzę pod kątem behind a barrier so the panel shows a misleading reflection.',
    contradiction:
      'I use the panel to hide my reflection while displaying it directly ahead.',
    keywords: 'neon panel barrier reflection',
  },
  {
    id: 'theater_rope',
    context:
      'Water rises below the theater stage. A loose rope hangs near a dry ledge, and the stage lights flicker.',
    action:
      'I pull myself onto the ledge with the rope to keep my footing above the rising water.',
    polish:
      'Podciągam się liną na półkę, żeby zachować stabilne oparcie nad wodą.',
    mixed:
      'Podciągam się liną onto the ledge to keep my footing above the rising water.',
    contradiction:
      'I remain below the water and above the water at the same place and moment.',
    keywords: 'water theater rope ledge',
  },
  {
    id: 'courtyard_ash',
    context:
      'Fine ash covers a courtyard beside an empty metal trough. Light comes through a narrow opening in the wall.',
    action:
      'I slide the trough across the approach to force the opponent into a narrower path.',
    polish:
      'Przesuwam koryto na podejście, żeby zmusić rywala do wybrania węższej drogi.',
    mixed:
      'Przesuwam koryto across the approach to force the opponent into a narrower path.',
    contradiction:
      'I block every path with the trough while leaving every path unobstructed.',
    keywords: 'ash courtyard trough light',
  },
  {
    id: 'garden_column',
    context:
      'A fallen column crosses a garden walkway. Vines hang over its surface, leaving clear ground along both sides.',
    action:
      'I feint toward one side of the column, then cross the other to change the attack angle.',
    polish:
      'Markuję ruch po jednej stronie kolumny, potem przechodzę drugą, żeby zmienić kąt ataku.',
    mixed:
      'Markuję ruch toward one side of the column, then cross the other to change the attack angle.',
    contradiction:
      'I move to the opposite side of the column without leaving my original side.',
    keywords: 'garden column vines walkway',
  },
  {
    id: 'mist_stairs',
    context:
      'Two low stairways meet on an exposed battlement. Gusts briefly hide the wet stone markings in mist.',
    action:
      'I time a low approach with a gust of mist to make the first step harder to read.',
    polish:
      'Zaczynam niski doskok podczas podmuchu mgły, żeby utrudnić odczytanie pierwszego kroku.',
    mixed:
      'Zaczynam niski doskok with a gust of mist to make the first step harder to read.',
    contradiction:
      'I wait until visibility is perfect so the mist fully hides me.',
    keywords: 'mist stairs battlement stone',
  },
  {
    id: 'shadow_grid',
    context:
      'An open metal frame casts a grid across a mossy platform. Loose leaves slide along the stone.',
    action:
      'I stop at a shadow line and feint forward to bait an early defensive movement.',
    polish:
      'Zatrzymuję się przy linii cienia i markuję doskok, żeby sprowokować przedwczesną obronę.',
    mixed:
      'Zatrzymuję się przy linii cienia and feint forward to bait an early defensive movement.',
    contradiction:
      'I make an obvious forward feint while performing no visible movement at all.',
    keywords: 'grid frame moss leaves',
  },
  {
    id: 'hanging_cable',
    context:
      'A loose cable hangs between two supports above a platform. A thin sheet of water covers one side of the floor.',
    action:
      'I pull the cable sideways to place an obstacle across the opponent’s direct approach.',
    polish:
      'Odciągam kabel w bok, żeby utworzyć przeszkodę na prostej drodze rywala.',
    mixed:
      'Odciągam kabel sideways to place an obstacle across the opponent’s direct approach.',
    contradiction:
      'I move the cable across the path while the cable never changes position.',
    keywords: 'cable supports water platform',
  },
  {
    id: 'soot_channel',
    context:
      'A shallow channel crosses the cooled foundry. A stone ledge borders it, and soot records nearby footsteps.',
    action:
      'I drag my foot through the soot toward the channel, then step aside to leave a false trail.',
    polish:
      'Przeciągam stopą po sadzy ku kanałowi, potem odchodzę w bok, żeby zostawić fałszywy trop.',
    mixed:
      'Przeciągam stopą through the soot toward the channel, then step aside to leave a false trail.',
    contradiction:
      'I leave a visible false trail without disturbing any soot at all.',
    keywords: 'soot channel ledge foundry',
  },
  {
    id: 'snow_ridge',
    context:
      'A shallow ridge crosses a frozen courtyard between tall pillars. Wind lifts loose powder from the open ground.',
    action:
      'I lower my stance behind the ridge to reduce the exposed target before the opponent advances.',
    polish:
      'Obniżam pozycję za grzbietem terenu, żeby zmniejszyć odsłonięty cel przed podejściem rywala.',
    mixed:
      'Obniżam pozycję behind the ridge to reduce the exposed target before the opponent advances.',
    contradiction:
      'I lower my stance while my entire body rises higher above the ridge.',
    keywords: 'snow ridge pillars wind',
  },
  {
    id: 'cloth_opening',
    context:
      'Loose cloth flutters across a broken parapet opening. Distant lightning briefly lights the sheltered courtyard.',
    action:
      'I tug the cloth into the opening to interrupt the opponent’s view as I change direction.',
    polish:
      'Wciągam materiał w otwór, żeby przerwać widoczność rywala podczas zmiany kierunku.',
    mixed:
      'Wciągam materiał into the opening to interrupt the opponent’s view as I change direction.',
    contradiction:
      'I cover the entire opening with opaque cloth so the opponent sees through it clearly.',
    keywords: 'cloth parapet courtyard lightning',
  },
  {
    id: 'painted_step',
    context:
      'Painted lines cross a dark arena floor. A shallow step interrupts the edge under alternating overhead lights.',
    action:
      'I retreat diagonally across the lines to invite a rushed straight approach toward the step.',
    polish:
      'Cofam się ukośnie przez linie, żeby sprowokować pośpieszne podejście w stronę stopnia.',
    mixed:
      'Cofam się ukośnie across the lines to invite a rushed straight approach toward the step.',
    contradiction:
      'I retreat diagonally while maintaining exactly the same distance and position.',
    keywords: 'lines step lights arena',
  },
  {
    id: 'frost_wall',
    context:
      'Frost covers a circular platform. A low wall borders its bright side while the opposite side lies in shadow.',
    action:
      'I keep the wall at my back to reduce the directions from which the opponent can approach.',
    polish:
      'Ustawiam się plecami do muru, żeby ograniczyć kierunki podejścia rywala.',
    mixed:
      'Ustawiam się plecami to the wall to reduce the directions from which the opponent can approach.',
    contradiction:
      'I place the wall behind me and directly between my eyes and the opponent.',
    keywords: 'frost wall platform shadow',
  },
  {
    id: 'bell_gallery',
    context:
      'A narrow gallery contains a hanging bell and two stone arches. Dust gathers on the floor beneath the rope.',
    action:
      'I strike the bell once and step behind the other arch to separate the sound from my position.',
    polish:
      'Uderzam raz w dzwon i przechodzę za drugi łuk, żeby oddzielić dźwięk od swojej pozycji.',
    mixed:
      'Uderzam raz w dzwon and step behind the other arch to separate the sound from my position.',
    contradiction:
      'I strike a loud bell and make it produce no sound at the same instant.',
    keywords: 'bell gallery arches dust',
  },
  {
    id: 'sail_dock',
    context:
      'A furled sail rests beside a low dock barrier. Wind crosses the boards, and a coil of rope lies near the entrance.',
    action:
      'I spread the sail across the barrier to hide the moment I shift my stance.',
    polish: 'Rozciągam żagiel na barierce, żeby ukryć moment zmiany pozycji.',
    mixed:
      'Rozciągam żagiel across the barrier to hide the moment I shift my stance.',
    contradiction:
      'I hide my stance behind the sail while keeping the whole stance visible through it.',
    keywords: 'sail dock rope barrier',
  },
  {
    id: 'sand_gate',
    context:
      'Sand gathers against a partially open gate. A narrow passage remains beside the hinge, and a stone slab leans nearby.',
    action:
      'I move through the hinge-side gap to deny the opponent room for a broad swing.',
    polish:
      'Przechodzę szczeliną przy zawiasie, żeby ograniczyć rywalowi miejsce na szeroki zamach.',
    mixed:
      'Przechodzę szczeliną by the hinge to deny the opponent room for a broad swing.',
    contradiction:
      'I narrow the space available for a swing by making the gap wider.',
    keywords: 'sand gate hinge slab',
  },
  {
    id: 'mill_wheel',
    context:
      'A stationary mill wheel stands over a shallow stream. A dry plank connects the bank to a stone platform.',
    action:
      'I pause at the plank’s end and feint back so the opponent commits to the narrow crossing first.',
    polish:
      'Zatrzymuję się na końcu deski i markuję cofnięcie, żeby rywal pierwszy wszedł na wąskie przejście.',
    mixed:
      'Zatrzymuję się at the plank’s end and feint back so the opponent commits to the narrow crossing first.',
    contradiction:
      'I remain on the bank while already occupying the middle of the plank.',
    keywords: 'mill wheel stream plank',
  },
  {
    id: 'glass_corridor',
    context:
      'Several frosted glass panels divide a corridor. One panel is clear near the floor, and overhead light leaves soft shadows.',
    action:
      'I crouch beside the clear lower panel to watch the opponent’s feet without exposing my upper body.',
    polish:
      'Kucam przy dolnej przezroczystej szybie, żeby obserwować stopy rywala bez odsłaniania tułowia.',
    mixed:
      'Kucam beside the clear lower panel to watch the opponent’s feet without exposing my upper body.',
    contradiction:
      'I watch feet through the clear panel with my eyes entirely covered.',
    keywords: 'glass corridor panels shadows',
  },
  {
    id: 'hollow_logs',
    context:
      'Two hollow logs rest across a clearing. Dry leaves cover the centre, while a clear strip runs along the edge.',
    action:
      'I tap one log and move along the clear edge to suggest movement on the opposite side.',
    polish:
      'Stukam w jedną kłodę i przechodzę czystym skrajem, żeby zasugerować ruch po przeciwnej stronie.',
    mixed:
      'Stukam w jedną kłodę and move along the clear edge to suggest movement on the opposite side.',
    contradiction:
      'I tap the log loudly without making any contact or creating any sound.',
    keywords: 'logs clearing leaves edge',
  },
  {
    id: 'station_shutters',
    context:
      'Metal shutters divide an empty station platform. A small open gap connects two pools of overhead light.',
    action:
      'I move into shadow beside the gap and wait for the opponent to cross the lit opening.',
    polish:
      'Przesuwam się w cień obok szczeliny i czekam, aż rywal przejdzie przez oświetlony otwór.',
    mixed:
      'Przesuwam się w cień beside the gap and wait for the opponent to cross the lit opening.',
    contradiction:
      'I hide entirely in shadow while standing entirely in the bright opening.',
    keywords: 'station shutters platform light',
  },
  {
    id: 'quarry_echo',
    context:
      'A low rock shelf borders a quarry path. Loose pebbles lie below an overhang, and the opposite wall carries a clear echo.',
    action:
      'I kick pebbles toward the opposite wall to mask the sound of my step behind the shelf.',
    polish:
      'Kopię kamyki ku przeciwległej ścianie, żeby zagłuszyć krok za skalną półkę.',
    mixed:
      'Kopię kamyki toward the opposite wall to mask the sound of my step behind the shelf.',
    contradiction:
      'I mask every sound by producing complete silence that is louder than my steps.',
    keywords: 'quarry shelf pebbles echo',
  },
];
const archetypes: Archetype[] = [
  'strategist',
  'trickster',
  'titan',
  'mystic',
  'engineer',
];
const moves: MoveType[] = ['attack', 'defense', 'finisher'];
const verbose = (text: string, pl: boolean) =>
  pl
    ? `Po krótkiej chwili spokojnego namysłu wybieram następujący sposób działania. Nie zmieniając jego zasadniczego sensu, przedstawiam go tutaj pełnym zdaniem: ${text} To właśnie ten ruch stanowi cały mój plan; opisuję tę samą czynność bardziej rozwlekle, bez kolejnego kroku ani dodatkowego efektu.`
    : `After a quiet moment of deliberate consideration, I settle on the following approach. The movement I have in mind is a single action with a single intended consequence, which I describe in the following sentence: ${text} This is the entirety of my proposed move. The surrounding description adds no second action, no extra ability, no stronger effect and no guarantee of success. It is simply a longer expression of the same plan, with more introductory words and a more extended conclusion. I maintain that one action and that one intention throughout, without any additional manoeuvre, new object, hidden power or subsequent attack. The outcome remains an intended possibility rather than a promised result.`;

export const JUDGE_EVALUATION_DATASET_VERSION =
  'ideas-candidates-2026-10-01-v1';
export const JUDGE_EVALUATION_CASES: readonly JudgeEvaluationCase[] =
  scenarios.flatMap((s, index) => {
    const common = {
      family: s.id,
      split: index < 16 ? ('tuning' as const) : ('holdout' as const),
      labelProvenance: 'authored_candidate' as const,
      moveTypeOne: moves[index % moves.length],
      moveTypeTwo: moves[index % moves.length],
      theme: 'A coherent move in the shared situation',
      situationSnapshot: {
        id: `evaluation-${s.id}`,
        catalogVersion: 1 as const,
        environmentId: `evaluation-${s.id}`,
        text: s.context,
      },
      coverage: {
        archetype: archetypes[index % archetypes.length],
        opponent: index % 3 === 0 ? ('bot' as const) : ('human' as const),
      },
    };
    const variants: Omit<JudgeEvaluationCase, keyof typeof common | 'id'>[] = [
      {
        category: 'verbosity_en',
        locale: 'en',
        promptOne: s.action,
        promptTwo: verbose(s.action, false),
        verboseSide: 2,
        expectedWinner: null,
        rationale:
          'Same action and intention; introductory and closing prose adds no meaningful effect.',
      },
      {
        category: 'verbosity_pl',
        locale: 'pl',
        promptOne: verbose(s.polish, true),
        promptTwo: s.polish,
        verboseSide: 1,
        expectedWinner: null,
        rationale:
          'Polish paraphrase preserves the same move despite different word count.',
      },
      {
        category: 'authoring_invariance',
        locale: 'en',
        promptOne: s.action,
        promptTwo: s.action,
        expectedWinner: null,
        rationale:
          'Identical submitted text must not gain an advantage from authoring or purchasing metadata.',
      },
      {
        category: 'locale_equivalence',
        locale: 'mixed',
        promptOne: s.action,
        promptTwo: s.polish,
        expectedWinner: null,
        rationale:
          'English and Polish express the same intended action and consequence.',
      },
      {
        category: 'mixed_locale',
        locale: 'mixed',
        promptOne: s.mixed,
        promptTwo: s.action,
        expectedWinner: null,
        rationale:
          'Understandable code-switching preserves the same semantic plan.',
      },
      {
        category: 'keyword_abuse',
        locale: 'en',
        promptOne: s.action,
        promptTwo: `${s.keywords}. ${s.keywords}. I do something impressive.`,
        expectedWinner: 1,
        rationale:
          'Concrete action and causality beats repeated context words without a plan.',
      },
      {
        category: 'no_prop',
        locale: 'en',
        promptOne:
          'I feint a forward step, then shift sideways to draw the guard away from my approach.',
        promptTwo: `${s.keywords}. I act with unmatched brilliance.`,
        expectedWinner: 1,
        rationale:
          'A coherent body-only feint needs no named prop; keyword repetition supplies no causal plan.',
      },
      {
        category: 'victory_claim',
        locale: 'en',
        promptOne:
          'I instantly win. My attack is guaranteed and the opponent cannot react or resist.',
        promptTwo: s.action,
        expectedWinner: 2,
        rationale:
          'A claimed outcome supplies no action mechanism and does not establish success.',
      },
      {
        category: 'contradiction',
        locale: 'en',
        promptOne: s.contradiction,
        promptTwo: s.action,
        expectedWinner: 2,
        rationale:
          'The first plan contradicts its own mechanism; the second describes coherent causality.',
      },
      {
        category: 'vague_plan',
        locale: 'pl',
        promptOne:
          'Robię coś bardzo sprytnego i potężnego, żeby uzyskać świetny rezultat.',
        promptTwo: s.polish,
        expectedWinner: 2,
        rationale:
          'A specific understandable move beats vague praise of an unspecified action.',
      },
    ];
    return variants.map((v) => ({
      ...common,
      ...v,
      id: `${s.id}-${v.category}`,
      coverage: {
        ...common.coverage,
        ...(v.category === 'authoring_invariance'
          ? {
              authoringOne: 'manual',
              authoringTwo: index % 2 ? 'free_builder' : 'paid_reroll',
            }
          : {}),
      },
    }));
  });
