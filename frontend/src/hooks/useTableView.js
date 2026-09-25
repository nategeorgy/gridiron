// One table's view on the player page: which leaderboard tab it shows, or its own
// custom column list (September 2026).
//
// The same model as the leaderboards, scaled down to a table. The tab lives in the URL
// (`?career=usage`, `?log=tracking`) and so does a custom list (`?career_cols=...`), so a
// link to a player page carries what each table was showing. A custom list is read raw
// for the leaderboard's reason: absent means "no custom table yet" and empty means "the
// user cleared every column". Editing a preset turns the table into Custom; an edit that
// lands back on the preset it came from is that preset again.
//
// Embedded in a dialog (the draft room opens a player page that way), the URL belongs to
// the page behind it, so the same state lives in component state instead.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CUSTOM_TAB,
  LEADERBOARD_TABS,
  customSections,
  hasPreset,
  parseColumns,
  poolColumns,
  presetSections,
} from "../constants/leaderboards";
import { presetPosition } from "../constants/playerPage";

const sameList = (a, b) => a.length === b.length && a.every((entry, index) => entry === b[index]);

/**
 * @param view      a `TABLE_VIEWS` entry: { key, defaultTab, exclude, presets? }, where
 *                  `presets[tab][position]` replaces the leaderboard's preset for that tab
 * @param position  the player's position
 * @param embedded  keep state out of the URL
 */
export function useTableView({ key, defaultTab, exclude, presets = {} }, position, embedded = false) {
  const group = presetPosition(position);
  const colsKey = `${key}_cols`;
  const [searchParams, setSearchParams] = useSearchParams();
  const [local, setLocal] = useState({ [key]: null, [colsKey]: null });
  // The preset a custom table started from, for "Reset to Usage".
  const [origin, setOrigin] = useState(defaultTab);

  const read = (name) => (embedded ? local[name] : searchParams.get(name));
  const write = (changes) => {
    if (embedded) {
      setLocal((current) => ({ ...current, ...changes }));
      return;
    }
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [name, value] of Object.entries(changes)) {
          if (value === null || value === undefined) next.delete(name);
          else next.set(name, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  const presetFor = (tab) =>
    (presets[tab]?.[group] ?? presetSections(group, tab) ?? [])
      .map((section) => ({ name: section.name, columns: section.columns.filter((id) => !exclude.includes(id)) }))
      .filter((section) => section.columns.length);
  const presetColumnsFor = (tab) => presetFor(tab).flatMap((section) => section.columns);

  const rawTab = read(key) ?? defaultTab;
  const tab = rawTab === CUSTOM_TAB.id || hasPreset(group, rawTab) ? rawTab : defaultTab;
  const isCustom = tab === CUSTOM_TAB.id;

  const rawCols = read(colsKey);
  const allowed = new Set(poolColumns(group).filter((id) => !exclude.includes(id)));
  const customColumns =
    rawCols === null ? presetColumnsFor(origin) : parseColumns(rawCols).filter((id) => allowed.has(id));

  const sections = isCustom ? customSections(group, customColumns, origin) : presetFor(tab);
  const columns = sections.flatMap((section) => section.columns);

  // A tab the defaults already imply stays out of the URL, like every other default.
  const tabParam = (value) => (value === defaultTab ? null : value);

  return {
    group,
    tab,
    isCustom,
    sections,
    columns,
    origin,
    exclude,
    customCount: rawCols === null ? 0 : parseColumns(rawCols).filter((id) => allowed.has(id)).length,
    originLabel: LEADERBOARD_TABS.find((entry) => entry.id === origin)?.label ?? "",
    selectTab(next) {
      if (next === CUSTOM_TAB.id) {
        // No custom table yet: start one from what is on screen.
        write({ [key]: CUSTOM_TAB.id, ...(rawCols === null ? { [colsKey]: columns.join(",") } : {}) });
        return rawCols === null;
      }
      setOrigin(next);
      write({ [key]: tabParam(next) });
      return false;
    },
    setColumns(next) {
      if (sameList(next, presetColumnsFor(origin))) write({ [key]: tabParam(origin), [colsKey]: null });
      else write({ [key]: CUSTOM_TAB.id, [colsKey]: next.join(",") });
    },
    reset() {
      write({ [key]: tabParam(origin), [colsKey]: null });
    },
  };
}
