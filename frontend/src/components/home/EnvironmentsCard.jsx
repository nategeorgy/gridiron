// Week N Environments (October 2026): the coming week's offenses by implied team total,
// the Vegas board's rail cut to the top of the list. Implied totals come with every game
// from `/games/scoreboard`, so this card asks for nothing the scoreboard did not.
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { TeamEnvironmentRail } from "../schedule/TeamEnvironmentRail";
import { offensesFrom } from "../../utils/vegas";

const SHOWN = 12;

export function EnvironmentsCard({ upcoming: next, isLoading, isError }) {
  const offenses = offensesFrom(next?.games ?? []);
  const priced = offenses.filter((team) => team.implied != null);
  const max = priced.length ? priced[0].implied : 0;
  const median = priced.length ? priced[Math.floor(priced.length / 2)].implied : 0;

  return (
    <Card>
      <CardHead title={next ? `${next.label} Environments` : "Environments"} sub="Vegas implied team totals" />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!offenses.length} empty="No games next week." rows={6} />
      {offenses.length > 0 && (
        <>
          <div className="mb-1 flex justify-between px-2 text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">
            <span>Offense</span>
            <span>Implied points</span>
          </div>
          <TeamEnvironmentRail teams={offenses.slice(0, SHOWN)} median={median} max={max} />
          {offenses.length > SHOWN && (
            <p className="mt-2 px-2 text-[10.5px] text-faint">
              Top {SHOWN} of {offenses.length}. Faded bars are below the week&apos;s median.
            </p>
          )}
        </>
      )}
      <CardLink to="/schedule/vegas">Vegas board</CardLink>
    </Card>
  );
}
