/**
 * build-engine.js
 * 선택된 모듈/config를 default-template.json 기반으로 조립하여 최종 프롬프트를 생성한다.
 */

import { loadDefaultTemplate, loadMasterRules } from './data-loader.js';

/**
 * 깊은 복사 유틸리티
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 슬롯 연산 적용.
 * @param {Object} slots - 현재 슬롯 맵 { '{SLOT}': value }
 * @param {Object} operations - 연산 맵 { '{SLOT}': { mode, value } }
 */
function applyOperations(slots, operations) {
    for (const [slotKey, op] of Object.entries(operations)) {
        if (!op || !op.mode) continue;
        const current = slots[slotKey] !== undefined ? slots[slotKey] : '';
        switch (op.mode) {
            case 'REPLACE':
                slots[slotKey] = op.value ?? '';
                break;
            case 'APPEND':
                slots[slotKey] = current
                    ? `${current}\n${op.value ?? ''}`
                    : (op.value ?? '');
                break;
            case 'PREPEND':
                slots[slotKey] = current
                    ? `${op.value ?? ''}\n${current}`
                    : (op.value ?? '');
                break;
            case 'DELETE':
                slots[slotKey] = '';
                break;
            default:
                console.warn(`[StyleEngine] Unknown operation mode: ${op.mode} for slot ${slotKey}`);
        }
    }
}

/**
 * config의 injections를 슬롯/static에 적용.
 * @param {Object} templateData - 템플릿 데이터 (수정 대상)
 * @param {Object} injections - config mode의 injections 객체
 */
function applyConfigInjections(templateData, injections) {
    for (const [key, value] of Object.entries(injections)) {
        if (value === null || value === undefined) continue;

        // preamble_core_directives_add: core_directives 배열에 항목 추가
        if (key === 'preamble_core_directives_add' && Array.isArray(value)) {
            if (!templateData.preamble._core_directives_extra) {
                templateData.preamble._core_directives_extra = [];
            }
            templateData.preamble._core_directives_extra.push(...value);
            continue;
        }

        // master_rules_godmoding_override: godmoding 규칙 교체
        if (key === 'master_rules_godmoding_override') {
            templateData._master_rules_override = templateData._master_rules_override || {};
            templateData._master_rules_override.godmoding = value;
            continue;
        }

        // static_{MODULE}_add: 특정 모듈의 static 배열에 항목 추가
        const staticAddMatch = key.match(/^static_(.+)_add$/);
        if (staticAddMatch && Array.isArray(value)) {
            const modKey = staticAddMatch[1]; // e.g. MODULE_1_VOICE
            if (templateData.modules[modKey]) {
                if (!templateData.modules[modKey]._static_extra) {
                    templateData.modules[modKey]._static_extra = [];
                }
                templateData.modules[modKey]._static_extra.push(...value);
            }
            continue;
        }

        // slot_{SLOT_KEY}_replace: 슬롯 직접 교체
        const slotReplaceMatch = key.match(/^slot_(.+)_replace$/);
        if (slotReplaceMatch) {
            const slotKey = `{${slotReplaceMatch[1]}}`;
            templateData._slot_overrides = templateData._slot_overrides || {};
            templateData._slot_overrides[slotKey] = value;
            continue;
        }
    }
}

/**
 * 템플릿에서 슬롯 맵(초기값) 추출.
 * @param {Object} template
 * @returns {Object} { '{SLOT}': defaultValue }
 */
function extractSlots(template) {
    const slots = {};
    for (const mod of Object.values(template.modules)) {
        if (mod.slots) {
            for (const [slotKey, slotDef] of Object.entries(mod.slots)) {
                slots[slotKey] = slotDef.default ?? '';
            }
        }
    }
    return slots;
}

/**
 * 템플릿에 정의된 슬롯 키 집합 반환.
 * @param {Object} template
 * @returns {Set<string>}
 */
function getTemplateSlotKeys(template) {
    const keys = new Set();
    for (const mod of Object.values(template.modules)) {
        if (mod.slots) {
            for (const slotKey of Object.keys(mod.slots)) {
                keys.add(slotKey);
            }
        }
    }
    return keys;
}

/**
 * 최종 프롬프트 텍스트 조립.
 * @param {Object} template - 처리된 템플릿 데이터
 * @param {Object} slots - 처리된 슬롯 맵 (템플릿 외 슬롯 포함 가능)
 * @param {Object} masterRules - master-rules.json 데이터
 * @returns {string}
 */
function assemblePrompt(template, slots, masterRules) {
    const lines = [];

    // 1. 제목/서두
    lines.push(`# ${template.preamble.title}`);

    // 2. 스타일 레퍼런스
    const styleRef = slots['{A_VOICE_STYLE_REF}'] || template.preamble.style_reference.default;
    lines.push(`\n## 문체 참조\n${styleRef}`);

    // 3. 핵심 톤
    const coreTone = slots['{D_PROSE_MOOD}'] || template.preamble.core_tone.default;
    lines.push(`\n## 핵심 톤\n${coreTone}`);

    // 4. 핵심 지시사항 (master-rules + config 추가분)
    const coreDirs = [...(masterRules.core_directives || [])];
    if (template.preamble._core_directives_extra) {
        coreDirs.push(...template.preamble._core_directives_extra);
    }
    if (coreDirs.length) {
        lines.push(`\n## 핵심 지시사항`);
        coreDirs.forEach((d) => lines.push(`- ${d}`));
    }

    // 5. 각 모듈 조립
    for (const [modKey, mod] of Object.entries(template.modules)) {
        const modLines = [];

        // static 항목
        const staticItems = [...(mod.static || []), ...(mod._static_extra || [])];
        if (staticItems.length) {
            staticItems.forEach((s) => modLines.push(`- ${s}`));
        }

        // 슬롯 항목
        if (mod.slots) {
            for (const [slotKey, slotDef] of Object.entries(mod.slots)) {
                const val =
                    (template._slot_overrides && template._slot_overrides[slotKey]) ||
                    slots[slotKey];
                if (val && val.trim()) {
                    const label = slotDef.label ? `[${slotDef.label}] ` : '';
                    modLines.push(`${label}${val}`);
                }
            }
        }

        if (modLines.length) {
            lines.push(`\n### ${mod.title}${mod.subtitle ? ' — ' + mod.subtitle : ''}`);
            modLines.forEach((l) => lines.push(l));
        }
    }

    // 6. 금지 패턴 (master-rules)
    if (masterRules.forbidden_patterns) {
        lines.push(`\n## 금지 패턴`);
        for (const [, fp] of Object.entries(masterRules.forbidden_patterns)) {
            lines.push(`[${fp.id}] ${fp.rule}`);
            if (fp.banned_expressions) {
                lines.push(`  금지 표현: ${fp.banned_expressions.join(', ')}`);
            }
            if (fp.banned_nouns) {
                lines.push(`  금지 명사: ${fp.banned_nouns.join(', ')}`);
            }
        }
    }

    // 7. godmoding 규칙
    const godmodingOverride = template._master_rules_override?.godmoding;
    if (godmodingOverride !== undefined) {
        if (godmodingOverride !== null) {
            lines.push(`\n## Godmoding 규칙\n${godmodingOverride}`);
        }
    } else if (masterRules.godmoding_rule) {
        lines.push(`\n## Godmoding 규칙\n${masterRules.godmoding_rule}`);
    }

    // 8. 템플릿 외 슬롯 (W축 등 별도 섹션)
    const templateSlotKeys = getTemplateSlotKeys(template);
    const extraSlots = Object.entries(slots).filter(
        ([key, val]) => !templateSlotKeys.has(key) && val && val.trim()
    );
    if (extraSlots.length) {
        lines.push(`\n## 세계 시뮬레이션 규칙`);
        for (const [, val] of extraSlots) {
            if (val && val.trim()) {
                lines.push(val);
            }
        }
    }

    return lines.join('\n');
}

/**
 * 빌드 실행.
 */
export function buildPrompt({
    selectedModules,
    selectedConfigs,
    allAxes,
    allConfigs,
    defaultTemplate,
    masterRules,
}) {
    const warnings = [];
    
    // [추가됨] 방어 코드: 템플릿 로드 누락 방지
    if (!defaultTemplate) {
        return {
            prompt: "⚠️ 템플릿(default-template) 데이터가 없습니다. data-loader.js의 로드 상태를 확인하세요.",
            modules: selectedModules,
            configs: selectedConfigs,
            warnings: ["defaultTemplate is missing"]
        };
    }

    const template = deepClone(defaultTemplate);
    
    // [추가됨] 방어 코드: 객체/배열 속성이 없을 경우 기본값 할당(크래시 방지)
    template.modules = template.modules || {};
    template.build_order = template.build_order || [];
    template.preamble = template.preamble || {};
    template.preamble.style_reference = template.preamble.style_reference || { default: "" };
    template.preamble.core_tone = template.preamble.core_tone || { default: "" };
    masterRules = masterRules || {};

    const slots = extractSlots(template);

    // 1. config 처리
    for (const cfgId of selectedConfigs) {
        let found = false;
        for (const cfgData of Object.values(allConfigs || {})) {
            const mode = cfgData.modes?.find((m) => m.id === cfgId);
            if (mode) {
                found = true;
                if (mode.injections) {
                    applyConfigInjections(template, mode.injections);
                }
                break;
            }
        }
        if (!found) {
            warnings.push(`Config mode not found: ${cfgId}`);
        }
    }

    // 2. 축 모듈 처리
    const buildOrder = template.build_order.filter((o) => o !== 'configs');
    const allAxisKeys = Object.keys(allAxes || {});
    const extraAxes = allAxisKeys.filter((k) => !buildOrder.includes(k));
    const fullOrder = [...buildOrder, ...extraAxes];

    for (const axisKey of fullOrder) {
        const axisData = allAxes[axisKey];
        if (!axisData) continue;

        const modulesForAxis = selectedModules.filter((id) => id.startsWith(`${axisKey}-`));
        for (const moduleId of modulesForAxis) {
            const mod = axisData.modules?.find((m) => m.id === moduleId);
            if (!mod) {
                warnings.push(`Module not found: ${moduleId}`);
                continue;
            }
            if (mod.operations) {
                applyOperations(slots, mod.operations);
            }
            if (mod.static_override) {
                for (const [modKey, newStatic] of Object.entries(mod.static_override)) {
                    if (template.modules[modKey]) {
                        template.modules[modKey].static = newStatic;
                    }
                }
            }
        }
    }

    const prompt = assemblePrompt(template, slots, masterRules);

    return {
        prompt,
        modules: [...selectedModules],
        configs: [...selectedConfigs],
        warnings,
    };
}

/**
 * 데이터를 자동 로드하여 빌드 (편의 함수).
 * @param {string[]} selectedModules
 * @param {string[]} selectedConfigs
 * @param {Object} loadedData - loadAll()의 반환값
 * @returns {Object} BuildResult
 */
export function buildFromLoadedData(selectedModules, selectedConfigs, loadedData) {
    return buildPrompt({
        selectedModules,
        selectedConfigs,
        allAxes: loadedData.axes,
        allConfigs: loadedData.configs,
        defaultTemplate: loadedData.defaultTemplate,
        masterRules: loadedData.masterRules,
    });
}
