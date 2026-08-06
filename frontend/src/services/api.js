// Shared axios instance. All API calls go through the services layer — never
// call axios/fetch directly from components.
import axios from "axios";
import { getAccessToken } from "./supabase";

const baseURL = `${import.meta.env.VITE_API_BASE_URL}/api/v1`;

export const api = axios.create({ baseURL });

// Attach the Supabase access token when there is one. Every public endpoint works
// without it — the header simply makes /me endpoints resolvable and lets a public
// endpoint personalise if it ever wants to. getAccessToken reads the client's cached
// session and refreshes it when expired, so this never blocks on the network in the
// common case.
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
