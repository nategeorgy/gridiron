// The two identity colours a head-to-head uses, shared by the table and the radar so
// the same player is the same colour in both.
//
// Blue and gold: two of the validated `--series-*` hues, far enough apart to separate
// under every colour-vision deficiency the token set was checked against. This is the
// same pair (and the same treatment) as the Command Center's head-to-head card, so a
// matchup reads identically on the home page and on a player page.
//
// ⚠️ White on the gold measures 2.17:1 in the light theme — nowhere near the 4.5:1
// floor — so the gold badge takes dark ink rather than inheriting one shared white.
export const SIDES = [
  { color: "var(--series-1)", badge: "color-mix(in srgb, var(--series-1) 84%, #000)", ink: "#ffffff" },
  { color: "var(--series-4)", badge: "var(--series-4)", ink: "#160f00" },
];
