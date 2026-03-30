/**
 * data-loader.js
 * JSON 데이터 로드 및 캐싱 모듈.
 * catalog.json을 기준으로 모든 축/config/meta 데이터를 동적으로 로드한다.
 */

const EXTENSION_NAME = 'sillytavern-style-engine';

// 감지된 확장 루트 경로 캐시
let _extensionRoot = null;

/**
 * 확장 루트 경로를 외부에서 사전 설정 (popup-standalone.html 등 자기 URL을 아는 경우).
 * @param {string} root - 'extensions/sillytavern-style-engine' 형태의 경로
 */
export function setExtensionRoot(root) {
    _extensionRoot = root;
}

/**
 * 확장 루트 경로 자동 감지.
 * 신규 경로(extensions/<name>) 우선, 실패 시 구버전(scripts/extensions/third-party/<name>) 폴백.
 * 감지 결과는 캐시되어 이후 호출 시 재사용된다.
 * @returns {Promise<string>}
 */
export async function getExtensionRoot() {
    if (_extensionRoot) return _extensionRoot;

    const newPath = `extensions/${EXTENSION_NAME}`;
    const oldPath = `scripts/extensions/third-party/${EXTENSION_NAME}`;

    // 신규 경로 시도
    try {
        const res = await fetch(`/${newPath}/manifest.json`, { method: 'HEAD' });
        if (res.ok) {
            _extensionRoot = newPath;
            return _extensionRoot;
        }
    } catch {
        // 신규 경로 불가 — 구버전 경로로 폴백
    }

    _extensionRoot = oldPath;
    return _extensionRoot;
}

// 캐시 저장소
const _cache = {};

/**
 * 파일을 fetch하여 JSON으로 파싱. 캐싱 적용.
 * @param {string} relativePath - 확장 루트로부터의 상대경로
 * @returns {Promise<Object>}
 */
async function loadJSON(relativePath) {
    if (_cache[relativePath]) {
        return _cache[relativePath];
    }
    const root = await getExtensionRoot();
    const url = `/${root}/${relativePath}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`[StyleEngine] Failed to load ${url}: ${response.status}`);
    }
    const data = await response.json();
    _cache[relativePath] = data;
    return data;
}

/**
 * 축 파일 경로 매핑. catalog.json에 파일 경로가 없는 경우 여기서 파생.
 * 축 JSON이 추가될 경우 이 맵에도 추가 필요.
 */
const AXIS_FILE_MAP = {
    'A': 'axes/axis-a-pov.json',
    'S': 'axes/axis-s-narration.json',
    'B': 'axes/axis-b-tone.json',
    'C': 'axes/axis-c-genre.json',
    'D': 'axes/axis-d-mood.json',
    'E': 'axes/axis-e-setting.json',
    'F': 'axes/axis-f-special.json',
    'G': 'axes/axis-g-interaction.json',
    'W': 'axes/axis-w-world.json',
};

/**
 * catalog.json 로드
 * @returns {Promise<Object>}
 */
export async function loadCatalog() {
    return loadJSON('meta/catalog.json');
}

/**
 * 특정 축의 JSON 데이터 로드
 * @param {string} axisKey - 축 키 (예: 'A', 'S', ...)
 * @returns {Promise<Object>}
 */
export async function loadAxis(axisKey) {
    const filePath = AXIS_FILE_MAP[axisKey];
    if (!filePath) {
        throw new Error(`[StyleEngine] Unknown axis key: ${axisKey}`);
    }
    return loadJSON(filePath);
}

/**
 * 특정 config JSON 로드
 * @param {string} filePath - catalog.json의 file 필드값
 * @returns {Promise<Object>}
 */
export async function loadConfig(filePath) {
    return loadJSON(filePath);
}

/**
 * 모든 축 데이터를 로드하여 맵으로 반환
 * @returns {Promise<Object>} { 'A': axisData, 'S': axisData, ... }
 */
export async function loadAllAxes() {
    const catalog = await loadCatalog();
    const axisKeys = Object.keys(catalog.axes);
    const results = {};
    await Promise.all(
        axisKeys.map(async (key) => {
            try {
                results[key] = await loadAxis(key);
            } catch (e) {
                console.warn(`[StyleEngine] Could not load axis ${key}:`, e);
            }
        })
    );
    return results;
}

/**
 * 모든 config 데이터를 로드하여 맵으로 반환
 * @returns {Promise<Object>} { 'user_character_control': configData, ... }
 */
export async function loadAllConfigs() {
    const catalog = await loadCatalog();
    const results = {};
    await Promise.all(
        catalog.configs.map(async (cfg) => {
            try {
                results[cfg.id] = await loadConfig(cfg.file);
            } catch (e) {
                console.warn(`[StyleEngine] Could not load config ${cfg.id}:`, e);
            }
        })
    );
    return results;
}

/**
 * combinations.json 로드
 * @returns {Promise<Object>}
 */
export async function loadCombinations() {
    return loadJSON('meta/combinations.json');
}

/**
 * trait-schema.json 로드
 * @returns {Promise<Object>}
 */
export async function loadTraitSchema() {
    return loadJSON('meta/trait-schema.json');
}

/**
 * default-template.json 로드
 * @returns {Promise<Object>}
 */
export async function loadDefaultTemplate() {
    return loadJSON('core/default-template.json');
}

/**
 * master-rules.json 로드
 * @returns {Promise<Object>}
 */
export async function loadMasterRules() {
    return loadJSON('core/master-rules.json');
}

/**
 * 전체 데이터를 한번에 로드
 * @returns {Promise<Object>}
 */
export async function loadAll() {
    const [catalog, axes, configs, combinations, traitSchema, defaultTemplate, masterRules] =
        await Promise.all([
            loadCatalog(),
            loadAllAxes(),
            loadAllConfigs(),
            loadCombinations(),
            loadTraitSchema(),
            loadDefaultTemplate(),
            loadMasterRules(),
        ]);
    return { catalog, axes, configs, combinations, traitSchema, defaultTemplate, masterRules };
}

/**
 * 캐시 초기화 (테스트/리로드용)
 */
export function clearCache() {
    Object.keys(_cache).forEach((k) => delete _cache[k]);
}
