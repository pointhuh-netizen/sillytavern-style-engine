/**
 * ui-controller.js
 * Manages the extension UI: rendering axis/config selectors, handling selection
 * changes, conflict display, preview, and preset management.
 */

import { loadCatalog, loadAxis, loadConfig } from './data-loader.js';
import { buildPrompt } from './build-engine.js';
import { detectConflicts } from './conflict-detector.js';

/** SillyTavern extension name used for extension_settings key. */
const EXT_NAME = 'style-engine';

/** Current selections state. */
let _selections = {
    configs: {},
    axes: {},
};

/** Cached catalog data. */
let _catalog = null;

/** SillyTavern's getContext — injected or polyfilled. */
function getContext() {
    return window.SillyTavern?.getContext?.() ?? {};
}

/**
 * Persist selections to extension_settings (SillyTavern) and localStorage.
 */
function persistSelections() {
    try {
        const ctx = getContext();
        if (ctx.extensionSettings) {
            ctx.extensionSettings[EXT_NAME] = ctx.extensionSettings[EXT_NAME] ?? {};
            ctx.extensionSettings[EXT_NAME].selections = _selections;
            ctx.saveSettingsDebounced?.();
        }
    } catch (e) {
        // SillyTavern API not available — silently ignore
    }
    try {
        localStorage.setItem(`sse-selections`, JSON.stringify(_selections));
    } catch (e) {
        // ignore
    }
}

/**
 * Load persisted selections from extension_settings or localStorage.
 */
function loadPersistedSelections() {
    try {
        const ctx = getContext();
        const saved = ctx.extensionSettings?.[EXT_NAME]?.selections;
        if (saved) {
            _selections = saved;
            return;
        }
    } catch (e) {
        // ignore
    }
    try {
        const raw = localStorage.getItem('sse-selections');
        if (raw) _selections = JSON.parse(raw);
    } catch (e) {
        // ignore
    }
}

/**
 * Render a config selector (mutex mode list).
 *
 * @param {Object} cfgMeta  Catalog config entry.
 * @param {HTMLElement} container
 */
async function renderConfigSelector(cfgMeta, container) {
    let configData;
    try {
        configData = await loadConfig(cfgMeta.file.replace(/^configs\//, ''));
    } catch (e) {
        container.innerHTML += `<p class="sse-error">⚠️ ${cfgMeta.name_ko} 로드 실패</p>`;
        return;
    }

    const section = document.createElement('div');
    section.className = 'sse-config-section';
    section.innerHTML = `<h4 class="sse-section-title">${cfgMeta.icon ?? ''} ${cfgMeta.name_ko}</h4>`;

    const select = document.createElement('select');
    select.className = 'sse-select';
    select.dataset.configId = cfgMeta.id;

    // "선택 안 함" option
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— 선택 안 함 —';
    select.appendChild(noneOpt);

    for (const mode of configData.modes ?? []) {
        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.textContent = `${mode.id} ${mode.name ?? ''}`;
        opt.title = mode.one_liner ?? '';
        if ((_selections.configs[cfgMeta.id] ?? '') === mode.id) {
            opt.selected = true;
        }
        select.appendChild(opt);
    }

    select.addEventListener('change', () => {
        _selections.configs[cfgMeta.id] = select.value || undefined;
        onSelectionChange();
    });

    section.appendChild(select);
    container.appendChild(section);
}

/**
 * Render an axis selector.
 * Mutex axes → radio buttons; combinable axes → checkboxes.
 *
 * @param {string} axisKey  e.g. "A"
 * @param {Object} axisMeta  Catalog axes entry.
 * @param {HTMLElement} container
 */
async function renderAxisSelector(axisKey, axisMeta, container) {
    // Derive axis file name
    const axisModuleMeta = (_catalog.modules ?? []).find(m => m.axis === axisKey);
    const rawFile = axisModuleMeta?.file ?? `axes/axis-${axisKey.toLowerCase()}.json`;
    const axisFileName = rawFile.replace(/^axes\//, '');

    let axisData;
    try {
        axisData = await loadAxis(axisFileName);
    } catch (e) {
        container.innerHTML += `<p class="sse-error">⚠️ ${axisMeta.name_ko}(${axisKey}) 로드 실패</p>`;
        return;
    }

    const isMutex = axisMeta.type === 'mutex';
    const section = document.createElement('div');
    section.className = `sse-axis-section sse-axis-${axisKey.toLowerCase()}`;
    section.dataset.axisKey = axisKey;

    const header = document.createElement('h4');
    header.className = 'sse-section-title';
    header.textContent = `${axisMeta.icon ?? ''} ${axisMeta.name_ko} (${axisKey})`;
    if (axisMeta.ui_description) {
        header.title = axisMeta.ui_description;
    }
    section.appendChild(header);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'sse-axis-controls';
    const inputType = isMutex ? 'radio' : 'checkbox';
    const groupName = `sse-axis-${axisKey}`;

    // "없음" option for mutex axes
    if (isMutex) {
        const label = _buildInputLabel(inputType, groupName, `${axisKey}-none`, '— 없음 —', '',
            !_selections.axes[axisKey]);
        controlsDiv.appendChild(label);
    }

    for (const mod of axisData.modules ?? []) {
        const isChecked = isMutex
            ? _selections.axes[axisKey] === mod.id
            : (Array.isArray(_selections.axes[axisKey]) && _selections.axes[axisKey].includes(mod.id));

        const labelEl = _buildInputLabel(inputType, groupName, mod.id,
            `${mod.id} ${mod.name ?? ''}`, mod.one_liner ?? '', isChecked);
        controlsDiv.appendChild(labelEl);
    }

    controlsDiv.addEventListener('change', () => {
        if (isMutex) {
            const checked = controlsDiv.querySelector(`input[name="${groupName}"]:checked`);
            const val = checked?.value;
            _selections.axes[axisKey] = (val && val !== `${axisKey}-none`) ? val : undefined;
        } else {
            const checked = [...controlsDiv.querySelectorAll(`input[name="${groupName}"]:checked`)];
            _selections.axes[axisKey] = checked.map(el => el.value).filter(Boolean);
        }
        onSelectionChange();
    });

    section.appendChild(controlsDiv);
    container.appendChild(section);
}

/**
 * Build an <label><input ...> text</label> element.
 */
function _buildInputLabel(type, name, value, text, titleText, checked) {
    const label = document.createElement('label');
    label.className = 'sse-option-label';
    label.title = titleText;

    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = value;
    input.checked = !!checked;

    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + text));
    return label;
}

/**
 * Called whenever a selection changes.
 * Runs conflict detection and updates the conflict warning area.
 */
async function onSelectionChange() {
    persistSelections();

    const warningEl = document.getElementById('sse-conflict-warnings');
    if (!warningEl) return;

    try {
        const { conflicts, warnings } = await detectConflicts(_selections);
        const allIssues = [...conflicts, ...warnings];
        if (allIssues.length === 0) {
            warningEl.innerHTML = '';
            warningEl.style.display = 'none';
        } else {
            warningEl.style.display = 'block';
            warningEl.innerHTML = allIssues.map(issue => {
                const modules = (issue.modules ?? []).map(m => m.id ?? m).join(', ');
                return `<div class="sse-conflict-item">⚠️ ${issue.description ?? issue.trait}: ${modules}</div>`;
            }).join('');
        }
    } catch (e) {
        console.warn('[StyleEngine] Conflict detection failed:', e);
    }
}

/**
 * Show a preview of the built prompt in the popup.
 */
export async function showPreview() {
    const popup = document.getElementById('sse-preview-popup');
    const textarea = document.getElementById('sse-preview-text');
    if (!popup || !textarea) return;

    textarea.value = '빌드 중…';
    popup.style.display = 'flex';

    try {
        const prompt = await buildPrompt(_selections);
        textarea.value = prompt;
    } catch (e) {
        textarea.value = `오류: ${e.message}`;
    }
}

/**
 * Apply the built prompt to SillyTavern's system prompt.
 */
export async function applyToChat() {
    try {
        const prompt = await buildPrompt(_selections);
        const ctx = getContext();

        if (ctx.setExtensionPrompt) {
            ctx.setExtensionPrompt(EXT_NAME, prompt, 1, 0);
            toastr?.success?.('스타일 엔진 프롬프트가 적용되었습니다.');
        } else if (ctx.extensionSettings) {
            // Fallback: store in extension settings for manual use
            ctx.extensionSettings[EXT_NAME] = ctx.extensionSettings[EXT_NAME] ?? {};
            ctx.extensionSettings[EXT_NAME].lastPrompt = prompt;
            ctx.saveSettingsDebounced?.();
            toastr?.info?.('프롬프트가 저장되었습니다. SillyTavern API를 찾지 못해 직접 적용이 불가합니다.');
        } else {
            toastr?.warning?.('SillyTavern 컨텍스트를 찾을 수 없습니다.');
        }
    } catch (e) {
        toastr?.error?.(`적용 실패: ${e.message}`);
    }
}

/**
 * Save current selections as a named preset to localStorage.
 * @param {string} name
 */
export function savePreset(name) {
    if (!name) return;
    try {
        const presets = _loadPresetMap();
        presets[name] = JSON.parse(JSON.stringify(_selections));
        localStorage.setItem('sse-presets', JSON.stringify(presets));
        return true;
    } catch (e) {
        console.error('[StyleEngine] savePreset failed:', e);
        return false;
    }
}

/**
 * Load a named preset from localStorage and apply it.
 * @param {string} name
 */
export function loadPreset(name) {
    try {
        const presets = _loadPresetMap();
        if (presets[name]) {
            _selections = presets[name];
            persistSelections();
            return true;
        }
    } catch (e) {
        console.error('[StyleEngine] loadPreset failed:', e);
    }
    return false;
}

/** Return the map of saved presets from localStorage. */
function _loadPresetMap() {
    try {
        const raw = localStorage.getItem('sse-presets');
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

/** Return a list of saved preset names. */
export function listPresets() {
    return Object.keys(_loadPresetMap());
}

/**
 * Initialize the extension UI.
 * Should be called from index.js after DOM is ready.
 *
 * @param {HTMLElement} settingsRoot  The root element of settings.html content.
 */
/**
 * Render config and axis selectors into the settings panel.
 * Clears existing content first so it is safe to call multiple times.
 * Requires _catalog to already be loaded.
 * @param {HTMLElement} settingsRoot
 */
async function _renderSelectors(settingsRoot) {
    const configContainer = settingsRoot.querySelector('#sse-config-selectors');
    const axisContainer = settingsRoot.querySelector('#sse-axis-selectors');

    // Render config selectors
    if (configContainer) {
        configContainer.innerHTML = '';
        for (const cfgMeta of _catalog.configs ?? []) {
            await renderConfigSelector(cfgMeta, configContainer);
        }
    }

    // Render axis selectors
    if (axisContainer) {
        axisContainer.innerHTML = '';
        for (const [axisKey, axisMeta] of Object.entries(_catalog.axes ?? {})) {
            await renderAxisSelector(axisKey, axisMeta, axisContainer);
        }
    }
}

export async function init(settingsRoot) {
    loadPersistedSelections();

    const loadingEl = settingsRoot.querySelector('#sse-loading');
    const errorEl = settingsRoot.querySelector('#sse-error');
    const contentEl = settingsRoot.querySelector('#sse-content');

    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
        _catalog = await loadCatalog();
    } catch (e) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            errorEl.textContent = `데이터 로드 실패: ${e.message}`;
            errorEl.style.display = 'block';
        }
        return;
    }

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    await _renderSelectors(settingsRoot);

    // Bind preset UI
    const savePresetBtn = settingsRoot.querySelector('#sse-save-preset-btn');
    const loadPresetBtn = settingsRoot.querySelector('#sse-load-preset-btn');
    const presetNameInput = settingsRoot.querySelector('#sse-preset-name');
    const presetSelect = settingsRoot.querySelector('#sse-preset-select');

    function refreshPresetSelect() {
        if (!presetSelect) return;
        presetSelect.innerHTML = '';
        const names = listPresets();
        if (names.length === 0) {
            presetSelect.innerHTML = '<option value="">— 저장된 프리셋 없음 —</option>';
        } else {
            for (const n of names) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                presetSelect.appendChild(opt);
            }
        }
    }
    refreshPresetSelect();

    savePresetBtn?.addEventListener('click', () => {
        const name = presetNameInput?.value?.trim();
        if (!name) { toastr?.warning?.('프리셋 이름을 입력하세요.'); return; }
        if (savePreset(name)) {
            toastr?.success?.(`프리셋 "${name}" 저장 완료`);
            refreshPresetSelect();
        }
    });

    loadPresetBtn?.addEventListener('click', () => {
        const name = presetSelect?.value;
        if (!name) { toastr?.warning?.('불러올 프리셋을 선택하세요.'); return; }
        if (loadPreset(name)) {
            // Re-render selectors to reflect loaded selections by clearing and re-initialising
            const configContainer = settingsRoot.querySelector('#sse-config-selectors');
            const axisContainer = settingsRoot.querySelector('#sse-axis-selectors');
            if (configContainer) configContainer.innerHTML = '';
            if (axisContainer) axisContainer.innerHTML = '';
            _renderSelectors(settingsRoot).then(() => {
                toastr?.success?.(`프리셋 "${name}" 로드 완료`);
            });
        }
    });

    // Bind preview button
    const previewBtn = settingsRoot.querySelector('#sse-preview-btn');
    previewBtn?.addEventListener('click', showPreview);

    // Bind popup close / copy / apply buttons
    const closePopupBtn = document.getElementById('sse-popup-close');
    const copyBtn = document.getElementById('sse-copy-btn');
    const applyBtn = document.getElementById('sse-apply-btn');

    closePopupBtn?.addEventListener('click', () => {
        const popup = document.getElementById('sse-preview-popup');
        if (popup) popup.style.display = 'none';
    });

    copyBtn?.addEventListener('click', () => {
        const textarea = document.getElementById('sse-preview-text');
        if (textarea) {
            navigator.clipboard.writeText(textarea.value).then(() => {
                toastr?.success?.('클립보드에 복사되었습니다.');
            });
        }
    });

    applyBtn?.addEventListener('click', applyToChat);
}
