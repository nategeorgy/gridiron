// Query Builder: search every game or season since 2009 by any stat, then rank what
// comes back.
//
// A screener on the left (what to search, who, when, and stat ranges each drawn over its
// own distribution) and the results on the right. The whole search is the URL, so a
// link or a saved view reopens it exactly. The engine is app/query_builder.py; the table
// leads with the filtered stats, follows them with columns the reader can edit (the
// leaderboard's Edit Columns slide-out, fed the engine's stats), and sorts only by what
// it shows. Top N cuts the result to its first rows, and the export image draws them
// (QueryResultsImage), up to IMAGE_MAX_ROWS.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveSearchParams } from "../hooks/useLiveSearchParams";
import { Select } from "../components/ui/Select";
import { Segmented } from "../components/team/Segmented";
import { ScoringControl } from "../components/ScoringControl";
import { SaveViewButton } from "../components/SaveViewButton";
import { TeamFilter } from "../components/TeamFilter";
import { TablePager } from "../components/StatTable";
import { FinishChip } from "../components/player/FinishChip";
import { ChartState, Chips, ExploreHeader, PlayerLine } from "../components/explore/common";
import { QueryFilterCard } from "../components/explore/QueryFilterCard";
import { DownloadIcon, ExportImageButton } from "../components/explore/ExportImageButton";
import { QueryResultsImage } from "../components/explore/QueryResultsImage";
import { ColumnEditor } from "../components/leaderboard/ColumnEditor";
import {
  DEFAULT_EXAMPLE,
  FIELD_GROUPS,
  IMAGE_MAX_ROWS,
  QUERY_EXAMPLES,
  QUERY_POSITIONS,
  ROOKIE_OPTIONS,
  SEASON_TYPE_OPTIONS,
  TOP_OPTIONS,
  formatWhere,
  parseWhere,
  rangeText,
  searchSubtitle,
  searchTitle,
} from "../constants/queryBuilder";
import { scoringLabel } from "../constants/scoring";
import { FIRST_SEASON } from "../constants";
import { useQueryFields, useQuerySearch } from "../hooks/useExplore";
import { useLeague } from "../hooks/useLeague";
import { parseLeague } from "../constants/league";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { runQuery } from "../services/explore";
import { downloadCsv, toCsv } from "../utils/csv";
import { formatStat } from "../utils/format";

const PAGE_SIZE = 100;
// Keys whose empty value means something ("no ranges", "no columns") rather than "default".
const RAW_KEYS = ["where", "cols"];

export function QueryBuilderView({ board }) {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const { seasons, currentSeason } = useSeasons();
  const [scoring, setScoring] = useScoring();
  const [leagueSpec] = useLeague();
  // FinishChip colours a finish by how deep the league starts the position, so it takes
  // the parsed league rather than the spec string the API reads.
  const league = useMemo(() => parseLeague(leagueSpec), [leagueSpec]);
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState([]);
  const [copied, setCopied] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const { data: fieldData } = useQueryFields();
  const fields = useMemo(() => Object.fromEntries((fieldData?.fields ?? []).map((field) => [field.id, field])), [fieldData]);

  const firstHeld = Math.min(...(seasons.length ? seasons : [FIRST_SEASON]));
  const lastHeld = Number(currentSeason);
  // `where` is read raw: absent means "the opening example", empty means "no ranges".
  // `cols` likewise: absent means the grain's default columns, empty means none.
  const read = (key, fallback) => searchParams.get(key) ?? fallback;
  const top = TOP_OPTIONS.some((option) => option.value === searchParams.get("top")) ? searchParams.get("top") : "all";
  const cols = searchParams.has("cols") ? searchParams.get("cols") : null;
  const search = {
    grain: read("grain", "games"),
    mode: read("mode", "list"),
    pos: read("pos", DEFAULT_EXAMPLE.search.pos),
    from: Number(read("from", firstHeld)),
    to: Number(read("to", lastHeld)),
    type: read("type", "REG"),
    team: read("team", ""),
    rookies: read("rookies", "any"),
    where: searchParams.has("where") ? searchParams.get("where") : DEFAULT_EXAMPLE.search.where,
    sort: read("sort", ""),
    order: read("order", ""),
  };
  const conditions = parseWhere(search.where);
  const positions = search.pos.split(",").filter((position) => QUERY_POSITIONS.includes(position));

  /** Change some of the search; `null` clears a key back to its default. */
  const update = (changes) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (!next.has("where")) next.set("where", DEFAULT_EXAMPLE.search.where);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || (!RAW_KEYS.includes(key) && value === "")) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    }, { replace: true });
    setOffset(0);
  };

  const loadExample = (id) => {
    const example = QUERY_EXAMPLES.find((entry) => entry.id === id);
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(example.search)) next.set(key, value);
    if (!next.has("where")) next.set("where", "");
    for (const key of ["scoring", "top"]) {
      if (searchParams.get(key)) next.set(key, searchParams.get(key));
    }
    setSearchParams(next, { replace: true });
    setOffset(0);
    setPending([]);
  };
  const activeExample = QUERY_EXAMPLES.find((example) => {
    const wanted = { grain: "games", mode: "list", rookies: "any", sort: "", ...example.search };
    return wanted.pos === search.pos && wanted.where === search.where && wanted.grain === search.grain
      && wanted.mode === search.mode && wanted.rookies === search.rookies && wanted.sort === search.sort
      && search.type === "REG" && !search.team && search.from === firstHeld && search.to === lastHeld;
  })?.id;

  const params = useMemo(() => ({
    grain: search.grain,
    mode: search.grain === "games" ? search.mode : "list",
    positions: positions.join(","),
    first_season: search.from,
    last_season: search.to,
    season_type: search.type,
    team: search.team || undefined,
    rookies: search.rookies,
    where: search.where,
    columns: cols ?? undefined,
    sort: search.sort || undefined,
    order: search.order || undefined,
    scoring,
    limit: top === "all" ? PAGE_SIZE : Number(top),
    offset: top === "all" ? offset : 0,
  }), [search.grain, search.mode, search.pos, search.from, search.to, search.type, search.team, search.rookies, search.where, cols, search.sort, search.order, scoring, top, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, isLoading, isError, error, isPlaceholderData } = useQuerySearch(params);
  // The image draws the first rows, whatever page the table is on. On the first page
  // (or with a Top N) these are the same params, so React Query serves one request.
  const imageParams = { ...params, offset: 0, limit: top === "all" ? IMAGE_MAX_ROWS : Number(top) };
  const { data: imageData, isPlaceholderData: imageStale } = useQuerySearch(imageParams);

  // A filter added without a range starts at the value the API suggests (the top fifth
  // of the scope, or the bottom fifth for a stat where lower is better).
  useEffect(() => {
    if (!pending.length || !data?.histograms) return;
    const ready = pending.filter((field) => data.histograms[field]?.suggested);
    if (!ready.length) return;
    const next = conditions.map((condition) => {
      if (!ready.includes(condition.field) || condition.min !== null || condition.max !== null) return condition;
      const suggested = data.histograms[condition.field].suggested;
      return { ...condition, min: suggested.min ?? null, max: suggested.max ?? null };
    });
    setPending((current) => current.filter((field) => !ready.includes(field)));
    update({ where: formatWhere(next) });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const setConditions = (next) => update({ where: formatWhere(next) });
  const togglePosition = (position) => {
    const set = new Set(positions);
    if (set.has(position)) set.delete(position);
    else set.add(position);
    if (!set.size) set.add(position);
    update({ pos: QUERY_POSITIONS.filter((entry) => set.has(entry)).join(",") });
  };
  const setGrain = (grain) => {
    const fits = (id) => !fields[id] || fields[id].grains.includes(grain);
    const kept = conditions.filter((condition) => fits(condition.field));
    update({
      grain: grain === "games" ? null : grain, mode: null, sort: null, order: null, where: formatWhere(kept),
      ...(cols === null ? {} : { cols: cols.split(",").filter((id) => id && fits(id)).join(",") }),
    });
  };

  // The columns after the filtered stats, read from the URL rather than the last
  // response so two quick edits both build on the newest list. The API drops any the
  // grain cannot show; so does this. The library is every stat the grain has, by group.
  const filteredIds = new Set(conditions.map((condition) => condition.field));
  const chosenColumns = (cols !== null ? cols.split(",") : data?.default_columns ?? []).filter((id, index, list) =>
    id && list.indexOf(id) === index && fields[id]?.grains.includes(search.grain) && !filteredIds.has(id));
  const library = useMemo(() => ({
    label: search.grain === "games" ? "Games" : "Seasons",
    tabs: FIELD_GROUPS.map((group) => ({ id: group, label: group })),
    pool: Object.fromEntries(FIELD_GROUPS.map((group) => [group, [{
      name: group,
      columns: Object.values(fields).filter((field) => field.group === group && field.grains.includes(search.grain)).map((field) => field.id),
    }]])),
  }), [fields, search.grain]);

  const addable = FIELD_GROUPS.map((group) => ({
    group,
    options: Object.values(fields).filter((field) => field.group === group && field.grains.includes(search.grain)
      && !conditions.some((condition) => condition.field === field.id)),
  })).filter((entry) => entry.options.length);

  const noun = search.grain === "games" ? "games" : "seasons";
  const seasonChoices = [...seasons].sort((a, b) => a - b);
  const listMode = !data || data.mode === "list";

  // Export image: the first rows, drawn as a table, titled and captioned from the search.
  const imageRows = imageData?.rows?.slice(0, IMAGE_MAX_ROWS) ?? [];
  const imageTotal = imageData ? (imageData.mode === "count" ? imageData.players : imageData.total) : 0;
  const showsFantasy = imageData?.mode === "count"
    || imageData?.columns?.some((column) => fields[column.key]?.group === "Fantasy");
  const image = imageData && imageRows.length ? {
    title: searchTitle({ search, data: imageData, conditions, fields, example: QUERY_EXAMPLES.find((example) => example.id === activeExample) }),
    subtitle: searchSubtitle({ search, positions, conditions, fields, scoring: showsFantasy ? scoringLabel(scoring) : null }),
    note: imageRows.length === imageTotal ? `All ${imageTotal.toLocaleString()}` : `Top ${imageRows.length} of ${imageTotal.toLocaleString()}`,
  } : null;

  return (
    <div className="space-y-4">
      <ExploreHeader title={board.title} description={board.description} />

      <section className="glass-card grid gap-2 px-4 py-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Start from an example</span>
        <Chips label="Examples" value={activeExample} onChange={loadExample} scroll
          options={QUERY_EXAMPLES.map((example) => ({ value: example.id, label: example.label }))} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="glass-card grid gap-4 p-4">
          <ScreenerSection title="Search">
            <Segmented label="Search" value={search.grain} onChange={setGrain}
              options={[{ value: "games", label: "Games" }, { value: "seasons", label: "Seasons" }]} />
          </ScreenerSection>

          <ScreenerSection title="Players">
            <div className="flex flex-wrap gap-1.5">
              {QUERY_POSITIONS.map((position) => {
                const on = positions.includes(position);
                return (
                  <button key={position} type="button" aria-pressed={on} onClick={() => togglePosition(position)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "text-fg" : "border-edge text-muted hover:text-fg"}`}
                    style={on ? {
                      borderColor: `color-mix(in srgb, var(--position-${position.toLowerCase()}) 70%, transparent)`,
                      background: `color-mix(in srgb, var(--position-${position.toLowerCase()}) 22%, transparent)`,
                    } : undefined}>
                    {position}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TeamFilter value={search.team} onChange={(value) => update({ team: value })} />
              <Select label="Experience" value={search.rookies} onChange={(value) => update({ rookies: value === "any" ? null : value })}
                options={ROOKIE_OPTIONS} />
            </div>
          </ScreenerSection>

          <ScreenerSection title="When">
            <div className="grid grid-cols-2 gap-2">
              <Select label="From" value={String(search.from)}
                onChange={(value) => update({ from: Number(value) === firstHeld ? null : value, ...(Number(value) > search.to ? { to: value } : {}) })}
                options={seasonChoices.map((year) => ({ value: String(year), label: String(year) }))} />
              <Select label="To" value={String(search.to)}
                onChange={(value) => update({ to: Number(value) === lastHeld ? null : value, ...(Number(value) < search.from ? { from: value } : {}) })}
                options={seasonChoices.map((year) => ({ value: String(year), label: String(year) }))} />
            </div>
            <Select label="Season type" value={search.type} onChange={(value) => update({ type: value === "REG" ? null : value })}
              options={SEASON_TYPE_OPTIONS} />
          </ScreenerSection>

          <ScreenerSection title="Stats" note={`${conditions.length} filter${conditions.length === 1 ? "" : "s"}`}>
            {conditions.map((condition, index) => (
              <QueryFilterCard
                key={condition.field}
                condition={condition}
                field={fields[condition.field]}
                histogram={data?.histograms?.[condition.field]}
                noun={noun}
                onChange={(bounds) => setConditions(conditions.map((entry, position) => (position === index ? { ...entry, ...bounds } : entry)))}
                onRemove={() => {
                  setConditions(conditions.filter((_, position) => position !== index));
                  setPending((current) => current.filter((field) => field !== condition.field));
                }}
              />
            ))}
            <select
              value=""
              onChange={(event) => {
                const field = event.target.value;
                if (!field) return;
                setPending((current) => [...current, field]);
                setConditions([...conditions, { field, min: null, max: null }]);
              }}
              className="glass-input px-3 py-2 text-sm"
              aria-label="Add a stat filter"
            >
              <option value="" style={{ background: "var(--surface-solid)" }}>+ Add a stat filter</option>
              {addable.map((entry) => (
                <optgroup key={entry.group} label={entry.group} style={{ background: "var(--surface-solid)" }}>
                  {entry.options.map((field) => (
                    <option key={field.id} value={field.id} style={{ background: "var(--surface-solid)", color: "var(--fg)" }}>{field.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </ScreenerSection>

          <ScreenerSection title="Scoring">
            <ScoringControl scoring={scoring} onChange={setScoring} label="" bare />
          </ScreenerSection>
        </aside>

        <section className={`glass-card min-w-0 p-4 transition ${isPlaceholderData ? "opacity-70" : ""}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-2xl font-bold tracking-tight text-fg">
              <span className="stat-num">{(data?.total ?? 0).toLocaleString()}</span>{" "}
              <small className="text-sm font-medium text-muted">
                {!data ? "" : data.mode === "count"
                  ? `matching games by ${data.players.toLocaleString()} players`
                  : `${noun} match · ${data.players.toLocaleString()} players`}
              </small>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SaveViewButton defaultName="Query Builder search" />
              <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              })} className="btn-ghost px-3 py-1.5 text-[13px] transition hover:!text-accent">
                {copied ? "Link copied" : "Copy link"}
              </button>
              <ExportImageButton
                title={image?.title ?? "Query Builder"}
                subtitle={image?.subtitle}
                note={image?.note}
                render={() => <QueryResultsImage data={imageData} rows={imageRows} league={league} />}
                disabled={!image || imageStale}
                sizes={["fit"]}
                fitScale={1}
                watermark={false}
                editableTitle
              />
              <ExportAllButton params={params} data={data} limit={top === "all" ? 5000 : Number(top)} />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-muted">
            {conditions.map((condition, index) => (
              <span key={condition.field} className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-2 py-0.5 pl-2.5 pr-1.5 text-xs">
                {fields[condition.field]?.label ?? condition.field}{" "}
                <b className="stat-num text-fg">{rangeText(condition, fields[condition.field])}</b>
                <button type="button" aria-label="Remove" onClick={() => setConditions(conditions.filter((_, position) => position !== index))}
                  className="px-1 text-faint hover:text-fg">×</button>
              </span>
            ))}
            {search.grain === "games" && (
              <Segmented label="Show" value={search.mode} onChange={(value) => update({ mode: value === "list" ? null : value, sort: null, order: null })}
                options={[{ value: "list", label: "Every game" }, { value: "count", label: "Count of games by player" }]} />
            )}
            <span className="inline-flex items-center gap-2">
              Top
              <Segmented label="Top" value={top} onChange={(value) => update({ top: value === "all" ? null : value })}
                options={TOP_OPTIONS} />
            </span>
            {data?.columns && (
              <label className="inline-flex items-center gap-2">
                Sorted by
                <select value={data.sort} onChange={(event) => update({ sort: event.target.value, order: null })}
                  className="glass-input px-2 py-1 text-xs">
                  {data.columns.map((column) => (
                    <option key={column.key} value={column.key} style={{ background: "var(--surface-solid)" }}>{column.label}</option>
                  ))}
                </select>
              </label>
            )}
            {listMode && (
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={editorOpen}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-1 text-xs font-semibold text-fg transition hover:text-accent"
                style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }}
              >
                <EditColumnsIcon />
                Edit Columns
              </button>
            )}
          </div>

          {isLoading || isError || !data?.rows?.length ? (
            <ChartState isLoading={isLoading} isError={isError} isEmpty={!data?.rows?.length} height={420}
              empty={isError ? error?.response?.data?.detail : "Nothing matches. Loosen a range or widen the seasons."} />
          ) : (
            <ResultsTable data={data} offset={offset} league={league}
              onSort={(key) => update(data.sort === key ? { order: data.order === "desc" ? "asc" : "desc" } : { sort: key, order: null })} />
          )}

          {data?.rows?.length > 0 && top === "all" && (
            <div className="mt-3">
              <TablePager offset={offset} pageSize={PAGE_SIZE} total={data.mode === "count" ? data.players : data.total} onOffsetChange={setOffset} />
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Scored in your league scoring. Click a column to sort by it. Weekly finish ranks everyone at the position with a stat
            line that week. Playoff weeks show as WC, DIV, CONF and SB.
          </p>
        </section>
      </div>

      <ColumnEditor
        open={editorOpen && listMode}
        onClose={() => setEditorOpen(false)}
        sections={[{ name: "", columns: chosenColumns }]}
        onChange={(next) => update({ cols: next.join(",") })}
        onReset={() => update({ cols: null })}
        resetLabel="Reset to the default columns"
        initialTab="Fantasy"
        metrics={fields}
        library={library}
        locked={conditions.filter((condition) => fields[condition.field]).map((condition) => ({ id: condition.field, note: "Filtered" }))}
        boardTitle="In this table"
        subtitle="Filtered stats come first. Every column after them is yours."
      />
    </div>
  );
}

function EditColumnsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11M10.5 2.5v11" />
    </svg>
  );
}

function ScreenerSection({ title, note, children }) {
  return (
    <div className="grid gap-2">
      <h3 className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
        {title}
        {note && <span className="stat-num normal-case tracking-normal">{note}</span>}
      </h3>
      {children}
    </div>
  );
}

function gameText(row) {
  const place = row.home ? "vs" : "@";
  const score = row.team_score === null || row.team_score === undefined ? "" : `${row.team_score}–${row.opponent_score} `;
  return { result: row.result, text: `${score}${place} ${row.opponent ?? ""}` };
}

function ResultsTable({ data, offset, league, onSort }) {
  const heading = (column) => {
    const sorted = data.sort === column.key;
    return (
      <th key={column.key} onClick={() => onSort(column.key)} title={`${column.label}. Click to sort.`}
        className={`cursor-pointer whitespace-nowrap px-2 pb-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] ${sorted ? "text-fg" : "text-faint hover:text-fg"}`}>
        {column.filtered ? column.label : column.short}
        {sorted ? (data.order === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  };
  const cell = (column, row) => {
    const value = row[column.key];
    const style = column.filtered || data.sort === column.key ? "font-semibold text-fg" : "";
    if (column.key === "weekly_finish") {
      return <td key={column.key} className="px-2 py-1.5 text-right"><FinishChip rank={value} position={row.position} league={league} /></td>;
    }
    return <td key={column.key} className={`stat-num px-2 py-1.5 text-right ${style}`}>{formatStat(value, column.format)}</td>;
  };
  const games = data.grain === "games" && data.mode === "list";
  const count = data.mode === "count";

  return (
    // On a phone the player is pinned (with his rank) while the stats scroll, and the
    // header sits above the pinned cells (z-2) when the list scrolls under it.
    <div className="max-h-[900px] overflow-auto">
      <table className="w-full border-collapse text-[13px] md:min-w-[640px]">
        <thead className="sticky top-0 z-[2]" style={{ background: "var(--surface-solid)" }}>
          <tr>
            <th className="hidden w-8 px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint md:table-cell">#</th>
            <th className="pin-col px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint max-md:!bg-[color:var(--surface-solid)] max-md:pl-8">Player</th>
            {!count && <th className="px-2 pb-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Season</th>}
            {games && <th className="px-2 pb-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Wk</th>}
            {games && <th className="px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Game</th>}
            {data.columns.map(heading)}
            {count && <th className="px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Best game</th>}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => {
            const game = games ? gameText(row) : null;
            const best = count ? gameText(row.best) : null;
            return (
              <tr key={`${row.player_id}-${row.season ?? ""}-${row.week ?? ""}-${index}`} className="border-t border-line">
                <td className="stat-num hidden px-2 py-1.5 text-xs text-faint md:table-cell">{offset + index + 1}</td>
                <td className="pin-col px-2 py-1.5 max-md:max-w-[170px]">
                  <span className="flex items-center gap-1.5">
                    <span className="stat-num w-5 shrink-0 text-right text-[11px] text-faint md:hidden">{offset + index + 1}</span>
                    <Link to={`/players/${row.player_id}`} className="min-w-0 hover:text-accent"><PlayerLine player={row} size={24} /></Link>
                  </span>
                </td>
                {!count && <td className="stat-num px-2 py-1.5 text-right">{row.season}</td>}
                {games && <td className="stat-num px-2 py-1.5 text-right">{row.week_label}</td>}
                {games && (
                  <td className="stat-num whitespace-nowrap px-2 py-1.5 text-left text-muted">
                    <ResultMark result={game.result} /> {game.text}
                  </td>
                )}
                {data.columns.map((column) => cell(column, row))}
                {count && (
                  <td className="stat-num whitespace-nowrap px-2 py-1.5 text-left text-muted">
                    {formatStat(row.best.fantasy_points, 1)} · {row.best.season} {row.best.season_type === "POST" ? row.best.week_label : `Wk ${row.best.week_label}`} {best.text}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultMark({ result }) {
  if (!result) return null;
  const color = result === "W" ? "var(--pos)" : result === "L" ? "var(--neg)" : "var(--muted)";
  return <span className="font-semibold" style={{ color }}>{result}</span>;
}

/** Every matching row as a CSV (the Top N, or up to the API's 5,000), fetched on click. */
function ExportAllButton({ params, data, limit }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const all = await runQuery({ ...params, limit, offset: 0 });
      const count = all.mode === "count";
      const games = all.grain === "games" && !count;
      const columns = [
        { key: "name", label: "Player" }, { key: "position", label: "Position" }, { key: "team", label: "Team" },
        ...(count ? [] : [{ key: "season", label: "Season" }]),
        ...(games ? [{ key: "week_label", label: "Week" }, { key: "opponent", label: "Opponent" }, { key: "result", label: "Result" }] : []),
        ...all.columns.map((column) => ({ key: column.key, label: column.label })),
        ...(count ? [{ key: "best_game", label: "Best game" }] : []),
      ];
      const rows = all.rows.map((row) => ({
        ...row,
        ...(count ? { best_game: `${row.best.fantasy_points} (${row.best.season} ${row.best.week_label} ${row.best.home ? "vs" : "@"} ${row.best.opponent})` } : {}),
      }));
      downloadCsv("second-level-query.csv", toCsv(rows, columns, [
        "Second Level: Query Builder",
        `${all.total} ${count ? "matching games" : all.grain} · ${window.location.href}`,
      ]));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={busy || !data?.rows?.length}
      className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition enabled:hover:!text-accent">
      <DownloadIcon />
      {busy ? "Preparing…" : "Export CSV"}
    </button>
  );
}
