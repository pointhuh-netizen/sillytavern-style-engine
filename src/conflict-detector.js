/**
 * conflict-detector.js
 * Detects trait conflicts between selected modules using trait-schema.json
 * and combinations.json.
 */

import { loadTraitSchema, loadCombinations, loadCatalog, loadAxis, loadConfig } from './data-loader.js';

/**
 * Collect trait values declared by a module.
 * @param {Object} mod  Module object with optional `traits` field.
 * @returns {Object}    Map of traitName → value.
 */
function extractTraits(mod) {
    return mod.traits ?? {};
}

/**
 * Determine whether two trait values are in conflict.
 * For enum traits: conflict when values differ.
 * For boolean traits: conflict when values differ.
 * For array traits: no conflict (arrays accumulate).
 *
 * @param {Object} traitDef  Trait schema definition.
 * @param {*} valA
 * @param {*} valB
 * @returns {boolean}
 */
function traitsConflict(traitDef, valA, valB) {
    if (traitDef.type === 'array') return false;
    return valA !== valB;
}

/**
 * Load all module data for every selected module.
 *
 * @param {Object} catalog
 * @param {Object} selections  { configs: {...}, axes: {...} }
 * @returns {Promise<Array<{id: string, source: string, traits: Object}>>}
 */
async function collectModuleTraits(catalog, selections) {
    const result = [];

    // configs
    for (const cfgMeta of catalog.configs ?? []) {
        const selectedModeId = selections.configs?.[cfgMeta.id];
        if (!selectedModeId) continue;

        try {
            const configData = await loadConfig(cfgMeta.file.replace(/^configs\//, ''));
            const mode = (configData.modes ?? []).find(m => m.id === selectedModeId);
            if (mode) {
                result.push({ id: selectedModeId, source: `config:${cfgMeta.id}`, traits: extractTraits(mode) });
            }
        } catch (e) {
            console.warn(`[StyleEngine] conflict-detector: could not load config ${cfgMeta.file}`, e);
        }
    }

    // axes
    const axisKeys = Object.keys(selections.axes ?? {});
    for (const axisKey of axisKeys) {
        const selection = selections.axes[axisKey];
        const selectedIds = Array.isArray(selection) ? selection : [selection];

        // Derive file name
        const axisModuleMeta = (catalog.modules ?? []).find(m => m.axis === axisKey);
        const rawFile = axisModuleMeta?.file ?? `axes/axis-${axisKey.toLowerCase()}.json`;
        const axisFileName = rawFile.replace(/^axes\//, '');

        let axisData;
        try {
            axisData = await loadAxis(axisFileName);
        } catch (e) {
            console.warn(`[StyleEngine] conflict-detector: could not load axis ${axisFileName}`, e);
            continue;
        }

        const axisModules = axisData.modules ?? [];
        for (const moduleId of selectedIds) {
            const mod = axisModules.find(m => m.id === moduleId);
            if (mod) {
                result.push({ id: moduleId, source: `axis:${axisKey}`, traits: extractTraits(mod) });
            }
        }
    }

    return result;
}

/**
 * Detect trait conflicts among selected modules.
 *
 * @param {Object} selections  { configs: {...}, axes: {...} }
 * @returns {Promise<{ conflicts: Array, warnings: Array }>}
 */
export async function detectConflicts(selections) {
    const [catalog, traitSchema, combinations] = await Promise.all([
        loadCatalog(),
        loadTraitSchema(),
        loadCombinations(),
    ]);

    const moduleTraits = await collectModuleTraits(catalog, selections);

    const conflicts = [];
    const warnings = [];

    // Build a map: traitName → [ {id, source, value} ]
    const traitMap = {};
    for (const { id, source, traits } of moduleTraits) {
        for (const [traitName, value] of Object.entries(traits)) {
            if (!traitMap[traitName]) traitMap[traitName] = [];
            traitMap[traitName].push({ id, source, value });
        }
    }

    // Check each trait for conflicting values
    for (const [traitName, entries] of Object.entries(traitMap)) {
        if (entries.length < 2) continue;
        const traitDef = traitSchema.traits?.[traitName];
        if (!traitDef) continue;

        const uniqueValues = [...new Set(entries.map(e => String(e.value)))];
        if (uniqueValues.length > 1 && traitDef.type !== 'array') {
            conflicts.push({
                trait: traitName,
                modules: entries.map(e => ({ id: e.id, source: e.source })),
                values: entries.map(e => ({ id: e.id, value: e.value })),
                severity: 'warning',
            });
        }
    }

    // Check explicit combination rules from combinations.json
    const rules = combinations.rules ?? combinations.conflicts ?? [];
    for (const rule of rules) {
        const involvedAxes = rule.axes ?? [];
        const involvedModules = rule.modules ?? [];

        // Check if current selection violates this rule
        const matched = involvedModules.every(moduleId => {
            const axisSelections = Object.values(selections.axes ?? {}).flat();
            const configSelections = Object.values(selections.configs ?? {});
            return [...axisSelections, ...configSelections].includes(moduleId);
        });

        if (matched && involvedModules.length > 0) {
            warnings.push({
                rule: rule.id ?? 'unknown',
                description: rule.description ?? rule.message ?? '조합 규칙 위반',
                modules: involvedModules,
                severity: rule.severity ?? 'warning',
            });
        }
    }

    return { conflicts, warnings };
}
