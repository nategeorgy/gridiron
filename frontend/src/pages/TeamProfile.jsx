// One team's page: identity and EPA against the league, the season week by week, the
// players, team stats on offense and defense, where the offense throws and runs, its
// personnel, the depth chart, schedule and coaching staff.
//
// Season and weeks live in the URL, so a link to "the Bills over the last four weeks"
// opens exactly that. Every number except the schedule's record and the depth chart
// listing follows the selected weeks.
//
// Below the players the page runs in two independent columns, so a short card never
// leaves a hole beside a tall one: the wide cards open the left column and the chart
// panels the right, and the rest are split between them so both end at the same height.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringPill } from "../components/ScoringPill";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { CoachingStaff } from "../components/team/CoachingStaff";
import { DepthChartField } from "../components/team/DepthChartField";
import { PassDepthField } from "../components/team/PassDepthField";
import { PersonnelCards } from "../components/team/PersonnelCards";
import { RunLaneColumns } from "../components/team/RunLaneColumns";
import { SeasonTrend } from "../components/team/SeasonTrend";
import { TeamHeader } from "../components/team/TeamHeader";
import { TeamPlayersTable } from "../components/team/TeamPlayersTable";
import { TeamRankTable } from "../components/team/TeamRankTable";
import { TeamSchedule } from "../components/team/TeamSchedule";
import { TeamStatStrips } from "../components/team/TeamStatStrips";
import { scoringLabel } from "../constants/scoring";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useTeam, useTeamBreakdown, useTeamPlayers, useTeamStats } from "../hooks/useTeamStats";
import { useUrlState } from "../hooks/useUrlState";
import { divisionPlace, recordText } from "../utils/teamStats";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];
const VIEWS = ["pg", "tot"];
const FLOW = ["rank", "personnel", "schedule", "staff"];
const GAP = 16;

/**
 * Split the flow cards between the columns so the two end as close together as they can.
 *
 * A card's height depends on its column (the columns are different widths, and cards
 * like Personnel reflow), so each card's height is remembered per column as it is seen
 * there, and a column it has not been seen in yet is estimated from the other. Every
 * split (16 of them, page order kept within each column) is scored and the closest
 * wins; the page re-renders, measures again and stops once nothing changes. The cache
 * resets when the content or the window size changes, and six passes is the cap.
 */
const MAX_PASSES = 6;

function useFlowColumns(contentKey) {
  const refs = useRef({});
  const left = useRef(null);
  const [placement, setPlacement] = useState({});
  const seen = useRef({ key: null, passes: 0, heights: {} });

  useLayoutEffect(() => {
    if (seen.current.key !== contentKey) seen.current = { key: contentKey, passes: 0, heights: {} };
    const state = seen.current;
    const column = left.current;
    if (!column || state.passes >= MAX_PASSES) return;
    state.passes += 1;
    if (getComputedStyle(column.parentElement).gridTemplateColumns.split(" ").length < 2) {
      setPlacement((current) => (FLOW.every((id) => current[id] !== "R") ? current : {}));
      return;
    }

    const where = (id) => (["strips", "depth"].includes(id) ? "L" : ["pass", "run"].includes(id) ? "R" : placement[id] ?? "L");
    for (const [id, element] of Object.entries(refs.current)) {
      if (element) state.heights[id] = { ...state.heights[id], [where(id)]: element.offsetHeight };
    }
    const heightIn = (id, side) => {
      const known = state.heights[id] ?? {};
      return (known[side] ?? known[side === "L" ? "R" : "L"] ?? 0) + GAP;
    };

    const leftBase = heightIn("strips", "L") + heightIn("depth", "L");
    const rightBase = heightIn("pass", "R") + heightIn("run", "R");
    let next = {};
    let best = Infinity;
    for (let mask = 0; mask < 1 << FLOW.length; mask += 1) {
      const option = Object.fromEntries(FLOW.map((id, index) => [id, mask & (1 << index) ? "R" : "L"]));
      let leftHeight = leftBase;
      let rightHeight = rightBase;
      for (const id of FLOW) {
        if (option[id] === "L") leftHeight += heightIn(id, "L");
        else rightHeight += heightIn(id, "R");
      }
      const gap = Math.abs(leftHeight - rightHeight);
      if (gap < best - 1) { best = gap; next = option; }
    }
    setPlacement((current) => (FLOW.every((id) => (current[id] ?? "L") === next[id]) ? current : next));
  });

  useLayoutEffect(() => {
    const onResize = () => { seen.current = { key: null, passes: 0, heights: {} }; setPlacement((current) => ({ ...current })); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const slot = (id) => (element) => { refs.current[id] = element; };
  return { placement, slot, left };
}

export function TeamProfile() {
  const { teamId } = useParams();
  const { seasonOptions, currentSeason } = useSeasons();
  const { seasonOptions: scheduleSeasons } = useSeasons({ statsOnly: false });
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [position, setPosition] = useUrlState("pos", "ALL", POSITIONS);
  const [view, setView] = useUrlState("view", "pg", VIEWS);
  const [scoring, setScoring] = useScoring();

  const seasonNumber = Number(season);
  const scheduleSeason = Number(scheduleSeasons[0]?.value ?? currentSeason);
  const weeksLabel = weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season";

  const boardParams = useMemo(() => ({ season: seasonNumber, weeks: weeks || undefined, scoring }), [seasonNumber, weeks, scoring]);
  const { data: board, isError: boardError } = useTeamStats(boardParams);
  const { data: fullBoard } = useTeamStats({ season: seasonNumber, scoring }, { enabled: Boolean(weeks) });
  const { data: breakdown } = useTeamBreakdown(teamId, { season: seasonNumber, weeks: weeks || undefined });
  const { data: teamData, isError, error } = useTeam(teamId, { season: seasonNumber, scoring });
  // The depth chart and the next game are always the newest season's: a chart is stored
  // as current state, and a past season has no next game.
  const { data: current } = useTeam(teamId, { season: scheduleSeason, scoring });

  const team = teamData?.team;
  const abbreviation = team?.abbreviation;
  const { data: players, isLoading: playersLoading } = useTeamPlayers({ season: seasonNumber, weeks, abbreviation, scoring });

  const logos = useMemo(() => Object.fromEntries((board?.teams ?? []).map((entry) => [entry.abbreviation, entry.logo_url])), [board]);
  const teamIds = useMemo(() => Object.fromEntries((board?.teams ?? []).map((entry) => [entry.abbreviation, entry.team_id])), [board]);
  const playerStats = useMemo(() => Object.fromEntries((players ?? []).map((row) => [row.player_id, row])), [players]);
  const staffThisSeason = breakdown?.staff?.find((row) => row.season === seasonNumber);
  const selectedWeeks = weeks ? new Set(weeks.split(",").map(Number)) : null;
  const nextGame = seasonNumber === scheduleSeason ? current?.next_game : null;

  const contentKey = [teamId, season, weeks, scoring, Boolean(board), Boolean(breakdown), Boolean(teamData), Boolean(current), players?.length ?? 0].join("|");
  const { placement, slot, left } = useFlowColumns(contentKey);

  if (isError) {
    return (
      <div className="glass-card p-6 text-center text-sm text-muted">
        {error?.response?.status === 404 ? "Team not found." : "Could not load this team."}
      </div>
    );
  }
  if (!team) return <div className="glass-card p-6 text-center text-sm text-muted">Loading...</div>;

  const cards = {
    strips: <TeamStatStrips board={board} abbreviation={abbreviation} weeksLabel={weeksLabel} />,
    depth: (
      <DepthChartField
        chart={current?.depth_chart}
        asOf={current?.depth_chart_as_of}
        stats={playerStats}
        season={seasonNumber}
        weeksLabel={weeksLabel.toLowerCase()}
        topPersonnel={breakdown?.personnel?.[0]}
      />
    ),
    pass: <PassDepthField depth={breakdown?.pass_depth} weeksLabel={weeksLabel} />,
    run: <RunLaneColumns lanes={breakdown?.run_lanes} groups={breakdown?.run_groups} weeksLabel={weeksLabel} />,
    rank: <TeamRankTable board={board} abbreviation={abbreviation} weeksLabel={weeksLabel} season={seasonNumber} />,
    personnel: <PersonnelCards cards={breakdown?.personnel} season={seasonNumber} weeksLabel={weeksLabel} />,
    schedule: (
      <TeamSchedule
        schedule={teamData?.schedule}
        sos={teamData?.sos}
        sosBasis={teamData?.sos_basis}
        season={seasonNumber}
        abbreviation={abbreviation}
        nextWeek={nextGame?.week}
        logos={logos}
        teamIds={teamIds}
        scoringLabel={scoringLabel(scoring)}
      />
    ),
    staff: <CoachingStaff staff={breakdown?.staff} season={seasonNumber} />,
  };
  const wrap = (id) => <div key={id} ref={slot(id)}>{cards[id]}</div>;
  const leftFlow = FLOW.filter((id) => (placement[id] ?? "L") === "L");
  const rightFlow = FLOW.filter((id) => placement[id] === "R");

  return (
    <div className="grid grid-cols-1 gap-4">
      <TeamHeader
        team={team}
        board={board}
        season={seasonNumber}
        weeksLabel={weeksLabel}
        place={divisionPlace(fullBoard ?? board, abbreviation)}
        record={teamData?.record?.played ? recordText(teamData.record) : null}
        staff={staffThisSeason}
        nextGame={nextGame}
        logos={logos}
      />

      <div className="glass-card flex flex-wrap items-center gap-3 px-4 py-3">
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <TimeframeFilter weeks={weeks} season={season} onChange={setWeeks} />
        <span className="flex-1" />
        <ScoringPill scoring={scoring} onChange={setScoring} />
      </div>

      {boardError && <div className="glass-card p-4 text-sm text-muted">Could not load team stats for this season.</div>}

      <SeasonTrend trend={breakdown?.trend} abbreviation={abbreviation} logos={logos} selectedWeeks={selectedWeeks} />

      <TeamPlayersTable
        rows={players}
        isLoading={playersLoading}
        season={seasonNumber}
        weeksLabel={weeksLabel}
        position={position}
        onPosition={setPosition}
        view={view}
        onView={setView}
      />

      <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div ref={left} className="grid min-w-0 grid-cols-1 gap-4">
          {wrap("strips")}
          {wrap("depth")}
          {leftFlow.map(wrap)}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4">
          {wrap("pass")}
          {wrap("run")}
          {rightFlow.map(wrap)}
        </div>
      </div>
    </div>
  );
}
