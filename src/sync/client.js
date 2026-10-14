// The Supabase client, when this build is configured for it.
//
// Without VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (tests, a build
// for the static demo site) the app keeps its single-browser storage.
import { createClient } from "@supabase/supabase-js";

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const off =
  env.MODE === "test" ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("local"));

export const supabase =
  url && key && !off
    ? createClient(url, key, {
        auth: { persistSession: true, storageKey: "lab-supabase-auth" },
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null;

// Which gym this device belongs to until a person or screen says otherwise.
export const defaultLocation =
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("location")) ||
  env.VITE_LAB_LOCATION ||
  "pilot";
