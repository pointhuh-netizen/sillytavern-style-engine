/**
 * index.js — Style Engine 확장 메인 진입점
 * SillyTavern 3rd-party 확장. 문체 조합 빌더를 제공한다.
 */

let extension_settings, eventSource, event_types, saveSettingsDebounced;

try {
    const [extMod, scriptMod] = await Promise.all([
        import('../../../extensions.js'),
        import('../../../../script.js'),
    ]);
    // [수정됨] 모듈에서 가져오지 못할 경우 window 전역 객체에서 강제로 가져오도록 || 연산자 추가
    extension_settings = extMod.extension_settings || window.extension_settings || {};
    eventSource = scriptMod.eventSource || window.eventSource;
    event_types = scriptMod.event_types || window.event_types;
    saveSettingsDebounced = scriptMod.saveSettingsDebounced || window.saveSettingsDebounced || (() => {});
} catch {
    extension_settings = window.extension_settings || {};
    eventSource = window.eventSource;
    event_types = window.event_types;
    saveSettingsDebounced = window.saveSettingsDebounced || (() => {});
}

import { injectPrompt, clearInjection } from './src/prompt-injector.js';
import { openPopup, onChatChanged, clearCurrentBuild } from './src/ui-controller.js';
import { getExtensionRoot } from './src/data-loader.js';

const EXTENSION_NAME = 'sillytavern-style-engine';

const DEFAULT_SETTINGS = {
    enabled: true,
};

function initSettings() {
    // [추가된 방어 코드] 만약 환경 문제로 여전히 undefined라면 빈 객체로 초기화
    if (!extension_settings) {
        extension_settings = {};
    }
    
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
    }
    Object.assign(
        extension_settings[EXTENSION_NAME],
        { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] }
    );
}

async function loadSettingsPanel() {
    const root = await getExtensionRoot();
    const settingsHtml = await $.get(`/${root}/settings.html`);
    const $container = $('#extensions_settings');
    if ($container.length) {
        $container.append(settingsHtml);
    } else {
        $('[data-extension="' + EXTENSION_NAME + '"]').append(settingsHtml);
    }
}

function bindSettingsEvents() {
    // 문체 빌더 열기 버튼
    $(document).on('click', '#style-engine-open-btn', async function () {
        try {
            await openPopup();
        } catch (err) {
            console.error("[StyleEngine] 팝업 열기 실패:", err);
            toastr.error('팝업을 여는 중 오류가 발생했습니다. 콘솔(F12)을 확인하세요.', 'Style Engine');
        }
    });

    // 빌드 초기화 버튼
    $(document).on('click', '#style-engine-clear-btn', function () {
        clearCurrentBuild();
        toastr.success('문체 빌드가 초기화되었습니다.', 'Style Engine');
    });

    // 활성화 토글
    $(document).on('change', '#style-engine-enabled-toggle', function () {
        const enabled = $(this).is(':checked');
        extension_settings[EXTENSION_NAME].enabled = enabled;
        saveSettingsDebounced();
        if (!enabled) {
            clearInjection();
        }
    });
}

function registerEventListeners() {
    if (eventSource && event_types) {
        eventSource.on(event_types.CHAT_CHANGED, () => {
            onChatChanged();
        });

        eventSource.on(event_types.GENERATION_STARTED, () => {
            injectPrompt();
        });
    } else {
        console.warn("[StyleEngine] eventSource를 찾을 수 없어 이벤트를 등록하지 못했습니다.");
    }
}

async function init() {
    console.log(`[${EXTENSION_NAME}] Initializing Style Engine...`);

    try {
        initSettings();
        await loadSettingsPanel();

        const enabled = extension_settings[EXTENSION_NAME]?.enabled !== false;
        $('#style-engine-enabled-toggle').prop('checked', enabled);

        bindSettingsEvents();
        registerEventListeners();
        onChatChanged();

        console.log(`[${EXTENSION_NAME}] Style Engine initialized.`);
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] Initialization error:`, err);
    }
}

$(document).ready(() => {
    init();
});
