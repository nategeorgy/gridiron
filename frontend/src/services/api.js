// Shared axios instance. All API calls go through the services layer — never
// call axios/fetch directly from components.
import axios from "axios";

const baseURL = `${import.meta.env.VITE_API_BASE_URL}/api/v1`;

export const api = axios.create({ baseURL });
