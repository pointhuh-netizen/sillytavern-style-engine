/**
 * combination-checker.js
 * 선택된 모듈들의 조합 충돌/시너지를 검증한다.
 * combinations.json의 explicit_pairs 규칙과 자동 trait 비교를 수행.
 */

/**
 * 모듈 ID에서 축 키 추출 (예: 'A-01' → 'A')
 */
function getAxisKey(moduleId) {
    return moduleId.split('-')[0];
}

/**
 * 선택된 모듈들의 trait 맵 빌드.
 * @param {string[]} selectedModules - 선택된 모듈 ID 배열
 * @param {Object} allAxes - { 'A': axisData, ... }
 * @returns {Object} { 'A-01': traits, 'S-02': traits, ... }
 */
function buildTraitMap(selectedModules, allAxes) {
    const traitMap = {};
    for (const moduleId of selectedModules) {
        const axisKey = getAxisKey(moduleId);
        const axisData = allAxes[axisKey];
        if (!axisData) continue;
        const mod = axisData.modules?.find((m) => m.id === moduleId);
        if (mod && mod.traits) {
            traitMap[moduleId] = mod.traits;
        }
    }
    return traitMap;
}

/**
 * AUTO 규칙 기반 자동 충돌 감지.
 * @param {Object} traitMap - { moduleId: traits }
 * @param {Object[]} autoRules - combinations.json의 auto_rules 배열
 * @returns {Object[]} 충돌 결과 배열
 */
function checkAutoRules(traitMap, autoRules) {
    const results = [];
    const moduleIds = Object.keys(traitMap);

    for (let i = 0; i < moduleIds.length; i++) {
        for (let j = i + 1; j < moduleIds.length; j++) {
            const idA = moduleIds[i];
            const idB = moduleIds[j];
            const traitsA = traitMap[idA] || {};
            const traitsB = traitMap[idB] || {};

            for (const rule of autoRules) {
                const ruleResult = evaluateAutoRule(rule, idA, traitsA, idB, traitsB);
                if (ruleResult) {
                    results.push(ruleResult);
                }
            }
        }
    }
    return results;
}

/**
 * 개별 AUTO 규칙 평가.
 */
function evaluateAutoRule(rule, idA, traitsA, idB, traitsB) {
    const id = rule.id;

    switch (id) {
        case 'AUTO-POV-CONFLICT': {
            const povA = traitsA.pov;
            const povB = traitsB.pov;
            if (
                povA && povB &&
                povA !== 'none' && povB !== 'none' &&
                povA !== povB
            ) {
                return makeResult(rule, [idA, idB]);
            }
            break;
        }
        case 'AUTO-SENTENCE-TENSION': {
            const slA = traitsA.sentence_length;
            const slB = traitsB.sentence_length;
            if (
                (slA === 'short' && slB === 'long') ||
                (slA === 'long' && slB === 'short')
            ) {
                return makeResult(rule, [idA, idB]);
            }
            break;
        }
        case 'AUTO-EMOTION-DOUBLE-SUPPRESS': {
            // 이 규칙은 쌍이 아닌 전체 집합에 적용 — checkAutoRulesGlobal에서 처리
            break;
        }
        case 'AUTO-FID-CONFLICT': {
            const fidA = traitsA.fid;
            const fidB = traitsB.fid;
            if (
                (fidA === 'forbidden' && ['all', 'npc-only', 'simple'].includes(fidB)) ||
                (fidB === 'forbidden' && ['all', 'npc-only', 'simple'].includes(fidA))
            ) {
                return makeResult(rule, [idA, idB]);
            }
            break;
        }
        case 'AUTO-LYRICISM-CLASH': {
            const lyrA = traitsA.lyricism;
            const lyrB = traitsB.lyricism;
            if (
                (lyrA === 'forbidden' && lyrB === 'high') ||
                (lyrA === 'high' && lyrB === 'forbidden')
            ) {
                return makeResult(rule, [idA, idB]);
            }
            break;
        }
        case 'AUTO-NARRATOR-1ST-CLASH': {
            const npA = traitsA.narrator_presence;
            const npB = traitsB.narrator_presence;
            const povA = traitsA.pov;
            const povB = traitsB.pov;
            if (
                (npA === 'storyteller' && povB === '1st') ||
                (npB === 'storyteller' && povA === '1st')
            ) {
                return makeResult(rule, [idA, idB]);
            }
            break;
        }
        case 'AUTO-PERSONIFICATION-CLASH': {
            const pfA = traitsA.personification;
            const pfB = traitsB.personification;
            if (
                (pfA === 'forbidden' && pfB === 'allowed') ||
                (pfA === 'allowed' && pfB === 'forbidden')
            ) {
                return makeResult(rule, [idA, idB]);
            }
            break;
        }
        case 'AUTO-SLOT-OVERLAP': {
            const slotsA = traitsA.slots_touched || [];
            const slotsB = traitsB.slots_touched || [];
            const overlap = slotsA.filter((s) => slotsB.includes(s));
            if (overlap.length > 0) {
                return {
                    ...makeResult(rule, [idA, idB]),
                    overlap,
                };
            }
            break;
        }
        default:
            // 기타 AUTO 규칙: trait 기반 일반 비교 시도
            break;
    }
    return null;
}

/**
 * 전역 AUTO 규칙 (쌍이 아닌 전체 집합 기반).
 */
function checkAutoRulesGlobal(traitMap, autoRules) {
    const results = [];
    const allTraits = Object.values(traitMap);

    // AUTO-EMOTION-DOUBLE-SUPPRESS
    const rule = autoRules.find((r) => r.id === 'AUTO-EMOTION-DOUBLE-SUPPRESS');
    if (rule) {
        const suppressedModules = Object.entries(traitMap)
            .filter(([, t]) =>
                t.emotion_level === 'suppressed' || t.emotion_level === 'forbidden'
            )
            .map(([id]) => id);
        if (suppressedModules.length >= 2) {
            results.push(makeResult(rule, suppressedModules));
        }
    }

    return results;
}

/**
 * explicit_pairs 규칙 검사.
 */
function checkExplicitPairs(selectedModules, selectedConfigs, explicitPairs) {
    const results = [];
    const allSelected = [...selectedModules, ...selectedConfigs];

    for (const pair of explicitPairs) {
        const modules = pair.modules || [];
        const matchCount = modules.filter((m) => allSelected.includes(m)).length;
        if (matchCount >= 2 || (modules.length === 1 && allSelected.includes(modules[0]))) {
            if (modules.every((m) => allSelected.includes(m))) {
                results.push({
                    ruleId: pair.id,
                    severity: pair.severity || 'warning',
                    message: pair.description_ko || pair.description || pair.id,
                    resolution: pair.resolution_ko || pair.resolution || '',
                    modules: pair.modules,
                });
            }
        }
    }
    return results;
}

/**
 * 결과 객체 생성 헬퍼.
 */
function makeResult(rule, involvedModules) {
    return {
        ruleId: rule.id,
        severity: rule.severity || 'info',
        message: rule.message_ko || rule.message || rule.condition || rule.id,
        resolution: rule.resolution_ko || rule.resolution || '',
        modules: involvedModules,
    };
}

/**
 * 조합 검증 실행.
 * @param {Object} params
 * @param {string[]} params.selectedModules - 선택된 모듈 ID 배열
 * @param {string[]} params.selectedConfigs - 선택된 config mode ID 배열
 * @param {Object} params.allAxes - { 'A': axisData, ... }
 * @param {Object} params.combinations - combinations.json 데이터
 * @returns {Object[]} 검증 결과 배열 [{ ruleId, severity, message, resolution, modules }]
 */
export function checkCombinations({ selectedModules, selectedConfigs, allAxes, combinations }) {
    const autoRules = combinations.auto_rules || [];
    const explicitPairs = combinations.explicit_pairs || [];

    const traitMap = buildTraitMap(selectedModules, allAxes);
    const results = [
        ...checkAutoRules(traitMap, autoRules),
        ...checkAutoRulesGlobal(traitMap, autoRules),
        ...checkExplicitPairs(selectedModules, selectedConfigs, explicitPairs),
    ];

    // 중복 제거 (같은 ruleId + 같은 모듈 쌍)
    const seen = new Set();
    return results.filter((r) => {
        const key = `${r.ruleId}:${(r.modules || []).slice().sort().join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * 특정 모듈 추가 시 예상 충돌 미리 확인.
 * @param {string} newModuleId - 추가하려는 모듈 ID
 * @param {string[]} currentModules - 현재 선택된 모듈 ID 배열
 * @param {string[]} currentConfigs - 현재 선택된 config ID 배열
 * @param {Object} allAxes
 * @param {Object} combinations
 * @returns {Object[]} 예상 충돌 결과
 */
export function previewAddModule(
    newModuleId,
    currentModules,
    currentConfigs,
    allAxes,
    combinations
) {
    return checkCombinations({
        selectedModules: [...currentModules, newModuleId],
        selectedConfigs: currentConfigs,
        allAxes,
        combinations,
    });
}
