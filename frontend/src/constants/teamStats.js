// How the team pages and team leaderboards arrange the team metrics.
//
// The metrics themselves (label, format, which way is better on each side) come from
// GET /teams/stats, so this file only decides grouping and order. Ranks are always
// 1 = best, or 1 = most for a tendency.

/** Short row labels for the team page. */
export const TEAM_STAT_LABEL = {
  net_epa: "Net EPA/play", epa: "EPA/play", suc: "Success rate", p_epa: "EPA/dropback", r_epa: "EPA/designed run",
  explosive: "Explosive play %", ypp: "Yards/play", ppg: "Points/game", pts_drive: "Points/drive", rz_td: "Red zone TD %",
  d3: "Third down %", three_out: "Three-and-out %", tov_g: "Turnovers/game", to_drive: "Turnovers/drive", start: "Start field pos.",
  p_yds_g: "Pass yards/game", cpoe: "CPOE", adot: "aDOT", yac: "YAC/completion", x_pass: "Explosive pass %", sack_rate: "Sack %",
  int_rate: "INT %", r_yds_g: "Rush yards/game", ypc: "Yards/carry", stuff: "Stuff %", x_run: "Explosive run %", box8: "8+ box %",
  plays_g: "Plays/game", snaps_g: "Snaps/game", sec_snap: "Sec/snap, neutral", db_g: "Dropbacks/game", pass_rate: "Pass %",
  n_pass: "Neutral pass %", proe: "Pass rate over exp.", gun: "Shotgun %", under: "Under center %", empty: "Empty backfield %",
  motion: "Motion %", nohud: "No huddle %", pa: "Play action %", rpo: "RPO %", screen: "Screen %", blitz: "Blitz %",
  rushers: "Pass rushers", man: "Man coverage %",
  pers_11_share: "11 personnel %", pers_12_share: "12 personnel %", pers_13_share: "13 personnel %",
  pers_21_share: "21 personnel %", pers_22_share: "22 personnel %",
};

/** Team page: the groups worth a defense column, drawn as all-32-team strips. */
export const TEAM_STRIP_GROUPS = [
  { name: "Efficiency", rows: ["net_epa", "epa", "suc", "p_epa", "r_epa", "explosive", "ypp"] },
  { name: "Scoring and drives", rows: ["ppg", "pts_drive", "rz_td", "d3", "three_out", "tov_g", "to_drive", "start"] },
  { name: "Passing", rows: ["p_yds_g", "cpoe", "adot", "yac", "x_pass", "sack_rate", "int_rate"] },
  { name: "Rushing", rows: ["r_yds_g", "ypc", "stuff", "x_run", "box8"] },
];

/** Team page: offense-only rank table. */
export const TEAM_TABLE_GROUPS = [
  { name: "Pace and tendencies", rows: ["plays_g", "snaps_g", "sec_snap", "db_g", "pass_rate", "n_pass", "proe"] },
  {
    name: "Personnel, play type and formation",
    rows: ["pers_11_share", "pers_12_share", "pers_13_share", "pers_21_share", "pers_22_share",
      "gun", "under", "empty", "motion", "nohud", "pa", "rpo", "screen", "blitz", "rushers", "man"],
  },
];

export const PASS_DEPTHS = [
  { key: "deep", name: "Deep", range: "20+ yds", from: 20, to: 35 },
  { key: "intermediate", name: "Intermediate", range: "10–19 yds", from: 10, to: 20 },
  { key: "short", name: "Short", range: "0–9 yds", from: 0, to: 10 },
  { key: "behind", name: "Behind the line", range: "under 0", from: -5, to: 0 },
];

export const RUN_LANES = [
  { key: "left_end", name: "Left end", x: 58 }, { key: "left_tackle", name: "Left tackle", x: 122 },
  { key: "left_guard", name: "Left guard", x: 178 }, { key: "middle", name: "Middle", x: 230 },
  { key: "right_guard", name: "Right guard", x: 282 }, { key: "right_tackle", name: "Right tackle", x: 338 },
  { key: "right_end", name: "Right end", x: 402 },
];

export const RUN_GROUPS = [
  { key: "inside", name: "Inside", hint: "between the tackles" },
  { key: "off_tackle", name: "Off tackle", hint: "tackle gaps" },
  { key: "outside", name: "Outside", hint: "around the end" },
];

/**
 * Team leaderboard tabs. A column is a metric id, or [id, pinned side, header].
 * `sided` tabs have an Offense/Defense switch; every stat has one home tab, and only
 * Fantasy repeats two volume columns.
 */
export const TEAM_BOARD_TABS = [
  {
    id: "overview", label: "Overview", sided: false, sort: ["net_epa", "o"],
    description: "Results and EPA per play on both sides of the ball, with the schedule behind them.",
    sections: [
      ["Results", [["record", null, "Record"], ["pdiff", null, "Diff/G"], ["ppg", "o", "Pts/G"], ["ppg", "d", "Allowed/G"]]],
      ["EPA per play", [["net_epa", null, "Net"], ["epa", "o", "Offense"], ["epa", "d", "Defense"]]],
      ["Schedule", [["sos", "o", "Opp. defenses"], ["sos", "d", "Opp. offenses"]]],
    ],
  },
  {
    id: "efficiency", label: "Efficiency", sided: true, sort: "epa",
    description: "EPA and success per play, overall and by play type.",
    sections: [["Overall", ["epa", "suc", "ypp", "explosive"]], ["Passing", ["p_epa", "p_suc"]], ["Rushing", ["r_epa", "r_suc"]]],
  },
  {
    id: "passing", label: "Passing", sided: true, sort: "p_yds_g",
    description: "Volume, accuracy, depth and mistakes, with FTN charting.",
    sections: [["Volume", ["db_g", "p_yds_g", "p_td_g"]], ["Accuracy", ["cpoe", "catchable", "drop"]], ["Depth", ["adot", "yac", "x_pass"]], ["Mistakes", ["sack_rate", "int_rate", "intw"]]],
  },
  {
    id: "rushing", label: "Rushing", sided: true, sort: "r_yds_g",
    description: "Designed runs only: volume, results, where the runs go and how stacked the box is.",
    sections: [["Volume", ["ru_g", "r_yds_g", "r_td_g"]], ["Results", ["ypc", "stuff", "x_run"]], ["Direction", ["gap_in", "gap_tk", "gap_out"]], ["Looks", ["box8"]]],
  },
  {
    id: "drives", label: "Drives and situations", sided: true, sort: "pts_drive",
    description: "Drive results, the red zone, third and fourth down, turnovers and penalties.",
    sections: [["Drives", ["drives_g", "pts_drive", "three_out", "to_drive", "start"]], ["Red zone", ["rz_g", "rz_td"]], ["Downs", ["d3", "d4_go", "d4_conv"]], ["Turnovers and penalties", ["tov_g", "pen_yds"]]],
  },
  {
    id: "tendencies", label: "Pace and tendencies", sided: true, sort: "plays_g",
    description: "How fast they play, how often they throw, and how they line up.",
    sections: [["Pace", ["plays_g", "snaps_g", "sec_snap"]], ["Pass or run", ["pass_rate", "n_pass", "proe"]], ["Formation", ["gun", "under", "empty", "motion", "nohud"]], ["Play type", ["pa", "rpo", "screen"]], ["Pressure and coverage", ["blitz", "rushers", "man"]]],
  },
  {
    id: "fantasy", label: "Fantasy", sided: true, sideLabels: ["Scored", "Allowed"], sort: "fp",
    description: "Fantasy points by position, scored by the offense or allowed by the defense, next to the betting market and the volume behind them.",
    sections: [["Fantasy points per game", [["fp", null, "All"], ["fp_QB", null, "QB"], ["fp_RB", null, "RB"], ["fp_WR", null, "WR"], ["fp_TE", null, "TE"]]], ["Market", ["imp", "vs_imp"]], ["Volume", ["plays_g", "rz_g"]]],
  },
  {
    id: "personnel", label: "Personnel", sided: false, sort: ["pers_11_share", "o"],
    description: "Usage, EPA and success by grouping.",
    sections: ["11", "12", "13", "21", "22"].map((g) => [`${g} personnel`, [[`pers_${g}_share`, "o", "Usage"], [`pers_${g}_epa`, "o", "EPA/play"], [`pers_${g}_suc`, "o", "Success"]]]),
  },
];
export const TEAM_BOARD_CUSTOM = { id: "custom", label: "Custom" };
export const TEAM_BOARD_TAB_IDS = [...TEAM_BOARD_TABS.map((tab) => tab.id), TEAM_BOARD_CUSTOM.id];
export const DEFAULT_TEAM_CUSTOM = "epa.o,epa.d,proe.o,fp_WR.o,fp_WR.d";
