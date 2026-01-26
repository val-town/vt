import { vtCheckCache } from "~/vt/VTCheckCache.ts";
import { AUTH_CACHE_LOCALSTORE_ENTRY } from "~/consts.ts";

/**
 * Clears the authentication cache, forcing the next authentication check
 * to validate credentials against the server instead of using cached state.
 */
export async function clearAuthCache(): Promise<void> {
  await vtCheckCache.setItem(AUTH_CACHE_LOCALSTORE_ENTRY, "");
}

/**
 * Sets the authentication cache to indicate credentials were just validated.
 * This prevents unnecessary API calls for a period defined by AUTH_CACHE_TTL.
 */
export async function setAuthCacheValid(): Promise<void> {
  await vtCheckCache.setAuthCheckedToNow();
}

/**
 * Gets the last time authentication was checked from the cache.
 * Returns undefined if never checked or cache was cleared.
 */
export async function getLastAuthCheck(): Promise<Date | undefined> {
  return await vtCheckCache.getAuthChecked();
}