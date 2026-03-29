/**
 * data-loader.js
 * Runtime fetch data loader.
 * All data files are fetched from the pointhuh-netizen/nov repository at runtime.
 */

const DATA_REPO = 'pointhuh-netizen/nov';
const DATA_BRANCH = 'main';
const DATA_BASE = `https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/sillytavern-style-engine`;

/** In-memory cache: path → parsed JSON */
const _cache = new Map();

/**
 * Persist a successful response to localStorage so it can be used offline.
 * @param {string} path
 * @param {*} data
 */
function _persistToLocalStorage(path, data) {
    try {
        localStorage.setItem(`sse-cache-${path}`, JSON.stringify(data));
    } catch (e) {
        // localStorage may be full or unavailable — silently ignore
    }
}

/**
 * Attempt to restore a previously cached response from localStorage.
 * @param {string} path
 * @returns {*|null} Parsed JSON or null if not found.
 */
function _restoreFromLocalStorage(path) {
    try {
        const raw = localStorage.getItem(`sse-cache-${path}`);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Fetch a JSON file relative to DATA_BASE.
 * Results are cached in memory; successful fetches are also persisted to localStorage.
 * On network failure the function tries to fall back to the localStorage copy.
 *
 * @param {string} relativePath  e.g. "/meta/catalog.json"
 * @returns {Promise<*>} Parsed JSON data.
 */
export async function fetchJSON(relativePath) {
    if (_cache.has(relativePath)) {
        return _cache.get(relativePath);
    }

    const url = `${DATA_BASE}${relativePath}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const data = await response.json();
        _cache.set(relativePath, data);
        _persistToLocalStorage(relativePath, data);
        return data;
    } catch (err) {
        console.warn(`[StyleEngine] fetch failed for ${relativePath}:`, err);
        const fallback = _restoreFromLocalStorage(relativePath);
        if (fallback !== null) {
            console.warn(`[StyleEngine] Using localStorage fallback for ${relativePath}`);
            _cache.set(relativePath, fallback);
            return fallback;
        }
        throw new Error(`[StyleEngine] Could not load ${relativePath}: ${err.message}`);
    }
}

/** Load meta/catalog.json */
export async function loadCatalog() {
    return fetchJSON('/meta/catalog.json');
}

/**
 * Load an axis definition file.
 * @param {string} axisFileName  e.g. "axis-a-pov.json"
 */
export async function loadAxis(axisFileName) {
    return fetchJSON(`/axes/${axisFileName}`);
}

/**
 * Load a config file.
 * @param {string} configFileName  e.g. "user-character-control.json"
 */
export async function loadConfig(configFileName) {
    return fetchJSON(`/configs/${configFileName}`);
}

/** Load core/default-template.json */
export async function loadTemplate() {
    return fetchJSON('/core/default-template.json');
}

/** Load core/master-rules.json */
export async function loadMasterRules() {
    return fetchJSON('/core/master-rules.json');
}

/** Load meta/trait-schema.json */
export async function loadTraitSchema() {
    return fetchJSON('/meta/trait-schema.json');
}

/** Load meta/combinations.json */
export async function loadCombinations() {
    return fetchJSON('/meta/combinations.json');
}

/** Clear the in-memory cache (does not touch localStorage). */
export function clearCache() {
    _cache.clear();
}
