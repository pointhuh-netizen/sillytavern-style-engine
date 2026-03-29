/**
 * build-engine.js
 * Assembles the final prompt string from a selections object by applying
 * each module's operations/injections onto the default template.
 */

import { loadCatalog, loadAxis, loadConfig, loadTemplate, loadMasterRules } from './data-loader.js';

/**
 * Build order as defined in default-template.json.
 * W axis is appended after G because the template build_order may not list it.
 */
const AXIS_BUILD_ORDER = ['A', 'S', 'B', 'C', 'D', 'E', 'F', 'G', 'W'];

/**
 * Axes whose selection must be a single string (mutex).
 */
const MUTEX_AXES = new Set(['A', 'S', 'B', 'W']);

/**
 * Apply a single operation to the slots map.
 * @param {Object} slots  Mutable map of slotId → current value string.
 * @param {Object} op     Operation descriptor {slot, mode, value}.
 */
function applyOperation(slots, op) {
    const { slot, mode, value } = op;
    if (!slot || value === undefined) return;

    const current = slots[slot] ?? '';
    switch ((mode ?? 'REPLACE').toUpperCase()) {
        case 'REPLACE':
            slots[slot] = value;
            break;
        case 'APPEND':
            slots[slot] = current ? `${current}\n${value}` : value;
            break;
        case 'PREPEND':
            slots[slot] = current ? `${value}\n${current}` : value;
            break;
        default:
            slots[slot] = value;
    }
}

/**
 * Resolve the file name for an axis from the catalog.
 * @param {Object} catalog
 * @param {string} axisKey  e.g. "A"
 * @returns {string|null}   e.g. "axis-a-pov.json"
 */
function resolveAxisFile(catalog, axisKey) {
    // catalog.axes[key] doesn't store a file — we derive it from module entries.
    // Alternatively catalog modules list includes file per module, but the axis
    // file names follow the pattern: axis-{key.toLowerCase()}-{slug}.json
    // We look for a module whose axis matches to get the file from there.
    const allModules = catalog.modules ?? [];
    const found = allModules.find(m => m.axis === axisKey);
    if (found?.file) {
        // file is like "axes/axis-a-pov.json" — strip the "axes/" prefix
        return found.file.replace(/^axes\//, '');
    }
    return null;
}

/**
 * Load all module data for the given selections by fetching axis/config files.
 * Returns an array of module objects in build order.
 *
 * @param {Object} catalog
 * @param {Object} selections  { configs: {...}, axes: {...} }
 * @returns {Promise<Array<{source: string, module: Object}>>}
 */
async function resolveModules(catalog, selections) {
    const resolved = [];

    // ---- configs ----
    const configEntries = catalog.configs ?? [];
    for (const cfgMeta of configEntries) {
        const selectedModeId = selections.configs?.[cfgMeta.id];
        if (!selectedModeId) continue;

        const configData = await loadConfig(cfgMeta.file.replace(/^configs\//, ''));
        const mode = (configData.modes ?? []).find(m => m.id === selectedModeId);
        if (mode) {
            resolved.push({ source: `config:${cfgMeta.id}`, module: mode });
        }
    }

    // ---- axes (in build order) ----
    for (const axisKey of AXIS_BUILD_ORDER) {
        const selection = selections.axes?.[axisKey];
        if (!selection) continue;

        const selectedIds = Array.isArray(selection) ? selection : [selection];
        if (selectedIds.length === 0) continue;

        // Derive axis file name from catalog modules or known pattern
        const axisFileName = resolveAxisFile(catalog, axisKey)
            ?? deriveAxisFileName(axisKey);

        let axisData;
        try {
            axisData = await loadAxis(axisFileName);
        } catch (e) {
            console.warn(`[StyleEngine] Could not load axis file ${axisFileName}:`, e);
            continue;
        }

        const axisModules = axisData.modules ?? [];

        for (const moduleId of selectedIds) {
            const mod = axisModules.find(m => m.id === moduleId);
            if (mod) {
                resolved.push({ source: `axis:${axisKey}`, module: mod });
            } else {
                console.warn(`[StyleEngine] Module ${moduleId} not found in ${axisFileName}`);
            }
        }
    }

    return resolved;
}

/**
 * Derive the axis file name from the axis key using the known naming convention.
 * NOTE: This map must stay in sync with the file naming in pointhuh-netizen/nov.
 * If an axis file is renamed, update this map accordingly.
 * @param {string} axisKey
 * @returns {string}
 */
function deriveAxisFileName(axisKey) {
    const slugMap = {
        A: 'pov',
        S: 'narration',
        B: 'tone',
        C: 'genre',
        D: 'mood',
        E: 'setting',
        F: 'special',
        G: 'interaction',
        W: 'world',
    };
    const slug = slugMap[axisKey] ?? axisKey.toLowerCase();
    return `axis-${axisKey.toLowerCase()}-${slug}.json`;
}

/**
 * Render a module block by substituting slot values into template text.
 * @param {Object} moduleBlock  Template module definition (has title, static, slots).
 * @param {Object} slots        Current slot value map.
 * @returns {string}
 */
function renderModuleBlock(moduleBlock, slots) {
    const lines = [];
    if (moduleBlock.title) {
        const subtitle = moduleBlock.subtitle ? ` — ${moduleBlock.subtitle}` : '';
        lines.push(`## ${moduleBlock.title}${subtitle}`);
    }

    // static sentences
    for (const sentence of moduleBlock.static ?? []) {
        lines.push(sentence);
    }

    // slots
    for (const [slotId, slotDef] of Object.entries(moduleBlock.slots ?? {})) {
        const value = slots[slotId] ?? slotDef.default ?? '';
        if (value) {
            lines.push(`[${slotDef.label ?? slotId}] ${value}`);
        }
    }

    return lines.join('\n');
}

/**
 * Build the final prompt string from a selections object.
 *
 * @param {Object} selections
 *   {
 *     configs: { user_character_control: "UCC-01", nsfw_rating: "NSFW-02" },
 *     axes: { A: "A-03", S: "S-00", B: "B-02", C: ["C-01","C-03"], ... }
 *   }
 * @returns {Promise<string>} The assembled prompt text.
 */
export async function buildPrompt(selections) {
    const [catalog, template, masterRules] = await Promise.all([
        loadCatalog(),
        loadTemplate(),
        loadMasterRules(),
    ]);

    // Deep-clone the template slots so we can mutate without affecting the cache
    const slots = {};
    for (const [moduleKey, moduleDef] of Object.entries(template.modules ?? {})) {
        for (const [slotId, slotDef] of Object.entries(moduleDef.slots ?? {})) {
            slots[slotId] = slotDef.default ?? '';
        }
    }

    // Also collect mutable copies of static arrays and check lists
    const moduleStatics = {};
    for (const [moduleKey, moduleDef] of Object.entries(template.modules ?? {})) {
        moduleStatics[moduleKey] = [...(moduleDef.static ?? [])];
    }
    const selfCheckList = [...(template.self_check_list ?? [])];

    // Resolve all selected modules
    const resolvedModules = await resolveModules(catalog, selections);

    // Apply operations, injections, check_operations
    for (const { source, module: mod } of resolvedModules) {
        // operations → slots
        for (const op of mod.operations ?? []) {
            applyOperation(slots, op);
        }

        // injections → add sentences to the appropriate template module static block
        for (const inj of mod.injections ?? []) {
            const targetModule = inj.module ?? inj.target_module;
            const text = inj.text ?? inj.content;
            if (targetModule && text) {
                if (!moduleStatics[targetModule]) {
                    moduleStatics[targetModule] = [];
                }
                moduleStatics[targetModule].push(text);
            }
        }

        // check_operations → self_check_list
        for (const check of mod.check_operations ?? []) {
            const text = check.text ?? check.rule ?? check.content;
            if (text) {
                selfCheckList.push(text);
            }
        }
    }

    // Render preamble
    const preambleLines = [];
    const preamble = template.preamble ?? {};
    if (preamble.title) {
        preambleLines.push(`# ${preamble.title}`);
    }
    for (const [key, def] of Object.entries(preamble)) {
        if (key === 'title') continue;
        const value = typeof def === 'object' && def.id
            ? (slots[def.id] ?? def.default ?? '')
            : String(def);
        if (value) {
            preambleLines.push(value);
        }
    }

    // Render template modules
    const moduleLines = [];
    for (const [moduleKey, moduleDef] of Object.entries(template.modules ?? {})) {
        const overriddenDef = {
            ...moduleDef,
            static: moduleStatics[moduleKey] ?? moduleDef.static ?? [],
        };
        moduleLines.push(renderModuleBlock(overriddenDef, slots));
    }

    // Render master rules
    const masterRuleLines = [];
    for (const section of masterRules.sections ?? []) {
        if (section.title) {
            masterRuleLines.push(`\n## ${section.title}`);
        }
        for (const rule of section.rules ?? []) {
            masterRuleLines.push(`- ${rule}`);
        }
        if (section.content) {
            masterRuleLines.push(section.content);
        }
    }

    // Render self check list
    const checkLines = [];
    if (selfCheckList.length > 0) {
        checkLines.push('\n## SELF CHECK');
        for (const item of selfCheckList) {
            checkLines.push(`- ${item}`);
        }
    }

    return [
        preambleLines.join('\n'),
        '',
        moduleLines.join('\n\n'),
        masterRuleLines.join('\n'),
        checkLines.join('\n'),
    ].join('\n').trim();
}
