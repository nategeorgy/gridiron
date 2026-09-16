// League context (size + starting lineup) — now a constant.
//
// It existed to drive replacement level, and replacement level existed to drive VORP.
// VORP was pulled from every surface before launch, so nothing on screen responds to
// this any more and the editor that set it is gone. Rather than thread a dead value
// through a dozen call sites, the hook keeps its shape and hands back the default:
// the API still wants a league spec, and a 12-team standard lineup is the honest
// assumption behind every fantasy number the app shows.
//
// Kept as a hook rather than inlining DEFAULT_LEAGUE so that reinstating a league
// editor — when VORP comes back — is a change here and nowhere else.
import { DEFAULT_LEAGUE } from "../constants/league";

export function useLeague() {
  return [DEFAULT_LEAGUE];
}
