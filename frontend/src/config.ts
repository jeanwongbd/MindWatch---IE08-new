/** Developer switch for unfinished or internal features. Off unless VITE_DEV_MODE=true. */
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

/** Live watch sync is hidden until accounts exist (see APP_PLAN.md). */
export const SYNC_ENABLED = false;
