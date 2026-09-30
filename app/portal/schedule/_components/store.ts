// The schedule page's own copy of the season, updated from what each save
// returns, so a click in the grid shows at once without re-rendering the
// page. Fresh data from the server (a column added in Season settings, an
// import) starts it over.

import { opponentKey } from "../../../../lib/hs-schedule/logic";
import type { HsGames, HsLevel, HsOpponent, HsWeekend } from "../../../../lib/hs-schedule/types";

export interface ScheduleState {
  levels: HsLevel[];
  weekends: HsWeekend[];
  games: HsGames[];
  opponents: HsOpponent[];
}

export type ScheduleAction =
  | { type: "reset"; state: ScheduleState }
  | { type: "games"; weekendId: string; levelId: string; row: HsGames | null }
  | { type: "opponent"; row: HsOpponent }
  | { type: "opponentGone"; id: string }
  // All of one program's rows on a weekend, as they are now.
  | { type: "program"; weekendId: string; key: string; rows: HsOpponent[] }
  | { type: "weekend"; row: HsWeekend }
  | { type: "weekendGone"; id: string };

export function scheduleReducer(state: ScheduleState, a: ScheduleAction): ScheduleState {
  switch (a.type) {
    case "reset":
      return a.state;
    case "games": {
      const rest = state.games.filter((g) => !(g.weekend_id === a.weekendId && g.level_id === a.levelId));
      return { ...state, games: a.row ? [...rest, a.row] : rest };
    }
    case "opponent": {
      const exists = state.opponents.some((o) => o.id === a.row.id);
      return {
        ...state,
        opponents: exists ? state.opponents.map((o) => (o.id === a.row.id ? a.row : o)) : [...state.opponents, a.row],
      };
    }
    case "opponentGone":
      return { ...state, opponents: state.opponents.filter((o) => o.id !== a.id) };
    case "program":
      return {
        ...state,
        opponents: [
          ...state.opponents.filter((o) => !(o.weekend_id === a.weekendId && opponentKey(o) === a.key)),
          ...a.rows,
        ],
      };
    case "weekend": {
      const exists = state.weekends.some((w) => w.id === a.row.id);
      return {
        ...state,
        weekends: exists ? state.weekends.map((w) => (w.id === a.row.id ? a.row : w)) : [...state.weekends, a.row],
      };
    }
    case "weekendGone":
      return {
        ...state,
        weekends: state.weekends.filter((w) => w.id !== a.id),
        games: state.games.filter((g) => g.weekend_id !== a.id),
        opponents: state.opponents.filter((o) => o.weekend_id !== a.id),
      };
  }
}
