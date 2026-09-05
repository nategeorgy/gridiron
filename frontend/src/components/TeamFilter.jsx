// Team filter for the ranked boards (M12).
//
// Filters the *stat lines*, so it means "played for this team in this window" rather
// than "is on this roster today" — a traded player shows under both clubs for the
// weeks he actually played there, which is what a season leaderboard is asking.
//
// Deliberately does NOT narrow the percentile pool: a receiver's 84th percentile is a
// claim about the league, and it would be a different number — and a misleading one —
// if it silently meant "84th among Bengals". The backend enforces that; this control
// only says so in its tooltip.
import { useQuery } from "@tanstack/react-query";
import { Select } from "./ui/Select";
import { getTeams } from "../services/teams";

const ALL = { value: "", label: "All teams" };

export function TeamFilter({ value, onChange }) {
  const { data } = useQuery({
    queryKey: ["teams"],
    queryFn: getTeams,
    staleTime: Infinity,
  });

  const options = [
    ALL,
    ...(data ?? [])
      .map((team) => ({ value: team.abbreviation, label: team.abbreviation }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  return (
    <Select
      label="Team"
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}
