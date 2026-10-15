// One game's page (October 2026): a recap once it has been played, a preview before.
//
// The header is the same for both. Below it, tabs: the recap's run from the summary to
// every play, the preview's from the matchup to every past meeting. The tab lives in the
// URL (?tab=), so a link to "the Bills-Rams drive chart" opens on it; the default tab
// stays out of the URL. Every fantasy number follows the scoring pill, as everywhere.
//
// Games before FIRST_GAME_PAGE_SEASON have no page: the API 404s and so does this.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ScoringPill } from "../components/ScoringPill";
import { ScrollRow } from "../components/ui/ScrollRow";
import { GameHeader } from "../components/game/GameHeader";
import { gameColors } from "../components/game/colors";
import { Loading, Waiting } from "../components/game/parts";
import {
  BoxScoreTab, DrivesTab, FantasyTab, PlayByPlayTab, SummaryTab, TargetsRunsTab, TeamStatsTab, UsageTab,
} from "../components/game/RecapTabs";
import {
  DepthTab, HistoryTab, MatchupTab, PreviewFantasyTab, TapeTab, UsageTrendsTab,
} from "../components/game/PreviewTabs";
import { useGame, useGamePreview, useGameRecap } from "../hooks/useGames";
import { useScoring } from "../hooks/useScoring";
import { useUrlState } from "../hooks/useUrlState";

const RECAP_TABS = [
  { id: "summary", label: "Summary", Tab: SummaryTab },
  { id: "box", label: "Box Score", Tab: BoxScoreTab },
  { id: "fantasy", label: "Fantasy", Tab: FantasyTab },
  { id: "usage", label: "Usage", Tab: UsageTab },
  { id: "targets", label: "Targets & Runs", Tab: TargetsRunsTab },
  { id: "team", label: "Team Stats", Tab: TeamStatsTab },
  { id: "drives", label: "Drives", Tab: DrivesTab },
  { id: "plays", label: "Play-by-Play", Tab: PlayByPlayTab },
];

const PREVIEW_TABS = [
  { id: "matchup", label: "Matchup", Tab: MatchupTab },
  { id: "fantasy", label: "Fantasy", Tab: PreviewFantasyTab },
  { id: "usage", label: "Usage Trends", Tab: UsageTrendsTab },
  { id: "tape", label: "Tale of the Tape", Tab: TapeTab },
  { id: "depth", label: "Depth Charts", Tab: DepthTab },
  { id: "history", label: "History", Tab: HistoryTab },
];

const ACTIVE_STYLE = {
  background: "var(--surface-solid)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)",
};

function GameTabs({ tabs, active, onSelect }) {
  return (
    <ScrollRow className="max-w-full">
      <div role="tablist" aria-label="Game" className="inline-flex items-center gap-0.5 rounded-full border border-edge bg-surface-2 p-1">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={tab.id === active} onClick={() => onSelect(tab.id)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${tab.id === active ? "text-fg" : "text-muted hover:text-fg"}`}
            style={tab.id === active ? ACTIVE_STYLE : undefined}>
            {tab.label}
          </button>
        ))}
      </div>
    </ScrollRow>
  );
}

function Breadcrumbs({ game }) {
  const label = `${game.away.abbreviation} @ ${game.home.abbreviation}`;
  const week = game.season_type === "REG" ? `&week=${game.week}` : "";
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-faint">
      <Link to="/schedule/games" className="hover:text-fg">Schedule</Link>
      <span aria-hidden="true">›</span>
      <Link to={`/schedule/games?season=${game.season}${week}`} className="hover:text-fg">{game.season} · {game.week_label}</Link>
      <span aria-hidden="true">›</span>
      <span className="text-muted">{label}</span>
    </nav>
  );
}

function Body({ game, tabs, active, scoring, colors }) {
  const played = game.played;
  const recap = useGameRecap(game.game_id, scoring, { enabled: played });
  const preview = useGamePreview(game.game_id, scoring, { enabled: !played });
  const query = played ? recap : preview;
  const { Tab } = tabs.find((tab) => tab.id === active) ?? tabs[0];
  if (query.isError) return <Waiting>Couldn't load this game. Try again in a moment.</Waiting>;
  if (!query.data) return <Loading height={520} />;
  return played
    ? <Tab game={game} recap={query.data} colors={colors} />
    : <Tab game={game} preview={query.data} colors={colors} />;
}

export function GamePage() {
  const { gameId } = useParams();
  const { data: game, isLoading, isError, error } = useGame(gameId);
  const [scoring, setScoring] = useScoring();
  const tabs = game?.played ? RECAP_TABS : PREVIEW_TABS;
  const [tab, setTab] = useUrlState("tab", tabs[0].id, tabs.map((entry) => entry.id));
  const colors = useMemo(() => gameColors(game?.away, game?.home), [game]);

  if (isLoading) return <div className="grid gap-4"><Loading height={180} /><Loading height={520} /></div>;
  if (isError || !game) {
    const missing = error?.response?.status === 404;
    return (
      <Waiting>
        {missing ? "There is no page for this game. Game pages start with the 2025 season." : "Couldn't load this game. Try again in a moment."}{" "}
        <Link to="/schedule/games" className="font-semibold text-accent">See the schedule</Link>
      </Waiting>
    );
  }

  return (
    <div className="grid gap-4" style={{ "--away": colors.away, "--home": colors.home }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs game={game} />
        <ScoringPill scoring={scoring} onChange={setScoring} />
      </div>
      <GameHeader game={game} colors={colors} />
      <GameTabs tabs={tabs} active={tab} onSelect={setTab} />
      <Body game={game} tabs={tabs} active={tab} scoring={scoring} colors={colors} />
    </div>
  );
}
