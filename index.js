/**
 * index.js
 * SillyTavern extension entry point for Style Engine.
 *
 * Registers slash commands and initialises the UI after the page is ready.
 */

import { SlashCommandParser } from '../../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../../slash-commands/SlashCommandArgument.js';
import { init, showPreview, applyToChat } from './src/ui-controller.js';
import { buildPrompt } from './src/build-engine.js';
import { clearCache } from './src/data-loader.js';

const EXT_NAME = 'style-engine';
const EXT_DISPLAY = 'Style Engine';

/**
 * Load settings HTML into the SillyTavern extension settings area.
 */
async function loadSettingsHTML() {
    const settingsHtml = await fetch(new URL('./settings.html', import.meta.url)).then(r => r.text());
    const container = document.getElementById('extensions_settings');
    if (!container) return null;

    const wrapper = document.createElement('div');
    wrapper.id = 'sse-settings-wrapper';
    wrapper.innerHTML = settingsHtml;
    container.appendChild(wrapper);
    return wrapper;
}

/**
 * Load popup HTML into the document body.
 */
async function loadPopupHTML() {
    const popupHtml = await fetch(new URL('./popup.html', import.meta.url)).then(r => r.text());
    const wrapper = document.createElement('div');
    wrapper.id = 'sse-popup-wrapper';
    wrapper.innerHTML = popupHtml;
    document.body.appendChild(wrapper);
}

// ─── Entry point ────────────────────────────────────────────────────────────

jQuery(async () => {
    console.log(`[${EXT_DISPLAY}] 초기화 중…`);

    // Ensure extension_settings has a slot for this extension
    const ctx = window.SillyTavern?.getContext?.() ?? {};
    if (ctx.extensionSettings) {
        ctx.extensionSettings[EXT_NAME] = ctx.extensionSettings[EXT_NAME] ?? {};
    }

    // Load HTML fragments
    let settingsRoot = null;
    try {
        settingsRoot = await loadSettingsHTML();
        await loadPopupHTML();
    } catch (e) {
        console.error(`[${EXT_DISPLAY}] HTML 로드 실패:`, e);
    }

    // Initialise UI controller
    if (settingsRoot) {
        try {
            await init(settingsRoot);
        } catch (e) {
            console.error(`[${EXT_DISPLAY}] UI 초기화 실패:`, e);
        }
    }

    // ─── Slash commands ───────────────────────────────────────────────────

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'style-build',
        helpString: '현재 선택된 스타일 모듈로 프롬프트를 빌드하여 반환합니다.',
        returns: 'string',
        callback: async () => {
            try {
                const raw = localStorage.getItem('sse-selections');
                const selections = raw ? JSON.parse(raw) : { configs: {}, axes: {} };
                return await buildPrompt(selections);
            } catch (e) {
                return `오류: ${e.message}`;
            }
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'style-preview',
        helpString: '스타일 엔진 프리뷰 팝업을 표시합니다.',
        callback: async () => {
            await showPreview();
            return '';
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'style-clear',
        helpString: '스타일 엔진 데이터 캐시를 초기화합니다.',
        callback: () => {
            clearCache();
            toastr?.success?.('스타일 엔진 캐시가 초기화되었습니다.');
            return '';
        },
    }));

    console.log(`[${EXT_DISPLAY}] 초기화 완료`);
});
