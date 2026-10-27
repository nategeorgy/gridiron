// The featured games (October 2026): one game just played and one coming up, drawn with
// the game page's own charts. The recap is the row under the Highlighted Viz (targets and
// carries, and every possession); the preview is the tale of the tape in the Week N
// Preview. Chosen from the tweet kit's A4 ("Who got the ball"), A6 and B3 cards.
//
// The games are `FEATURED_GAMES` in constants/signals.js; Home falls back to the closest
// finish and the biggest total when a pick is not in the scoreboard's weeks. Each chart
// draws at its card's measured width (`useElementWidth`): the narrow column and a phone run
// from about 340px to 550px, and the game page's desktop box shrunk to that set its labels at 5px.
import { useMemo } from "react";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { DriveChart, TapeTracks, TouchTimeline } from "../game/GameCharts";
import { gameColors, teamText } from "../game/colors";
import { gamePath } from "../game/GameLink";
import { useElementWidth } from "../../hooks/useElementWidth";

const nickname = (team) => (team?.name ?? team?.abbreviation ?? "").split(" ").slice(-1)[0];
const sides = (game) => (game ? [game.away, game.home] : []);
const logosOf = (game) => Object.fromEntries(sides(game).map((team) => [team.abbreviation, team.logo_url]));

/** "Packers 17 at Lions 20", or "Ravens at Bills" before kickoff. */
function matchupLine(game) {
  if (!game) return "";
  const [away, home] = sides(game);
  return game.played
    ? `${nickname(away)} ${away.score} at ${nickname(home)} ${home.score}`
    : `${nickname(away)} at ${nickname(home)}`;
}

function TeamLabel({ team, color, children }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: teamText(color) }}>
      {team.logo_url && <img src={team.logo_url} alt="" className="h-4 w-4 object-contain" />}
      {children ?? team.name}
    </div>
  );
}

function TouchKey() {
  const item = "inline-flex items-center gap-1.5";
  const ink = "var(--muted)";
  return (
    <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[10.5px] text-muted">
      <span className={item}><span className="h-2.5 w-2.5 rounded-full" style={{ background: ink }} />Caught</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-full bg-[color:var(--surface-solid)]" style={{ boxShadow: `inset 0 0 0 1.6px ${ink}` }} />Not caught</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `color-mix(in srgb, ${ink} 56%, var(--surface-solid))`, boxShadow: `inset 0 0 0 1.2px ${ink}` }} />Carry</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-full" style={{ boxShadow: "inset 0 0 0 2px var(--accent)" }} />Touchdown</span>
    </div>
  );
}

/** Every target and carry each team's busiest players got, on the game clock. */
export function TargetsAndCarriesCard({ game, recap, isLoading, isError }) {
  const [frame, width] = useElementWidth();
  const colors = useMemo(() => gameColors(game?.away, game?.home), [game]);
  const ready = Boolean(game?.has_plays && recap?.touches?.length);
  return (
    <Card>
      <CardHead title="Targets and carries" sub={game ? `${game.week_label} · ${matchupLine(game)}` : undefined} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} rows={6}
        empty="This game's targets and carries arrive with the morning update." />
      <div ref={frame} className="grid gap-3">
        {ready && width > 0 && ["away", "home"].map((side) => {
          const team = game[side];
          const players = recap.players.filter((p) => p.team === team.abbreviation);
          const ids = new Set(players.map((p) => p.player_id));
          return (
            <div key={side}>
              <TeamLabel team={team} color={colors[side]} />
              <TouchTimeline touches={recap.touches.filter((touch) => ids.has(touch.player))} players={players} color={colors[side]}
                end={recap.win_probability?.end ?? 3600} periods={game.periods?.length} seasonType={game.season_type}
                width={width} />
            </div>
          );
        })}
      </div>
      {ready && <TouchKey />}
      {game && <CardLink to={`${gamePath(game.game_id)}?tab=usage`}>Full recap</CardLink>}
    </Card>
  );
}

/** Every drive from where it started toward the end zone, in game order. */
export function PossessionsCard({ game, recap, isLoading, isError }) {
  const [frame, width] = useElementWidth();
  const colors = useMemo(() => gameColors(game?.away, game?.home), [game]);
  const ready = Boolean(game?.has_plays && recap?.drives?.length);
  return (
    <Card>
      <CardHead title="Every possession" sub={game ? `${game.week_label} · ${matchupLine(game)}` : undefined} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} rows={8}
        empty="This game's drives arrive with the morning update." />
      <div ref={frame}>
        {ready && width > 0 && (
          <DriveChart drives={recap.drives} colors={colors} away={game.away.abbreviation} logos={logosOf(game)}
            periods={game.periods?.length} width={width} />
        )}
      </div>
      {ready && (
        <p className="mt-2 text-[10.5px] text-faint">
          Each drive from where it started toward the end zone on the right. Solid bars scored.
        </p>
      )}
      {game && <CardLink to={`${gamePath(game.game_id)}?tab=drives`}>Drive chart</CardLink>}
    </Card>
  );
}

/** Each offense against the defense it faces, rank against rank. */
export function TaleOfTheTapeCard({ game, preview, isLoading, isError }) {
  const [frame, width] = useElementWidth();
  const colors = useMemo(() => {
    const pair = gameColors(game?.away, game?.home);
    return game ? { [game.away.abbreviation]: pair.away, [game.home.abbreviation]: pair.home } : {};
  }, [game]);
  const ready = Boolean(game && preview?.tape?.length);
  const ranked = preview?.teams_ranked ?? 32;
  // Early in a season the ranks are last season's; say so rather than let them pass as this one's.
  const basis = preview?.basis_season && game && preview.basis_season !== game.season ? `, from ${preview.basis_season}` : "";
  return (
    <Card>
      <CardHead title="Tale of the Tape" sub={game ? `${game.week_label} · ${matchupLine(game)}` : undefined} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} rows={8} empty="No game to preview yet." />
      <div ref={frame} className="grid gap-4">
        {ready && width > 0 && [[game.away, game.home], [game.home, game.away]].map(([offense, defense]) => (
          <div key={offense.abbreviation}>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <TeamLabel team={offense} color={colors[offense.abbreviation]}>{offense.abbreviation} offense</TeamLabel>
              <span className="mb-1 text-[11px] text-faint">vs</span>
              <TeamLabel team={defense} color={colors[defense.abbreviation]}>{defense.abbreviation} defense</TeamLabel>
            </div>
            <TapeTracks tape={preview.tape} ranked={ranked} offense={offense.abbreviation} defense={defense.abbreviation}
              colors={colors} logos={logosOf(game)} width={width} />
          </div>
        ))}
      </div>
      {ready && (
        <p className="mt-2 text-[10.5px] text-faint">
          Season ranks of {ranked}{basis}, 1st is best. The line takes the colour of the side with the edge.
        </p>
      )}
      {game && <CardLink to={`${gamePath(game.game_id)}?tab=tape`}>Game preview</CardLink>}
    </Card>
  );
}
