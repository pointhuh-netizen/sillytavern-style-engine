/**
 * index.js
 * SillyTavern extension entry point for Style Engine.
 *
 * Uses dynamic imports to avoid hard failure when SillyTavern internals change.
 * Registers slash commands and initialises the UI after the page is ready.
 */

const EXT_NAME = 'style-engine';
const EXT_DISPLAY = 'Style Engine';

// Lazy references — populated after dynamic import
let _ui = null;
let _build = null;
let _data = null;

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

/**
 * Try to register slash commands.
 * Silently skips if the SillyTavern slash-command API is unavailable (path mismatch).
 */
async function registerSlashCommands() {
    try {
        const { SlashCommandParser } = await import('../../../../slash-commands/SlashCommandParser.js');
        const { SlashCommand } = await import('../../../../slash-commands/SlashCommand.js');

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'style-build',
            helpString: '현재 선택된 스타일 모듈로 프롬프트를 빌드하여 반환합니다.',
            returns: 'string',
            callback: async () => {
                if (!_build) return 'Style Engine not loaded';
                try {
                    const raw = localStorage.getItem('sse-selections');
                    const selections = raw ? JSON.parse(raw) : { configs: {}, axes: {} };
                    return await _build.buildPrompt(selections);
                } catch (e) {
                    return `오류: ${e.message}`;
                }
            },
        }));

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'style-preview',
            helpString: '스타일 엔진 프리뷰 팝업을 표시합니다.',
            callback: async () => {
                if (!_ui) return '';
                await _ui.showPreview();
                return '';
            },
        }));

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'style-clear',
            helpString: '스타일 엔진 데이터 캐시를 초기화합니다.',
            callback: () => {
                if (!_data) return 'Style Engine not loaded';
                _data.clearCache();
                toastr?.success?.('스타일 엔진 캐시가 초기화되었습니다.');
                return '';
            },
        }));

        console.log(`[${EXT_DISPLAY}] Slash commands registered.`);
    } catch (err) {
        console.warn(`[${EXT_DISPLAY}] Slash command API not available — skipping registration.`, err);
    }
}

// ─── Entry point ────────────────────────────────────────────────────────────

jQuery(async () => {
    console.log(`[${EXT_DISPLAY}] 초기화 중…`);

    // Ensure extension_settings has a slot for this extension
    const ctx = window.SillyTavern?.getContext?.() ?? {};
    if (ctx.extensionSettings) {
        ctx.extensionSettings[EXT_NAME] = ctx.extensionSettings[EXT_NAME] ?? {};
    }

    // Dynamic import of local modules — parallel loading with error isolation
    try {
        [_ui, _build, _data] = await Promise.all([
            import('./src/ui-controller.js'),
            import('./src/build-engine.js'),
            import('./src/data-loader.js'),
        ]);
    } catch (err) {
        console.error(`[${EXT_DISPLAY}] 로컬 모듈 로드 실패:`, err);
        return;
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
            await _ui.init(settingsRoot);
        } catch (e) {
            console.error(`[${EXT_DISPLAY}] UI 초기화 실패:`, e);
        }
    }

    await registerSlashCommands();

    console.log(`[${EXT_DISPLAY}] 초기화 완료`);
});
