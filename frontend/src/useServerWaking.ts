import { useSyncExternalStore } from "react";
import { isServerSlow, subscribeServerSlow } from "./api";

/** True while a request has been waiting long enough that the server is probably waking up. */
export function useServerWaking(): boolean {
  return useSyncExternalStore(subscribeServerSlow, isServerSlow);
}
