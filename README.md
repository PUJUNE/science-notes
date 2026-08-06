# 수학·물리·화학 노트

의료용 생체전극과 전도성 하이드로젤, 근전도 니들 전극, 전기수술기를 다루는 데 필요한
수학·물리·화학 이론을 분야별로 나누고, 각 이론을 조작 가능한 인터랙티브 위젯으로 구현한
정적 학습 사이트임.

## 구성

| 분야 | 페이지 | 다루는 내용 |
|---|---|---|
| 01 수학 | `pages/math-ode.html` | 변수분리법, 치환적분, 연쇄법칙, 방향장, 적분상수 |
| 02 화학 | `pages/electrochem.html` | Nernst 식, Faraday 두께 환산, 3-step 정전류법, OCP, CV |
| 03 화학 | `pages/corrosion.html` | 갈바닉·공식·틈새 부식, Tafel, Pourbaix, 통계 |
| 04 물리 | `pages/eis.html` | 복소 임피던스, Nyquist, Bode, Randles, CPE, Warburg |
| 05 재료 | `pages/polymer.html` | 라디칼 중합, Flory–Huggins, Flory–Rehner, 가교 밀도 |
| 06 화학 | `pages/surface.html` | Young 식, 접촉각, Owens–Wendt, Neumann EoS |
| 07 물리 | `pages/rheology.html` | 멱법칙, 전단담화, 항복응력, 도공 두께 |
| 08 물리 | `pages/mechanics.html` | 박리 역학, 요철 평균, 로드셀, 응력–변형, 마찰 |
| 09 공학 | `pages/needle.html` | 베벨 기하, 투과력 곡선, 게이지 규격, 니들 임피던스 |
| 10 재료 | `pages/thermal.html` | TGA, DSC, Py-GC/MS, FT-IR, 고주파 절단, 팁 온도 |
| 11 물리 | `pages/biosignal.html` | 반쪽전지, ECG·EMG, 필터, Fick 확산, 침투 문턱 |
| 12 공학 | `pages/standards.html` | AAMI EC12, ISO 10993, Arrhenius 가속수명, 신뢰구간 |
| 13 도구 | `pages/ai-tools.html` | 신경망 파라미터, 사전학습, 세션과 기억, 토큰 |

## 기술 구성

- 정적 HTML·CSS·JavaScript만 사용함. 빌드 단계가 없음
- 외부 라이브러리·폰트·이미지·네트워크 요청 없음. 오프라인에서 그대로 동작함
- 그래프는 SVG로 직접 그리고 계산은 브라우저에서 수행함
- 라이트·다크 테마 지원. 시스템 설정을 따르며 상단 버튼으로 전환 가능함

```
assets/css/site.css   디자인 시스템
assets/js/site.js     테마 전환, 내비게이션, 검색·필터
assets/js/lab.js      인터랙티브 위젯 엔진 (SVG 플로터 + 컨트롤 + 산출값)
```

## 로컬 실행

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` 을 열면 됨. 파일을 직접 열어도 동작하지만
로컬 서버 방식이 경로 처리에 안전함.

## 수록 기준

ISO·ASTM·ANSI/AAMI·IEC·KS가 정한 시험 조건과 한계값, 교과서 수준의 전기화학·고분자·열분석
이론, 문헌에 보고된 재료 물성값을 실었음. 특정 기업의 제품 사양과 도면 규격, 내부 표준 절차와
관리 기준, 배합·공정 조건, 시료 측정 결과는 담지 않았음.
