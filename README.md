# SillyTavern Style Engine

SillyTavern용 모듈형 프롬프트 스타일 엔진 확장.

데이터 파일은 [pointhuh-netizen/nov](https://github.com/pointhuh-netizen/nov) 레포에서 런타임으로 fetch합니다.  
축(axes) 데이터를 업데이트하려면 `nov` 레포만 수정하면 됩니다 — 이 확장은 항상 최신 데이터를 가져옵니다.

## 아키텍처

```
sillytavern-style-engine (이 레포)          pointhuh-netizen/nov (데이터)
┌──────────────────────────┐               ┌─────────────────────────────┐
│ index.js                 │               │ sillytavern-style-engine/   │
│ src/data-loader.js  ─────┼── fetch ────→ │   axes/*.json               │
│ src/build-engine.js      │               │   configs/*.json            │
│ src/conflict-detector.js │               │   core/*.json               │
│ src/ui-controller.js     │               │   meta/*.json               │
│ settings.html            │               └─────────────────────────────┘
│ popup.html               │
│ style.css                │
└──────────────────────────┘
```

## 설치

### SillyTavern 확장 관리자 사용 (권장)

1. SillyTavern을 실행합니다.
2. **확장(Extensions)** 패널을 엽니다 (퍼즐 아이콘 🧩).
3. **"Install Extension"** 버튼을 클릭합니다.
4. 아래 URL을 입력합니다:

```
https://github.com/pointhuh-netizen/sillytavern-style-engine
```

### 수동 설치

```bash
cd SillyTavern/data/default-user/extensions/
git clone https://github.com/pointhuh-netizen/sillytavern-style-engine
```

## 사용법

1. SillyTavern 확장 설정 패널에서 **Style Engine** 섹션을 찾습니다.
2. 각 축(A~G, S, W)의 모듈을 선택합니다.
   - **Mutex 축** (A, S, B, W): 하나만 선택 가능.
   - **Combinable 축** (C, D, E, F, G): 복수 선택 가능.
3. 전역 설정(NSFW 등급, 유저 캐릭터 제어)을 선택합니다.
4. **🔍 프리뷰** 버튼을 눌러 빌드된 프롬프트를 확인합니다.
5. **✅ 채팅에 적용** 버튼으로 현재 채팅에 적용합니다.

### 슬래시 커맨드

| 커맨드 | 설명 |
|---|---|
| `/style-build` | 현재 선택으로 프롬프트를 빌드하여 반환 |
| `/style-preview` | 프리뷰 팝업 열기 |
| `/style-clear` | 데이터 캐시 초기화 |

### 프리셋

선택 조합을 이름으로 저장하고 나중에 불러올 수 있습니다.  
프리셋은 `localStorage`에 저장됩니다.

## 데이터 소스

모든 데이터는 [`pointhuh-netizen/nov`](https://github.com/pointhuh-netizen/nov) 레포의 `sillytavern-style-engine/` 디렉토리에서 런타임으로 fetch됩니다.

```
sillytavern-style-engine/
├── axes/          ← 각 축의 모듈 정의 (axis-a-pov.json 등)
├── configs/       ← 전역 설정 (nsfw-rating.json, user-character-control.json 등)
├── core/          ← 기본 템플릿 및 마스터 룰
├── meta/          ← catalog, trait-schema, combinations
└── presets/       ← (예약)
```

### 오프라인 지원

한 번 성공적으로 로드된 데이터는 `localStorage`에 캐시됩니다.  
네트워크 연결이 없을 때 자동으로 캐시에서 복구합니다.

## 파일 구조

```
sillytavern-style-engine/
├── manifest.json          ← SillyTavern 확장 매니페스트
├── index.js               ← 진입점 (슬래시 커맨드 등록)
├── settings.html          ← 확장 설정 패널 HTML
├── popup.html             ← 프리뷰 팝업 HTML
├── style.css              ← 스타일시트
└── src/
    ├── data-loader.js     ← 런타임 fetch 데이터 로더
    ├── build-engine.js    ← 프롬프트 빌드 엔진
    ├── conflict-detector.js ← 충돌 감지
    └── ui-controller.js   ← UI 컨트롤러
```
