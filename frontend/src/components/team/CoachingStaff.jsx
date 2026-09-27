// Head coach and coordinators by season. An empty role usually means the head coach
// called it, which the note on that person says when the source does.
const ROLES = [
  ["head_coach", "Head coach"],
  ["offensive_coordinator", "Offensive coord."],
  ["defensive_coordinator", "Defensive coord."],
];

export function CoachingStaff({ staff, season }) {
  const rows = [...(staff ?? [])].sort((a, b) => b.season - a.season);
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Coaching staff</h2>
      <p className="mb-2.5 text-[11.5px] text-faint">Head coach and coordinators by season</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No staff listed.</p>
      ) : (
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-[11px] text-faint">
              <th className="pb-1.5 pr-2 text-left font-medium" />
              {ROLES.map(([key, label]) => <th key={key} className="pb-1.5 pr-2 text-left font-medium">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const current = row.season === season;
              return (
                <tr key={row.season} className={`border-t border-line align-top ${current ? "font-semibold" : ""}`}>
                  <td className={`stat-num w-11 py-1.5 pr-2 ${current ? "text-accent" : "text-muted"}`}>{row.season}</td>
                  {ROLES.map(([key]) => (
                    <td key={key} className="py-1.5 pr-2 text-fg">
                      {row[key]?.length ? row[key].map(([name, note]) => (
                        <span key={name} className="block">
                          {name}
                          {note && <span className="block text-[11px] font-normal text-faint">{note}</span>}
                        </span>
                      )) : <span className="font-normal text-faint">None listed</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
