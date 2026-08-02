/**
 * Loaders for the static JSON croco calc still ships, plus the GitHub release
 * feed behind the version-history modal.
 *
 * INV-118c deletes `utils/json-data.ts` because its reason for existing was the
 * language / layout / funbox loaders, all of which are cut. The supporters and
 * contributors lists (CP-148) and the release feed (version-history modal) are
 * kept, so they live here instead.
 */

//pin implementation
const fetch = window.fetch;

/**
 * Fetches JSON data from the specified URL using the fetch API.
 * @param url - The URL to fetch the JSON data from.
 * @returns A promise that resolves to the parsed JSON data.
 * @throws {Error} If the URL is not provided or if the fetch request fails.
 */
async function fetchJson<T>(url: string): Promise<T> {
  try {
    if (!url) throw new Error("No URL");
    const res = await fetch(url);
    if (res.ok) {
      if (!res.headers.get("content-type")?.startsWith("application/json")) {
        throw new Error("Content is not JSON");
      }
      return (await res.json()) as T;
    } else {
      throw new Error(`${res.status} ${res.statusText}`);
    }
  } catch (e) {
    console.error(`Error fetching JSON: ${url}`, e);
    throw e;
  }
}

/**
 * Memoizes an asynchronous function.
 * @template P   Cache key type
 * @template Args Function argument tuple
 * @template R   Resolved value of the Promise
 * @param fn The async function to memoize.
 * @param getKey Optional function to compute a cache key from the function arguments. If omitted, the first argument is used as the key.
 * @returns A memoized version of the async function with the same signature.
 */
export function memoizeAsync<P, Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  getKey?: (...args: Args) => P,
): (...args: Args) => Promise<R> {
  const cache = new Map<P, Promise<R>>();

  return async (...args: Args): Promise<R> => {
    const key = getKey ? getKey(...args) : (args[0] as P);

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Memoizes the fetchJson function to cache the results of fetch requests.
 * @param url - The URL used to fetch JSON data.
 * @returns A promise that resolves to the cached JSON data.
 */
export const cachedFetchJson = memoizeAsync(fetchJson);

/**
 * CP-148 — the supporters list backing the `top supporters` section. The file
 * ships as `[]` at launch, so the section renders empty rather than erroring.
 * @returns A promise that resolves to the list of supporters.
 */
export async function getSupportersList(): Promise<string[]> {
  return await fetchJson<string[]>("/supporters.json");
}

/**
 * CP-148 — the contributors list backing the `contributors` section.
 * @returns A promise that resolves to the list of contributors.
 */
export async function getContributorsList(): Promise<string[]> {
  return await fetchJson<string[]>("/contributors.json");
}

type GithubRelease = {
  html_url: string;
  id: number;
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  body: string;
};

/** The releases feed for the repository croco calc ships from. */
const RELEASES_API_URL =
  "https://api.github.com/repos/lxorb/croco-calc/releases";

/**
 * Fetches the latest release name from GitHub.
 * @returns A promise that resolves to the latest release name.
 */
export async function getLatestReleaseFromGitHub(): Promise<string> {
  type releaseType = { name: string };
  const releases = await cachedFetchJson<releaseType[]>(
    `${RELEASES_API_URL}?per_page=1`,
  );
  if (releases[0]?.name === undefined) {
    throw new Error("No release found");
  }
  return releases[0].name;
}

/**
 * Fetches the list of releases from GitHub.
 * @returns A promise that resolves to the list of releases.
 */
export async function getReleasesFromGitHub(options?: {
  page?: number;
}): Promise<GithubRelease[]> {
  return fetchJson(`${RELEASES_API_URL}?per_page=5&page=${options?.page ?? 1}`);
}
