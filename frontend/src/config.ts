/** Developer switch for unfinished or internal features. Off unless VITE_DEV_MODE=true. */
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

/** Live watch sync is hidden until accounts exist (see APP_PLAN.md). */
export const SYNC_ENABLED = false;

/** Sign-in and account screens. Off until the account flow is finished. */
export const ACCOUNTS_ENABLED = import.meta.env.VITE_ACCOUNTS_ENABLED === "true";
