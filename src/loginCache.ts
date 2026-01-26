import { vtCheckCache } from "~/vt/VTCheckCache.ts";
import { AUTH_CACHE_LOCALSTORE_ENTRY } from "~/consts.ts";

export async function clearAuthCache(): Promise<void> {
  await vtCheckCache.setItem(AUTH_CACHE_LOCALSTORE_ENTRY, "");
}

export async function setAuthCacheValid(): Promise<void> {
  await vtCheckCache.setAuthCheckedToNow();
}

export async function getLastAuthCheck(): Promise<Date | undefined> {
  return await vtCheckCache.getAuthChecked();
}
