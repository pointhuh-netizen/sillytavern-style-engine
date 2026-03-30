/**
 * prompt-injector.js
 * 빌드된 프롬프트를 SillyTavern의 프롬프트 파이프라인에 주입하고,
 * 채팅 메타데이터에 빌드 결과를 저장/로드한다.
 */

import { getContext, extension_settings } from '../../../../extensions.js';
import { setExtensionPrompt } from '../../../../../script.js';

const EXTENSION_NAME = 'sillytavern-style-engine';
const METADATA_KEY = 'style_engine_build';

// 프롬프트 삽입 위치: 시스템 프롬프트 다음, 캐릭터 설명 앞
// ST의 extension_prompt_types: 1 = in_prompt (after system, before character)
const INJECTION_POSITION = 1;
const INJECTION_DEPTH = 0;

/**
 * 현재 채팅 메타데이터에 빌드 결과를 저장.
 * @param {Object} buildResult - { prompt, modules, configs, warnings }
 */
export function saveBuildToChat(buildResult) {
    const context = getContext();
    if (!context) {
        console.warn('[StyleEngine] No context available for saving build.');
        return;
    }
    if (!context.chat_metadata) {
        context.chat_metadata = {};
    }
    context.chat_metadata[METADATA_KEY] = {
        ...buildResult,
        savedAt: new Date().toISOString(),
    };
    if (typeof context.saveMetadata === 'function') {
        context.saveMetadata();
    }
}

/**
 * 현재 채팅 메타데이터에서 빌드 결과를 로드.
 * @returns {Object|null} 저장된 빌드 결과, 없으면 null
 */
export function loadBuildFromChat() {
    const context = getContext();
    if (!context || !context.chat_metadata) {
        return null;
    }
    return context.chat_metadata[METADATA_KEY] || null;
}

/**
 * 현재 채팅의 빌드 결과를 삭제.
 */
export function clearBuildFromChat() {
    const context = getContext();
    if (!context || !context.chat_metadata) return;
    delete context.chat_metadata[METADATA_KEY];
    if (typeof context.saveMetadata === 'function') {
        context.saveMetadata();
    }
}

/**
 * 저장된 프롬프트를 ST 프롬프트 파이프라인에 주입.
 * GENERATION_STARTED 이벤트에서 호출한다.
 * extension_settings[EXTENSION_NAME].enabled 가 false이면 주입을 건너뛴다.
 */
export function injectPrompt() {
    // 비활성화 상태이면 주입 해제 후 종료
    const settings = extension_settings[EXTENSION_NAME];
    if (settings && settings.enabled === false) {
        clearInjection();
        return;
    }

    const buildResult = loadBuildFromChat();
    if (!buildResult || !buildResult.prompt) {
        // 빌드 결과 없으면 빈 프롬프트 주입 (이전 주입 초기화)
        clearInjection();
        return;
    }
    setExtensionPrompt(
        EXTENSION_NAME,
        buildResult.prompt,
        INJECTION_POSITION,
        INJECTION_DEPTH
    );
}

/**
 * 프롬프트 주입 해제 (빈 문자열로 교체).
 */
export function clearInjection() {
    setExtensionPrompt(EXTENSION_NAME, '', INJECTION_POSITION, INJECTION_DEPTH);
}

/**
 * 빌드 결과 저장 + 즉시 주입 (적용 버튼용).
 * @param {Object} buildResult
 */
export function applyBuild(buildResult) {
    saveBuildToChat(buildResult);
    injectPrompt();
}
