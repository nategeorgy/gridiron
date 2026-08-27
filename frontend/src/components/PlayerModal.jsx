// A player's full profile, in a dialog (M9).
//
// **It renders `PlayerProfile` itself**, not a trimmed-down copy of it. A second
// "profile card" component would look identical on the day it shipped and drift the
// first time either side gained a chart — and the whole point of opening a player
// mid-draft is to see the same numbers you would see on their page, not a summary of
// them.
import { Dialog } from "./ui/Dialog";
import { PlayerProfile } from "../pages/PlayerProfile";

export function PlayerModal({ playerId, onClose }) {
  return (
    <Dialog
      open={Boolean(playerId)}
      onClose={onClose}
      title="Player profile"
      hideHeader
      width="max-w-5xl"
    >
      {playerId && <PlayerProfile playerId={playerId} />}
    </Dialog>
  );
}
