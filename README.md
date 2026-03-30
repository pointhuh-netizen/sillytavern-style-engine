# SillyTavern Style Engine

SillyTavern용 모듈형 프롬프트 아키텍처. 기본틀(Default Template) 위에 Config(독립 설정) → A~G축(단일 차원)을 순서대로 오버레이하여 문체를 조합하는 2계층 시스템.

---

## 아키텍처

```
sillytavern-style-engine/
├── core/
│   ├── default-template.json     ← 기본 문체 ("외부 관찰형"), 8개 MODULE, 슬롯 시스템
│   └── master-rules.json         ← 불변 규칙 (core_directives, forbidden 패턴/어휘/대사)
├── configs/
│   ├── user-character-control.json ← 유저 캐릭터 제어 (RP/사칭/사용안함)
│   └── nsfw-rating.json            ← NSFW 등급 제어 (SFW~R18)
├── axes/
│   ├── axis-a-pov.json            ← A축: 시점. A-00~A-06
│   ├── axis-s-narration.json      ← S축: 서술 방식. S-00~S-14
│   ├── axis-b-tone.json           ← B축: 어조·어휘. B-00~B-08
│   ├── axis-c-genre.json          ← C축: 장르. C-01~C-12
│   ├── axis-d-mood.json           ← D축: 분위기. D-01~D-16
│   ├── axis-e-setting.json        ← E축: 배경. E-01~E-15
│   ├── axis-f-special.json        ← F축: 특별 요소. F-01~F-03
│   └── axis-g-interaction.json    ← G축: 상호작용. G-01~G-03, G-10~G-24
├── meta/
│   ├── catalog.json               ← UI 카탈로그 (모든 축/모듈 등록)
│   ├── config-schema.json         ← 독립 설정 레지스트리
│   ├── trait-schema.json           ← 모듈 특성(traits) 스키마 정의
│   └── combinations.json          ← 조합 자동 충돌 감지 규칙
└── presets/
    └── .gitkeep                   ← 인기 조합 저장 (향후)
```

---

## 2계층 구조

| 계층 | 유형 | 역할 | 선택 방식 |
|---|---|---|---|
| **0계층** | **Config** | 축과 독립적으로 작동하는 빌드 레벨 설정. 모든 축에 걸쳐 적용되는 근본 규칙 결정 | 각 config별 MUTEX |
| **1계층** | **A** | 시점. 누가 보는가/말하는가 — 1인칭, 2인칭, 3인칭 제한, 전지적, 공간, 사물 | MUTEX |
| **1계층** | **S** | 서술 방식. 어떻게 서술하는가 — 동화적, 무협적, 서간체 등 | MUTEX |
| **1계층** | **B** | 어조·어휘 결정 | MUTEX |
| **1계층** | **C~G** | 장르·분위기·배경·특별 요소·상호작용 미세 조정 | COMBINABLE |

**핵심 원칙:** Config가 빌드의 근본 규칙을 결정 → A축이 default-template 위에 서술 방식 전체를 설정 → B~G축이 그 위에서 원하는 차원만 미세 조정.

---

## 빌드 순서

```
configs → A → S → B → C → D → E → F → G
```

1. `default-template.json` 로드 (모든 슬롯에 기본값)
2. `master-rules.json` 로드 (항상 포함)
3. **Config** 적용 (유저 캐릭터 제어 등 근본 설정)
4. **A축** 모듈 적용 (시점 — 1인칭/2인칭/3인칭 제한/전지적/공간/사물)
5. **S축** 모듈 적용 (서술 방식 — 동화/무협/서간체 등)
6. **B축** 모듈 적용 (어조·어휘)
7. **C~G축** 모듈 적용 (각 차원 미세 조정)
8. `check_operations` 병합 (ADD/REPLACE/REMOVE)
9. 충돌 검사 (`combinations.json` 참조)
10. 최종 프롬프트 조립 → SillyTavern 주입

---

## Config 시스템 (0계층)

Config는 축(axis)과 달리 슬롯을 직접 건드리는 것이 아니라, **빌드 시 적용되는 근본 규칙**을 결정합니다.

### Config vs Axis 차이

| 특성 | Config (0계층) | Axis (1~2계층) |
|---|---|---|
| 빌드 시점 | 축보다 **먼저** 적용 | Config 이후 적용 |
| 작동 방식 | injections (주입), master-rules override | operations (슬롯 교체/추가) |
| 영향 범위 | 모든 축에 걸쳐 작동 | 자기 슬롯만 또는 N축처럼 복합 |
| 파일 위치 | `configs/` 디렉토리 | `axes/` 디렉토리 |
| 적용 기준 | 모든 문체 조합에서 동일하게 적용 | 문체에 따라 달라짐 |

### 현재 Config 목록

| ID | 이름 | 파일 | 모드 수 |
|---|---|---|---|
| user_character_control | 유저 캐릭터 제어 🎭 | `configs/user-character-control.json` | 3 (UCC-00, UCC-01, UCC-02) |
| nsfw_rating | NSFW 등급 제어 🔞 | `configs/nsfw-rating.json` | 5 (NSFW-00~NSFW-04) |

### 유저 캐릭터 제어 (user_character_control)

AI가 유저 캐릭터({{user}})를 어떻게 다루는지 결정합니다.

| 모드 | ID | 설명 |
|---|---|---|
| **사용하지 않음** | UCC-00 | 유저 캐릭터 제어 지시를 주입하지 않음. 기존 프롬프트/설정을 그대로 사용 |
| **RP 모드** | UCC-01 | {{user}}의 행동·내면·대사는 유저만 결정. AI는 NPC만 서술. `master-rules.json`의 `godmoding_rule` 강화 |
| **사칭 모드** | UCC-02 | AI가 {{user}}도 소설 속 인물처럼 자율 서술. 행동·내면·대사 모두 AI가 생성 가능. `godmoding_rule` 해제 |

**Config 포맷:**

```json
{
  "config": "config_key",
  "type": "mutex",
  "build_priority": -1,
  "modes": [
    {
      "id": "UCC-01",
      "name": "RP 모드",
      "operations": { },
      "injections": {
        "preamble_core_directives_add": ["..."],
        "static_MODULE_1_VOICE_add": ["..."],
        "master_rules_godmoding_override": "..."
      },
      "check_operations": [ ]
    }
  ]
}
```

**Injection 타입:**

| injection key | 설명 |
|---|---|
| `preamble_core_directives_add` | `master-rules.json`의 `core_directives` 배열에 항목 추가 |
| `static_MODULE_1_VOICE_add` | MODULE_1_VOICE의 static 배열에 항목 추가 |
| `master_rules_godmoding_override` | `master-rules.json`의 `godmoding_rule`을 교체. `null`이면 해당 규칙 비활성화 |

---

### NSFW 등급 제어 (nsfw_rating)

AI가 생성하는 콘텐츠의 성적·폭력 묘사 수위를 결정합니다.

| 모드 | ID | 설명 |
|---|---|---|
| **사용하지 않음** | NSFW-00 | NSFW 등급 제어 지시를 주입하지 않음. 기존 SFW 12+ 설정 그대로 |
| **SFW 전연령** | NSFW-01 | 성적·폭력 묘사 완전 차단. 신체 접촉은 손잡기·포옹까지만 |
| **Suggestive** | NSFW-02 | 암시·긴장감·키스·밀착까지 허용. 직접 묘사 금지. fade to black 허용 |
| **NSFW** | NSFW-03 | 성적·폭력 직접 묘사 허용. 감각 중심 서술 권장. 과잉·비하 금지 |
| **R18** | NSFW-04 | 묘사 제한 없음. `NO_MISOGYNY` 규칙만 유지 |

**작동 방식:**
- `{B_TONE_VOCAB}` 슬롯을 모드별로 REPLACE하여 어휘 수준 설정
- `preamble_core_directives_add`로 `[CONTENT_RATING_*]` 디렉티브 주입
- NSFW-01은 `master_rules_forbidden_vocabulary_add`로 추가 금지 어휘 주입
- NSFW-04는 `master_rules_forbidden_vocabulary_remove_all_nsfw`로 NSFW 관련 금지 해제
- 모든 등급에서 `[NO_MISOGYNY]` 규칙은 유지됨

---

## Traits 시스템

각 모듈은 `traits` 필드를 가진다. traits는 모듈의 결과물 특성을 구조화된 태그로 표현하여, 모듈 조합 시 자동 충돌 감지에 사용된다.

### 주요 traits

| trait | 설명 | 적용 축 |
|---|---|---|
| `pov` | 시점 | A |
| `inner_access` | 인물 내면 접근 수준 | A |
| `fid` | FID 사용 범위 | A |
| `emotion_level` | 감정 표현 허용 수준 | A, B |
| `sentence_length` | 지배적 문장 길이 | A, B |
| `sensory_anchor` | 감각 우선순위의 앵커 | A |
| `formality` | 격식 수준 | B |
| `irony` | 아이러니/냉소 사용 여부 | B |
| `lyricism` | 서정성 수준 | B |
| `narrator_presence` | 서술자 존재감 | A, B |
| `personification` | 의인화 허용 수준 | A, B, F |
| `temporal_mode` | 시간 구조 | A |
| `slots_touched` | 교체/추가하는 슬롯 목록 | 전체 |

### 충돌 감지

`meta/combinations.json`의 `auto_rules`가 traits를 비교하여 충돌을 감지한다:

- **error**: 조합 불가 (시점 충돌, FID 충돌, 서술자/1인칭 충돌)
- **warning**: 조합 가능하나 빌드 순서 주의 (문장 길이 충돌, 서정성 충돌, 의인화 충돌)
- **info**: 참고 사항 (슬롯 겹침, 감정 이중 억제)

### 제어 원칙

의인화 같은 규칙은 **독립 토글이 아니라 시점(A축) 선택의 부산물**이다:
- A-05(공간 시점), A-06(사물 시점) 선택 시 의인화 금지가 자동으로 적용
- 문체적 수사로 허용하고 싶으면 B축/F축에서 미세 조정
- 빌드 순서(A→B)로 우선순위 해소: A축이 금지하면 B축이 허용해도 A축 우선

---

## 축별 슬롯 맵

| 축 | 건드리는 슬롯 | 위치 |
|---|---|---|
| **A** | `{A_VOICE_POV_RATIO}`, `{A_VOICE_FID_STYLE}`, `{A_VOICE_STYLE_REF}`, `{A_PROSE_RHYTHM}`, `{A_PROSE_SENSORY}`, `{A_PROSE_DESCRIPTION}`, `{A_PROSE_CAUSALITY}`, `{A_PROSE_TIME_DENSITY}`, `{A_PROSE_PACING}`, `{A_PROSE_DWELL}`, `{A_PROSE_MEDITATIVE}`, `{A_PROSE_PHYSICAL_DISTANCE}` | MODULE_1_VOICE, MODULE_2_PROSE |
| **S** | `{A_PROSE_RHYTHM}`, `{A_PROSE_SENSORY}`, `{A_PROSE_DESCRIPTION}`, `{A_PROSE_CAUSALITY}`, `{A_PROSE_TIME_DENSITY}`, `{A_PROSE_PACING}`, `{A_PROSE_DWELL}`, `{A_PROSE_MEDITATIVE}`, `{A_PROSE_PHYSICAL_DISTANCE}`, `{B_TONE_TEMP}`, `{B_TONE_VOCAB}`, `{B_TONE_ENDING}`, `{D_PROSE_MOOD}` + S-02는 `{B_TONE_FID_GRAMMAR}`, `{B_TONE_DIALOGUE_TAG}` 추가, S-03은 `{C_DLG_GENRE_STYLE}` 추가; static_overrides, preamble_overrides | MODULE_2_PROSE, MODULE_7_TONE, MODULE_2_PROSE |
| **B** | `{B_TONE_TEMP}`, `{B_TONE_VOCAB}`, `{B_TONE_FID_GRAMMAR}`, `{B_TONE_ENDING}`, `{B_TONE_DIALOGUE_TAG}` | MODULE_7_TONE |
| **C** | `{C_NARR_GENRE_VARS}`, `{C_DLG_GENRE_STYLE}` | MODULE_4_NARRATIVE, MODULE_5_DIALOGUE |
| **D** | `{D_PROSE_MOOD}` | MODULE_2_PROSE |
| **E** | `{E_NARR_SETTING_VARS}` | MODULE_4_NARRATIVE |
| **F** | `{F_COG_QUIRKS}`, `{F_SPEC_EXTRA}` | MODULE_3_COGNITIVE, MODULE_6_SPECIFICITY |
| **G** | `{G_COG_DISTANCE}`, `{G_NARR_INITIATIVE}`, `{G_NARR_NPC_NETWORK}`, `{G_DLG_INCOMPLETE}` | MODULE_3_COGNITIVE, MODULE_4_NARRATIVE, MODULE_5_DIALOGUE |

---

## 모듈 완성 상태

| 축 | ID | 이름 | 상태 |
|---|---|---|---|
| **Config** | UCC-00~02 | 유저 캐릭터 제어 | ✅ 완성 |
| **Config** | NSFW-00~04 | NSFW 등급 제어 | ✅ 완성 |
| **A** | A-00 | 사용하지 않음 | ✅ 완성 |
| **A** | A-01 | 1인칭 체험형 | ✅ 완성 |
| **A** | A-02 | 2인칭 관찰 밀착형 | ✅ 완성 |
| **A** | A-03 | 3인칭 제한 관찰자 | ✅ 완성 (기본값 사용) |
| **A** | A-04 | 전지적 작가 시점 | ✅ 완성 |
| **A** | A-05 | 공간 시점 | ✅ 완성 |
| **A** | A-06 | 사물 시점 | ✅ 완성 |
| **S** | S-00 | 사용하지 않음 | ✅ 완성 |
| **S** | S-01 | 동화적 서술 | ✅ 완성 |
| **S** | S-02 | 무협적 서술 | ✅ 완성 |
| **S** | S-03 | 서간체 | ✅ 완성 |
| **S** | S-04 | 극본체 | ✅ 완성 |
| **S** | S-05 | 기록체 | ✅ 완성 |
| **S** | S-06 | 구술체 | ✅ 완성 |
| **S** | S-07 | 회상체 | ✅ 완성 |
| **S** | S-08 | 몽타주 | ✅ 완성 |
| **S** | S-09 | 의식의 흐름 | ✅ 완성 |
| **S** | S-10 | 신뢰할 수 없는 서술자 | ✅ 완성 |
| **S** | S-11 | 다성 서술 | ✅ 완성 |
| **S** | S-12 | 일기체 | ✅ 완성 |
| **S** | S-13 | 실시간 중계체 | ✅ 완성 |
| **S** | S-14 | 사관 기록체 | ✅ 완성 |
| **B** | B-00 | 사용하지 않음 | ✅ 완성 |
| **B** | B-01 | 건조체 | ✅ 완성 |
| **B** | B-02 | 서정체 | ✅ 완성 |
| **B** | B-03 | 구어체 | ✅ 완성 |
| **B** | B-04 | 만연체 | ✅ 완성 |
| **B** | B-05 | 간결체 | ✅ 완성 |
| **B** | B-06 | 냉소체 | ✅ 완성 |
| **B** | B-07 | 고풍체 | ✅ 완성 |
| **B** | B-08 | 사극투 | ✅ 완성 |
| **C** | C-01 | 궁정 정치 / 전쟁 서사 | ✅ 완성 |
| **C** | C-02 | 추리 색채 | ✅ 완성 |
| **C** | C-03 | 동화/우화 | ✅ 완성 |
| **C** | C-04 | 무협 | ✅ 완성 |
| **C** | C-05 | 심리 스릴러 | ✅ 완성 |
| **C** | C-06 | 로맨스 | ✅ 완성 |
| **C** | C-07 | SF/사이버펑크 | ✅ 완성 |
| **C** | C-08 | 호러 | ✅ 완성 |
| **C** | C-09 | 코미디/시트콤 | ✅ 완성 |
| **C** | C-10 | 다크 판타지 | ✅ 완성 |
| **C** | C-11 | 일상 | ✅ 완성 |
| **C** | C-12 | 느와르 | ✅ 완성 |
| **D** | D-01~D-16 | 감각적 일상, 불안/불길, 공포/엄습, 압박/질식, 적막/폐허, 우울/침잠, 명상/고독, 몽환/비현실, 환각/왜곡, 축제/고양, 전투 고조, 희열/도취, 노스탤지어, 서정적 비, 새벽/경계시간, 폭풍 전야 | ✅ 완성 |
| **E** | E-01 | 전근대 궁정 / 고대 세계 | ✅ 완성 |
| **E** | E-02 | 강호/무림 세계 | ✅ 완성 |
| **F** | F-01 | 비인간 종족 체계 | ✅ 완성 |
| **F** | F-02 | 마법 체계 | ✅ 완성 |
| **F** | F-03 | 기술 레벨 오버라이드 | ✅ 완성 |
| **G** | G-01 | 능동형 | ✅ 완성 |
| **G** | G-02 | 수동형 | ✅ 완성 |
| **G** | G-03 | 대등형 | ✅ 완성 |
| **G** | G-10 | 현실적 | ✅ 완성 |
| **G** | G-11 | 다정한 | ✅ 완성 |
| **G** | G-12 | 사랑스러운 | ✅ 완성 |
| **G** | G-13 | 수상한 | ✅ 완성 |
| **G** | G-14 | 공격적 | ✅ 완성 |
| **G** | G-15 | 냉담한 | ✅ 완성 |
| **G** | G-16 | 호기심 | ✅ 완성 |
| **G** | G-17 | 장난기 | ✅ 완성 |
| **G** | G-18 | 순응적 | ✅ 완성 |
| **G** | G-19 | 복종 | ✅ 완성 |
| **G** | G-20 | 보호 | ✅ 완성 |
| **G** | G-21 | 조언 | ✅ 완성 |
| **G** | G-22 | 경쟁 | ✅ 완성 |
| **G** | G-23 | 지배 | ✅ 완성 |
| **G** | G-24 | 후견 | ✅ 완성 |

---

## 다음 할 일 (우선순위 순)

- [x] **[HIGH] B축 포맷 정비**: `override_mode` + `module_overrides.MODULE_6_STYLE` 구조 → `operations` + `check_operations` 구조로 전환. ✅ 완료
- [x] **[HIGH] catalog.json에 B축 모듈 등록**: B-00~B-07 등록 ✅ 완료
- [x] **[HIGH] Config 시스템 신설**: 축과 독립적인 빌드 레벨 설정. 유저 캐릭터 제어(UCC-00~02) 추가 ✅ 완료
- [x] **[HIGH] NSFW 등급 제어 Config**: NSFW-00(사용안함)~NSFW-04(R18) 5단계 등급 제어 ✅ 완료
- [x] **[HIGH] 기존 하드코딩 마이그레이션**: `master-rules.json`의 `godmoding_rule`을 `null`(중립)로 전환. ✅ 완료
- [x] **[HIGH] N축 해체 — A/C/E축으로 분산**: 3계층 → 2계층 단순화. A-07(동화적 서술), A-08(무협적 서술), A-09(서간체), C-03(동화/우화), C-04(무협), E-02(강호/무림 세계) ✅ 완료
- [x] **[HIGH] S축 분리**: A축에서 서술 방식 모듈(A-07/A-08/A-09) 분리 → S축(S-00~S-03) 신설. A축은 순수 시점만 유지. ✅ 완료
- [x] **[MED] S축 확장**: S-04(극본체), S-05(기록체), S-06(구술체), S-07(회상체), S-08(몽타주) 추가. ✅ 완료
- [x] **[MED] S축 2차 확장**: S-09(의식의 흐름), S-10(신뢰할 수 없는 서술자), S-11(다성 서술), S-12(일기체), S-13(실시간 중계체), S-14(사관 기록체) 추가. B-08(사극투) 추가. ✅ 완료
- [x] **[HIGH] C-05 심리 스릴러 추가**: 표면 아래의 전쟁. 일상의 외피 속 심리 권력 교전. ✅ 완료
- [x] **[MED] C축 장르 모듈 작성**: C-01 궁정 정치/전쟁 서사, C-02 추리 색채 ✅ 완료
- [x] **[향후] C축 장르 모듈 확장**: C-06(로맨스), C-07(SF/사이버펑크), C-08(호러), C-09(코미디/시트콤), C-10(다크 판타지), C-11(일상), C-12(느와르) 7개 신규 모듈 추가. ✅ 완료
- [x] **[MED] D축 분위기 모듈 작성**: D-01 감각적 일상 ✅ 완료
- [x] **[HIGH] D축 분위기 모듈 확장**: D-02(불안/불길)~D-16(폭풍 전야) 15개 신규 모듈 추가. 고요/내성, 긴장/위협, 몽환/초현실, 고양/에너지, 서정/감성 5개 카테고리. ✅ 완료
- [x] **[MED] E축 배경 모듈 작성**: E-01 전근대 궁정/고대 세계, E-02 강호/무림 세계 ✅ 완료
- [x] **[HIGH] E축 확장 2차**: E-08(여행/방랑), E-10(이세계/이계), E-11(포스트아포칼립스), E-12(우주/우주선), E-13(빈민가/하층 사회), E-14(전쟁터/전장), E-15(귀족 사교계) 7개 신규 모듈 추가. ✅ 완료
- [x] **[MED] F축 특별 요소 모듈 작성**: F-01 비인간 종족 체계, F-02 마법 체계, F-03 기술 레벨 오버라이드 ✅ 완료
- [x] **[LOW] combinations.json 채우기**: traits 기반 자동 충돌 감지 규칙 등록 ✅ 완료
- [x] **[LOW] G축 상호작용 모듈 작성**: G-01(능동형), G-02(수동형), G-03(대등형), G-10(현실적), G-11(다정한), G-12(사랑스러운), G-13(수상한), G-14(공격적), G-15(냉담한), G-16(호기심) ✅ 완료
- [x] **[LOW] G축 3개 모듈 추가**: G-17(장난기), G-18(순응적), G-19(복종 — 카테고리 ③ 권력 구조) ✅ 완료
- [x] **[LOW] G축 5개 모듈 추가**: G-20(보호), G-21(조언), G-22(경쟁), G-23(지배), G-24(후견) — 카테고리 ③ 권력 구조 확장 ✅ 완료
- [ ] **[LOW] presets/ 채우기**: 인기 조합 저장

---

## 모듈 포맷 설명

### Config 포맷

Config는 `configs/` 디렉토리에 위치하며, 축과 독립적으로 빌드의 근본 규칙을 결정한다:

```json
{
  "config": "config_key",
  "type": "mutex",
  "build_priority": -1,
  "modes": [
    {
      "id": "UCC-01",
      "name": "RP 모드",
      "one_liner": "UI 한줄 설명",
      "operations": { },
      "injections": {
        "preamble_core_directives_add": ["core_directives에 추가할 항목"],
        "static_MODULE_1_VOICE_add": ["MODULE_1_VOICE static에 추가할 항목"],
        "master_rules_godmoding_override": "godmoding_rule 교체값 (null이면 비활성화)"
      },
      "check_operations": [ ]
    }
  ]
}
```

**Config는 축(axis)과 다르게:**
- `injections` 필드를 사용하여 core/, master-rules 레벨에 직접 주입
- `operations`도 사용 가능하지만 주로 `injections`으로 작동
- `build_priority: -1`로 모든 축보다 먼저 적용

### A~G축 모듈 포맷

A~G축은 **단일 차원** 조정이므로, 자기 접두사 슬롯만 건드린다. 단, S-01(동화적 서술), S-02(무협적 서술), S-03(서간체) 같은 서술 방식 모듈은 B축/D축 슬롯, `static_overrides`, `preamble_overrides`, `persona` 등을 함께 교체한다:

```json
{
  "id": "A-01",
  "name": "1인칭 체험형",
  "one_liner": "UI에 표시될 한줄 설명",
  "operations": {
    "{A_VOICE_POV_RATIO}": { "mode": "REPLACE", "value": "..." },
    "{A_PROSE_RHYTHM}": { "mode": "REPLACE", "value": "..." }
  },
  "check_operations": [
    { "mode": "ADD", "check": { "id": "CHK-A01-01", "category": "pov", "rule": "...", "source": "A-01" } },
    { "mode": "REPLACE", "target_id": "CHK-40", "reason": "...", "check": { "..." : "..." } }
  ],
  "master_guide_delta": { "..." : "..." },
  "known_conflicts": [ "..." ]
}
```

**오버레이 모드:**

| 모드 | 설명 | 용도 |
|---|---|---|
| REPLACE | 기본값을 완전히 대체 | A/N축(MUTEX), 기본값과 양립 불가한 경우 |
| APPEND | 기본값 뒤에 내용 추가 | B~G축(COMBINABLE)에서 정보를 덧붙일 때 |
| COEXIST | 기본값과 나란히 병렬 배치 | 기존 규칙 유지하면서 추가 규칙을 병렬로 둘 때 |

**Self-Check 병합 모드:**

| 모드 | 설명 |
|---|---|
| ADD | 새 검수 항목 추가 |
| REPLACE | 기존 항목(target_id)을 새 버전으로 교체 |
| REMOVE | 기존 항목(target_id) 제거 |

---

## 설계 결정 기록

### Config vs Axis 판단 기준

새로운 설정을 추가할 때, 축(axis)으로 넣을지 config로 넣을지 판단하는 기준:

| 질문 | Config | Axis |
|---|---|---|
| 특정 슬롯만 교체하는가? | ❌ | ✅ |
| 모든 축에 걸쳐 작동하는가? | ✅ | ❌ |
| 빌드 규칙 자체를 바꾸는가? | ✅ | ❌ |
| core_directives/master-rules를 건드리는가? | ✅ | ❌ |
| 문체/장르/분위기에 따라 달라지는가? | ❌ | ✅ |

### 유저 캐릭터 제어를 Config로 만든 이유

- 모든 S축 모듈(동화적 서술, 무협적 서술, 서간체 등)과 A축 모듈(시점)에서 동일하게 적용되어야 함
- 모든 시점에서 동일하게 적용되어야 함
- `master-rules.json`의 `godmoding_rule`을 직접 교체해야 함
- 슬롯 교체가 아니라 빌드 규칙 자체의 변경

### 향후 Config 후보 (검토 필요)

| 후보 | 설명 | Config 적합성 |
|---|---|---|
| NSFW 등급 제어 | SFW/NSFW/R18 등급 설정 | ✅ 높음 — 모든 축에 걸쳐 어휘·묘사 수위 결정 |
| 출력 길이 제어 | 짧게/보통/길게 | ⚠️ 중간 — B축과 겹칠 수 있음 |
| 언어 설정 | 한국어/영어/일본어 | ✅ 높음 — 모든 축에 걸쳐 언어 결정 |

---

### 다국어 지원 분석 (현재 미착수)

현재 시스템은 **한국어에 극도로 특화**되어 있어, 단순 Config 하나로 언어 전환이 불가능합니다.

#### 한국어에 묶여 있는 요소 (전수 조사)

| 위치 | 한국어 전용 규칙 | 다국어 시 문제 |
|---|---|---|
| `master-rules.json` > `forbidden_vocabulary` | "킬킬→낮게 웃었다" 등 한국어 어휘 매핑 8쌍 | 영어/일본어에는 해당 없음. 언어별 매핑 필요 |
| `master-rules.json` > `forbidden_patterns` | "~다는 듯", "다정함" 등 한국어 문법 패턴 | 영어에 대응 패턴이 완전히 다름 |
| `master-rules.json` > `dialogue_constraints` | "~하시네", "~든지" 등 한국어 어미 기반 | 영어는 어미가 없으므로 벡터 자체를 재설계 |
| `default-template.json` > `{B_TONE_ENDING}` | "~았다/었다 3연속 금지" 한국어 종결어미 | 영어 past tense 반복 문제는 완전히 다른 규칙 |
| `default-template.json` > `{B_TONE_FID_GRAMMAR}` | "3인칭 과거형, 괄호 금지" | 영어 FID는 tense shifting이 핵심 |
| `default-template.json` > `{A_PROSE_RHYTHM}` | "단문 ~20자, 중문 30~50자, 장문 50~70자" | 영어는 단어 수 기준, 일본어는 또 다름 |
| `MODULE_2_PROSE` static | "70자 초과 문장 분할" | 영어는 ~25 words, 일본어는 ~40자 정도 |
| `preamble.style_reference` | "윤성희, 정세랑, 최은영, 김연수" | 영어면 Hemingway, Munro 등 완전히 다른 참조 |
| B축 전체 | 건조체/서정체/구어체/만연체/간결체/냉소체/고풍체 | 영어: Laconic/Lyrical/Colloquial/Ornate 등 재설계 필요 |
| N축 모듈들 | 동화체의 "~했단다" 어미, 서간체의 경어 패턴 | 언어별 완전 재작성 필요 |

#### 결론

다국어 = "언어 설정 Config 1개"가 아니라 **"언어별 core + axes + meta 세트 통째로"**에 가까움.

#### 향후 접근법 (미확정)

```
sillytavern-style-engine/
├── core/              ← 언어 중립 구조 (build_order, 모듈 골격)
├── locales/
│   └── ko/            ← 한국어 전용 데이터 (현재 axes/, meta/의 내용물)
│   └── en/            ← 영어 (향후)
│   └── ja/            ← 일본어 (향후)
```

현재는 한국어 품질에 집중하며, `locales/` 리팩토링은 C~G축 완성 후 검토.

---

## 알려진 문제

- ~~**하드코딩 마이그레이션 미완료**~~ ✅ 완료. `master-rules.json`의 `godmoding_rule`과 A축의 유저 캐릭터 관련 지시가 UCC config 의존으로 전환됨.
- ~~**`master-rules.json`의 `godmoding_rule`**~~: ✅ 완료. `null`(중립)로 전환되어 UCC-00(사용안함) 선택 시 godmoding 제한 없음.

---

## 변경 이력

| 버전 | 내용 |
|---|---|
| 초기 | A-00~A-06, B-00~B-07 작성. catalog.json에 A축만 등록 |
| N축 추가 | **N축(서사 모드) 신설**: N-00(사용하지 않음), N-01(동화/우화), N-02(서간체). `default-template.json`에 `build_order` 추가. A-07 서간체를 N-02로 이동. catalog.json에 N축 등록 |
| B축 재작성 | **B축 전면 재작성**: B-00~B-07을 `operations` + `check_operations` + `master_guide_delta` + `known_conflicts` 표준 포맷으로 재작성. `override_mode`/`preamble_overrides`/`module_overrides` 비표준 구조 제거. `{B_TONE_TEMP}`, `{B_TONE_VOCAB}`, `{B_TONE_FID_GRAMMAR}`, `{B_TONE_ENDING}`, `{B_TONE_DIALOGUE_TAG}` 슬롯 연결. catalog.json에 B-00~B-07 등록 |
| N-03 추가 | **N-03(시간 루프) 신설**: 반복 서사 복합 문체. `temporal_mode: "loop"` trait 값 추가. catalog.json에 N-03 등록 |
| N-04 추가 | **N-04(무협) 신설**: 김용식 강호 서사 복합 문체. 무공 체계, 강호 생태계, 초식 리듬 시스템. 별도 PR 진행 중 |
| Config 신설 | **Config 시스템(0계층) 신설**: 축과 독립적인 빌드 레벨 설정. `configs/` 디렉토리, `meta/config-schema.json` 추가. 첫 번째 config으로 유저 캐릭터 제어(UCC-00~02) 추가. `default-template.json`의 `build_order`에 `"configs"` 항목 추가 |
| NSFW Config 추가 | **NSFW 등급 제어 Config 신설**: NSFW-00(사용안함)~NSFW-04(R18) 5단계. `{B_TONE_VOCAB}` 슬롯 오버라이드 + `[CONTENT_RATING_*]` 디렉티브 주입. config-schema.json, catalog.json 등록. 다국어 지원 분석 기록 추가 |
| C축 추가 | **C-02(추리 색채) 신설**: 추리 장르 변수(증거, 증언, 탐문) 경량 모듈. C-01(궁정 정치/전쟁 서사) README 반영. catalog.json에 C-02 등록 |
| C축 확장 | **C-06~C-12 신설** (7개): C-06(로맨스), C-07(SF/사이버펑크), C-08(호러), C-09(코미디/시트콤), C-10(다크 판타지), C-11(일상), C-12(느와르). trait-schema에 `sf` temporal_mode, `tactile-thermal`/`auditory-tactile` sensory_anchor, `expressive` emotion_level, `informal` formality 값 추가. combinations.json에 19개 조합 규칙 추가. C-04 known_conflicts 버그 수정(A-08→S-02), C-02 N-04 참조 제거. |
| 하드코딩 마이그레이션 | **godmoding_rule 중립화**: `master-rules.json`의 `godmoding_rule`을 `null`로 전환, UCC config 의존. `default-template.json`의 MODULE_1_VOICE static 업데이트. A-01/A-02의 유저 캐릭터 하드코딩을 UCC 의존으로 전환. A-05는 시점 본질 제약으로 유지 |
| S축 분리 | **S축(서술 방식) 신설**: A-07(동화적 서술)→S-01, A-08(무협적 서술)→S-02, A-09(서간체)→S-03. A축은 순수 시점(A-00~A-06)만 유지. `axis-s-narration.json` 신규 생성. 빌드 순서 `configs → A → S → B → C → D → E → F → G`로 업데이트. combinations.json 규칙 ID 업데이트(N-01→S-01, N-04→S-02) 및 A-06+S-03, A-05+S-03 충돌 규칙 추가. |
| F축 추가 + combinations | **F축(특별 요소) 신설**: F-01(비인간 종족 체계), F-02(마법 체계), F-03(기술 레벨 오버라이드). catalog.json 등록. **combinations.json**: traits 기반 자동 충돌 감지 규칙 13개(error 3, warning 6, info 4) 채움 |
| D축 추가 | **D-01(감성/로맨스) 신설**: 감각 밀도·내면 접근·문체 온도 파라미터 튜닝으로 감성적 분위기 조성. 서술 문법은 유지. catalog.json에 D-01 등록 |
| D축 확장 | **D-02~D-16 신설**: 긴장/위협(불안/불길, 공포/엄습, 압박/질식, 폭풍 전야), 고요/내성(적막/폐허, 우울/침잠, 명상/고독), 몽환/초현실(몽환/비현실, 환각/왜곡), 고양/에너지(축제/고양, 전투 고조, 희열/도취), 서정/감성(노스탤지어, 서정적 비, 새벽/경계시간) 5개 카테고리 15개 모듈. `mood_category` trait 추가. 새 슬롯 `{D_MOOD_ANCHOR}`, `{D_SENSORY_PALETTE}`, `{D_RHYTHM_OVERRIDE}` 신설. |
| G축 추가 | **G축(상호작용) 10개 모듈 신설**: 카테고리 ① 서사 주도권(G-01 능동형, G-02 수동형, G-03 대등형) + 카테고리 ② NPC 반응 색채(G-10 현실적, G-11 다정한, G-12 사랑스러운, G-13 수상한, G-14 공격적, G-15 냉담한, G-16 호기심). `{G_NARR_INITIATIVE}`, `{G_NARR_NPC_NETWORK}`, `{G_DLG_INCOMPLETE}`, `{G_COG_DISTANCE}` 슬롯 정식 정의. combinations.json에 카테고리 ① MUTEX 및 G-10/G-13/G-15 시너지/주의 규칙 추가 |
| G축 확장 | **G축 3개 모듈 추가**: 카테고리 ② 반응색채 G-17(장난기), G-18(순응적) + 카테고리 ③ 권력 구조 G-19(복종). `{G_POWER_STRUCTURE}` 슬롯 신설. trait-schema.json에 `power_dynamic` trait 추가. |
| G축 권력 구조 확장 | **G축 5개 모듈 추가**: 카테고리 ③ 권력 구조 G-20(보호), G-21(조언), G-22(경쟁), G-23(지배), G-24(후견). `power_dynamic` enum 확장(protection/advisory/rivalry/domination/mentorship). G-19 known_conflicts에 신규 모듈 관계 추가. |

---

## 축 파일 분리 규칙

축 JSON 파일(axes/axis-*.json)은 단일 파일로 운영하되, 파일 크기가 100KB를 초과하면 디렉토리 구조로 분리한다.

### 기준
- 100KB 이하: 단일 파일 유지 (axes/axis-a-pov.json)
- 100KB 초과: 디렉토리로 분리 (axes/axis-a-pov/)

### 분리 후 구조
axes/
├── axis-a-pov/                    ← 분리된 축 (100KB 초과)
│   ├── _index.json                ← 축 메타데이터 + 모듈 파일 목록
│   ├── a-00-none.json
│   ├── a-01-first-person.json
│   └── ...
├── axis-b-tone.json               ← 단일 파일 유지 (100KB 이하)
└── ...

### _index.json 포맷
분리 시 _index.json은 기존 축 파일의 메타 필드를 유지하고, modules는 파일 참조로 대체:
{
  "axis": "A",
  "axis_name_ko": "시점",
  "axis_name_en": "POV",
  "type": "mutex",
  "module_files": [
    "a-00-none.json",
    "a-01-first-person.json",
    ...
  ]
}
각 모듈 파일은 기존 modules 배열의 개별 요소를 그대로 포함.

### catalog.json 반영
분리 시 catalog.json의 해당 모듈 file 필드를 개별 파일 경로로 업데이트:
{
  "id": "A-01",
  "file": "axes/axis-a-pov/a-01-first-person.json"
}

### 분리 시점 판단
- 모듈 추가 PR을 만들 때, 해당 축 파일의 변경 후 예상 크기가 100KB를 초과하면 같은 PR에서 분리를 수행
- 현재 파일 크기 참고 (2026-03-26 기준):
  - axis-s-narration.json: 약 32KB
  - axis-a-pov.json: 약 29KB
  - axis-c-genre.json: 약 52KB
  - axis-b-tone.json: 약 18KB
  - 나머지: 12KB 이하
