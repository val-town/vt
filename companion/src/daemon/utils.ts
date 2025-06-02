/**
 * Normalizes a URL by returning its origin and pathname.
 *
 * @param url - The URL to normalize.
 * @returns The normalized URL, consisting of the origin and pathname.
 */
export function normalizeUrl(url: string) {
  const urlObj = new URL(url);
  return urlObj.origin + urlObj.pathname;
}
