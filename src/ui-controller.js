/**
 * ui-controller.js
 * 팝업 빌더 UI 로직.
 * popup.html을 팝업으로 열고, 축별 탭/모듈 선택/빌드 미리보기를 제어한다.
 */

import { loadAll, getExtensionRoot } from './data-loader.js';
import { buildFromLoadedData } from './build-engine.js';
import { checkCombinations } from './combination-checker.js';
import { applyBuild, loadBuildFromChat, clearBuildFromChat } from './prompt-injector.js';

const EXTENSION_NAME = 'sillytavern-style-engine';

// 현재 로드된 데이터
let _loadedData = null;

// 현재 팝업 선택 상태
let _state = {
    selectedModules: [], // e.g. ['A-01', 'S-02']
    selectedConfigs: [], // e.g. ['UCC-01', 'NSFW-02']
};

// 새 창 참조
let _standaloneWindow = null;

/**
 * 데이터 초기화 (첫 팝업 열기 시 한 번만 실행)
 */
async function ensureDataLoaded() {
    if (!_loadedData) {
        _loadedData = await loadAll();
    }
}

/**
 * 팝업 열기.
 * settings.html의 버튼에 연결.
 */
export async function openPopup() {
    await ensureDataLoaded();

    // 기존 팝업이 있으면 제거
    $('#style-engine-popup').remove();

    // popup.html 로드
    const root = await getExtensionRoot();
    const popupHtml = await $.get(`/${root}/popup.html`);
    $('body').append(popupHtml);

    // 저장된 상태 복원
    const saved = loadBuildFromChat();
    if (saved) {
        _state.selectedModules = saved.modules || [];
        _state.selectedConfigs = saved.configs || [];
    } else {
        _state.selectedModules = [];
        _state.selectedConfigs = [];
    }

    // UI 렌더링
    renderPopup();
    bindPopupEvents();

    // 팝업 표시
    $('#style-engine-popup').show();
    // 드래그 가능하게
    if ($.fn.draggable) {
        $('#style-engine-popup').draggable({ handle: '.se-popup-header' });
    }
}

/**
 * 팝업 UI 전체 렌더링.
 */
function renderPopup() {
    const catalog = _loadedData.catalog;
    const $popup = $('#style-engine-popup');

    // 탭 렌더링 (축 + config)
    renderAxisTabs($popup, catalog);

    // 기본 첫 번째 탭 활성화
    const firstTab = $popup.find('.se-tab-btn').first();
    if (firstTab.length) {
        activateTab(firstTab.data('axis'));
    }

    // config 섹션 렌더링
    renderConfigSection($popup, catalog);

    // 충돌 검사 초기 실행
    updateConflictDisplay();

    // 현재 적용된 빌드 요약 표시
    updateBuildSummary();

    // [추가됨] 팝업을 열었을 때 초기 상태로 자동 빌드 및 미리보기 렌더링
    runBuild(); 
}

/**
 * 축 탭 버튼 렌더링.
 */
function renderAxisTabs($popup, catalog) {
    const $tabBar = $popup.find('.se-tab-bar');
    $tabBar.empty();

    for (const [axisKey, axisInfo] of Object.entries(catalog.axes)) {
        const $btn = $(`
            <button class="se-tab-btn" data-axis="${axisKey}">
                ${axisInfo.icon || ''} ${axisInfo.name_ko}
                <span class="se-tab-en">(${axisInfo.name_en})</span>
            </button>
        `);
        $tabBar.append($btn);
    }
}

/**
 * 탭 활성화 + 해당 축 모듈 렌더링.
 */
function activateTab(axisKey) {
    const $popup = $('#style-engine-popup');
    $popup.find('.se-tab-btn').removeClass('active');
    $popup.find(`.se-tab-btn[data-axis="${axisKey}"]`).addClass('active');

    const catalog = _loadedData.catalog;
    const axisData = _loadedData.axes[axisKey];
    const axisInfo = catalog.axes[axisKey];

    const $content = $popup.find('.se-tab-content');
    $content.empty();

    if (!axisData || !axisInfo) {
        $content.html('<p class="se-error">축 데이터를 불러올 수 없습니다.</p>');
        return;
    }

    // 축 설명
    $content.append(`
        <div class="se-axis-header">
            <span class="se-axis-icon">${axisInfo.icon || ''}</span>
            <div>
                <div class="se-axis-title">${axisInfo.name_ko} <span class="se-axis-en">(${axisInfo.name_en})</span></div>
                <div class="se-axis-desc">${axisInfo.ui_description || ''}</div>
                <div class="se-axis-type">${axisInfo.type === 'mutex' ? '⊙ 하나만 선택' : '☑ 복수 선택 가능'}</div>
            </div>
        </div>
    `);

    // 모듈 카드 렌더링
    const $grid = $('<div class="se-module-grid"></div>');
    for (const mod of axisData.modules || []) {
        const isSelected = _state.selectedModules.includes(mod.id);
        const $card = renderModuleCard(mod, axisKey, axisInfo.type, isSelected);
        $grid.append($card);
    }
    $content.append($grid);
}

/**
 * 개별 모듈 카드 렌더링.
 */
function renderModuleCard(mod, axisKey, axisType, isSelected) {
    const inputType = axisType === 'mutex' ? 'radio' : 'checkbox';
    const $card = $(`
        <div class="se-module-card ${isSelected ? 'selected' : ''}" data-module-id="${mod.id}" data-axis="${axisKey}">
            <label class="se-module-label">
                <input type="${inputType}" class="se-module-input"
                    name="axis-${axisKey}"
                    value="${mod.id}"
                    ${isSelected ? 'checked' : ''}
                    ${mod.id.endsWith('-00') && axisType === 'mutex' ? '' : ''}
                />
                <div class="se-module-info">
                    <div class="se-module-id">${mod.id}</div>
                    <div class="se-module-name">${mod.name}</div>
                    <div class="se-module-oneliner">${mod.one_liner || ''}</div>
                </div>
            </label>
        </div>
    `);
    return $card;
}

/**
 * Config 섹션 렌더링.
 */
function renderConfigSection($popup, catalog) {
    const $configSection = $popup.find('.se-config-section');
    $configSection.empty();

    for (const cfgMeta of catalog.configs) {
        const cfgData = _loadedData.configs[cfgMeta.id];
        if (!cfgData) continue;

        const $cfgBlock = $(`
            <div class="se-config-block">
                <div class="se-config-title">${cfgMeta.icon || ''} ${cfgMeta.name_ko} <span class="se-config-en">(${cfgMeta.name_en})</span></div>
            </div>
        `);

        const $modes = $('<div class="se-config-modes"></div>');
        for (const mode of cfgData.modes || []) {
            const isSelected = _state.selectedConfigs.includes(mode.id);
            $modes.append(`
                <label class="se-config-mode ${isSelected ? 'selected' : ''}">
                    <input type="radio" name="config-${cfgMeta.id}" value="${mode.id}" ${isSelected ? 'checked' : ''} />
                    <span class="se-config-mode-id">${mode.id}</span>
                    <span class="se-config-mode-name">${mode.name || mode.id}</span>
                    <span class="se-config-mode-oneliner">${mode.one_liner || ''}</span>
                </label>
            `);
        }
        $cfgBlock.append($modes);
        $configSection.append($cfgBlock);
    }
}

/**
 * 이벤트 바인딩.
 */
function bindPopupEvents() {
    const $popup = $('#style-engine-popup');

    // 탭 클릭
    $popup.on('click', '.se-tab-btn', function () {
        activateTab($(this).data('axis'));
        updateConflictDisplay();
    });

    // [복구됨] 모듈 선택 (축별 mutex/combinable)
    $popup.on('change', '.se-module-input', function () {
        const $input = $(this);
        const moduleId = $input.val();
        const axisKey = $input.closest('.se-module-card').data('axis');
        const axisInfo = _loadedData.catalog.axes[axisKey];
        const isMutex = axisInfo?.type === 'mutex';

        if (isMutex) {
            _state.selectedModules = _state.selectedModules.filter(
                (id) => !id.startsWith(`${axisKey}-`)
            );
            if ($input.is(':checked')) {
                _state.selectedModules.push(moduleId);
            }
        } else {
            if ($input.is(':checked')) {
                if (!_state.selectedModules.includes(moduleId)) {
                    _state.selectedModules.push(moduleId);
                }
            } else {
                _state.selectedModules = _state.selectedModules.filter((id) => id !== moduleId);
            }
        }

        $popup.find(`.se-module-card`).each(function () {
            const id = $(this).data('module-id');
            $(this).toggleClass('selected', _state.selectedModules.includes(id));
        });

        updateConflictDisplay();
        updateBuildSummary();
        
        // 자동 빌드(미리보기 갱신)
        runBuild(); 
    });

    // config 선택
    $popup.on('change', 'input[type="radio"][name^="config-"]', function () {
        const $input = $(this);
        const cfgMetaId = $input.attr('name').replace('config-', '');
        const cfgMeta = _loadedData.catalog.configs.find((c) => c.id === cfgMetaId);
        if (!cfgMeta) return;

        const modeIds = cfgMeta.modes || [];
        _state.selectedConfigs = _state.selectedConfigs.filter(
            (id) => !modeIds.includes(id)
        );
        const newModeId = $input.val();
        if (newModeId) {
            _state.selectedConfigs.push(newModeId);
        }

        $popup.find('.se-config-mode').each(function () {
            const modeVal = $(this).find('input').val();
            $(this).toggleClass('selected', _state.selectedConfigs.includes(modeVal));
        });

        updateConflictDisplay();
        updateBuildSummary();

        // 설정 변경 시 자동 빌드(미리보기 갱신)
        runBuild(); 
    });

    // 적용 버튼
    $popup.on('click', '#se-btn-apply', function () {
        runApply();
    });

    // 초기화 버튼
    $popup.on('click', '#se-btn-reset', function () {
        _state.selectedModules = [];
        _state.selectedConfigs = [];
        clearBuildFromChat();
        const activeAxis = $popup.find('.se-tab-btn.active').data('axis');
        if (activeAxis) activateTab(activeAxis);
        renderConfigSection($popup, _loadedData.catalog);
        updateConflictDisplay();
        updateBuildSummary();
        
        // 텍스트 임의 삭제 대신 자동 빌드로 빈 상태 반영
        runBuild(); 
    });

    // 닫기 버튼
    $popup.on('click', '#se-btn-close, .se-popup-close', function () {
        $popup.hide();
    });

    // 외부 클릭 시 닫기
    $(document).on('click.style-engine-outside', function (e) {
        if ($popup.is(':visible') && !$(e.target).closest('#style-engine-popup').length) {
        }
    });
}

/**
 * 충돌 표시 업데이트.
 */
function updateConflictDisplay() {
    const $popup = $('#style-engine-popup');
    const $conflicts = $popup.find('.se-conflicts');
    $conflicts.empty();

    if (!_loadedData || _state.selectedModules.length < 2) {
        $conflicts.html('<span class="se-no-conflict">선택된 모듈이 없거나 1개입니다.</span>');
        return;
    }

    const results = checkCombinations({
        selectedModules: _state.selectedModules,
        selectedConfigs: _state.selectedConfigs,
        allAxes: _loadedData.axes,
        combinations: _loadedData.combinations,
    });

    if (!results.length) {
        $conflicts.html('<span class="se-no-conflict">✓ 충돌 없음</span>');
        return;
    }

    for (const r of results) {
        const cls =
            r.severity === 'error'
                ? 'se-conflict-error'
                : r.severity === 'warning'
                ? 'se-conflict-warning'
                : 'se-conflict-info';
        const icon =
            r.severity === 'error' ? '🔴' : r.severity === 'warning' ? '🟡' : 'ℹ️';
        $conflicts.append(`
            <div class="se-conflict-item ${cls}">
                <span class="se-conflict-icon">${icon}</span>
                <div>
                    <div class="se-conflict-msg">${r.message}</div>
                    ${r.resolution ? `<div class="se-conflict-res">${r.resolution}</div>` : ''}
                    <div class="se-conflict-modules">${(r.modules || []).join(', ')}</div>
                </div>
            </div>
        `);
    }
}

/**
 * 빌드 실행 및 미리보기 업데이트.
 */
function runBuild() {
    if (!_loadedData) return;

    const result = buildFromLoadedData(
        _state.selectedModules,
        _state.selectedConfigs,
        _loadedData
    );

    const $popup = $('#style-engine-popup');
    $popup.find('.se-preview-content').text(result.prompt);

    if (result.warnings.length) {
        $popup.find('.se-build-warnings').html(
            result.warnings.map((w) => `<div class="se-warning-item">⚠️ ${w}</div>`).join('')
        );
    } else {
        $popup.find('.se-build-warnings').empty();
    }

    // 적용 버튼 활성화
    $popup.find('#se-btn-apply').prop('disabled', false);

    // 임시로 결과 저장 (적용 전 미리보기용)
    $popup.data('lastBuildResult', result);
}

/**
 * 적용 버튼 클릭 시 채팅에 저장 + 주입.
 */
function runApply() {
    const $popup = $('#style-engine-popup');
    let result = $popup.data('lastBuildResult');

    if (!result) {
        // 빌드 없이 바로 적용 버튼 누른 경우
        result = buildFromLoadedData(
            _state.selectedModules,
            _state.selectedConfigs,
            _loadedData
        );
    }

    applyBuild(result);
    updateBuildSummary();

    // 성공 피드백
    const $applyBtn = $popup.find('#se-btn-apply');
    const origText = $applyBtn.text();
    $applyBtn.text('✓ 적용됨').addClass('se-btn-success');
    setTimeout(() => {
        $applyBtn.text(origText).removeClass('se-btn-success');
    }, 2000);
}

/**
 * 빌드 요약 텍스트 업데이트 (팝업 하단 + settings 패널).
 */
function updateBuildSummary() {
    const saved = loadBuildFromChat();
    const $popup = $('#style-engine-popup');

    if (saved && saved.modules && saved.modules.length) {
        const summary = `적용된 모듈: ${saved.modules.join(', ')}${saved.configs.length ? ' | 설정: ' + saved.configs.join(', ') : ''}`;
        $popup.find('.se-current-build').text(summary);
        // settings 패널도 업데이트
        $('#style-engine-current-build').text(summary);
        $('#style-engine-clear-btn').prop('disabled', false);
    } else {
        $popup.find('.se-current-build').text('적용된 빌드 없음');
        $('#style-engine-current-build').text('적용된 빌드 없음');
        $('#style-engine-clear-btn').prop('disabled', true);
    }
}

/**
 * settings 패널의 "빌드 초기화" 버튼 핸들러.
 */
export function clearCurrentBuild() {
    clearBuildFromChat();
    updateBuildSummary();
}

/**
 * 채팅 전환 시 UI 상태 갱신.
 */
export function onChatChanged() {
    const saved = loadBuildFromChat();
    if (saved) {
        _state.selectedModules = saved.modules || [];
        _state.selectedConfigs = saved.configs || [];
    } else {
        _state.selectedModules = [];
        _state.selectedConfigs = [];
    }
    updateBuildSummary();

    // 팝업이 열려있으면 UI도 갱신
    if ($('#style-engine-popup').is(':visible')) {
        const activeAxis = $('#style-engine-popup').find('.se-tab-btn.active').data('axis');
        if (activeAxis) activateTab(activeAxis);
        renderConfigSection($('#style-engine-popup'), _loadedData?.catalog);
        updateConflictDisplay();
    }
}

/**
 * standalone 창에서 온 postMessage 처리.
 */
function _handleStandaloneMessage(event) {
    if (!event.data || event.data.source !== 'style-engine-standalone') return;
    if (event.origin !== window.location.origin) return;

    if (event.data.type === 'apply') {
        applyBuild(event.data.result);
        updateBuildSummary();
    } else if (event.data.type === 'stateChange') {
        _state.selectedModules = event.data.state.selectedModules || [];
        _state.selectedConfigs = event.data.state.selectedConfigs || [];
    }
}

/**
 * popup-standalone.html을 새 브라우저 창으로 열기.
 * 부모 창의 데이터를 window._styleEngineForStandalone으로 노출하고,
 * 자식 창이 postMessage로 결과를 돌려보내면 부모에서 반영한다.
 */
export async function openPopupInNewWindow() {
    await ensureDataLoaded();

    // 이미 열려있으면 포커스
    if (_standaloneWindow && !_standaloneWindow.closed) {
        _standaloneWindow.focus();
        return;
    }

    const root = await getExtensionRoot();
    const url = `/${root}/popup-standalone.html`;

    // 부모 창에 데이터/상태 노출 (자식 창이 window.opener로 접근)
    window._styleEngineForStandalone = {
        loadedData: _loadedData,
        state: { ..._state },
    };

    _standaloneWindow = window.open(
        url,
        'style-engine-popup',
        'width=1100,height=750,resizable=yes,scrollbars=yes'
    );

    if (!_standaloneWindow) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제해 주세요.', 'Style Engine');
        } else {
            console.warn('[StyleEngine] Popup window was blocked by the browser.');
        }
        return;
    }

    // standalone 창에서 오는 메시지 수신 등록 (중복 방지)
    window.removeEventListener('message', _handleStandaloneMessage);
    window.addEventListener('message', _handleStandaloneMessage);
}
