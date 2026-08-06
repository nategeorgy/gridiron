// League-context state — the same layering as useScoring:
//
//     URL query param  >  active league profile  >  localStorage  >  12-team
//
// See useScoring for why the URL outranks the account.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_LEAGUE } from "../constants/league";
import { LEAGUE_STORAGE_KEY, readStored, writeStored } from "../constants/storage";
import { useLeagueProfiles } from "./useAccount";

export function useLeague() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProfile } = useLeagueProfiles();

  const fromUrl = searchParams.get("league");
  const league =
    fromUrl ||
    activeProfile?.league_spec ||
    readStored(LEAGUE_STORAGE_KEY) ||
    DEFAULT_LEAGUE;

  const setLeague = useCallback(
    (spec) => {
      const next = spec || DEFAULT_LEAGUE;
      writeStored(LEAGUE_STORAGE_KEY, next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          // Keep the default out of the URL to stay clean; it still resolves to 12-team.
          if (next === DEFAULT_LEAGUE) params.delete("league");
          else params.set("league", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const isOverridingProfile = Boolean(
    fromUrl && activeProfile && fromUrl !== activeProfile.league_spec,
  );

  return [league, setLeague, { isOverridingProfile, activeProfile }];
}
