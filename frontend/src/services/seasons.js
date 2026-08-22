// Seasons API call. The backend (/seasons) is the source of truth for which
// seasons hold data and which one is current — see the note in useSeasons.
import { api } from "./api";

export async function getSeasons() {
  const { data } = await api.get("/seasons");
  return data;
}
