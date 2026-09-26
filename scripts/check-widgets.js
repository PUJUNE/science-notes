/* ==========================================================================
   check-widgets.js — 위젯의 계산을 실제로 돌려 보는 검증기

   check.js 가 정적 구조(스크립트 파싱·마운트 div·topnav 짝)를 본다면, 이쪽은
   런타임을 봄. 페이지의 Lab.make 설정을 가로채 compute() 를 직접 호출하고,
   기본값·프리셋·컨트롤 양 끝값에서 산출값과 그래프 점이 유한한지 확인하고,
   로그 슬라이더 기본값이 눈금에 떨어지는지도 봄(화면 표시와 본문 수치가 어긋나는 함정).
   원자료 표가 있으면 기대값 파일로 행 단위 대조까지 함.

   사용법
     node scripts/check-widgets.js pages/eis.html
     node scripts/check-widgets.js pages/            (폴더 전체)
     node scripts/check-widgets.js pages/diffusion.html --expect _content/expect-diffusion.json

   기대값 파일 형식 (원자료 표를 그대로 옮김)
     {
       "#lab-calc": [
         { "label": "1 s 행",
           "set":    { "D": 1e-5, "t": 1, "n": 1, "A": 1, "Cs": 1 },
           "expect": { "d": [56.0, 0.1], "i": [172, 1] } }   // [기대값, 허용오차]
       ]
     }

   종료 코드 0 = 이상 없음, 1 = 문제 있음.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

/* --- DOM 최소 스텁 -------------------------------------------------------
   일부 페이지는 Lab.make 바깥에서 직접 DOM 을 만짐(수동 패널·이벤트 결선).
   그 코드가 예외로 죽지 않고 지나가도록 최소한만 흉내 냄. 자식 관련 값은 반드시
   falsy 로 둠 — `while (el.firstChild)` 같은 정리 루프가 끝나야 하기 때문임.
   실제 렌더 확인은 브라우저 실측이 맡음. */
function makeNode() {
  const noop = () => {};
  const n = {
    firstChild: null, lastChild: null, parentNode: null,
    nextSibling: null, previousSibling: null, firstElementChild: null,
    children: [], childNodes: [], value: '', textContent: '', innerHTML: '',
    id: '', className: '', checked: false, offsetWidth: 640, offsetHeight: 360,
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: x => x, removeChild: x => x, insertBefore: x => x,
    replaceChild: x => x, remove: noop, setAttribute: noop, removeAttribute: noop,
    getAttribute: () => null, hasAttribute: () => false,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    focus: noop, blur: noop, click: noop,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 640, height: 360, top: 0, left: 0, right: 640, bottom: 360 }),
    querySelector: () => makeNode(), querySelectorAll: () => [],
    getElementsByTagName: () => [], getElementsByClassName: () => [],
    closest: () => null, contains: () => false, cloneNode: () => makeNode()
  };
  return n;
}
function domStub() {
  const doc = makeNode();
  Object.assign(doc, {
    createElement: () => makeNode(),
    createElementNS: () => makeNode(),
    createTextNode: () => makeNode(),
    createDocumentFragment: () => makeNode(),
    getElementById: () => makeNode(),
    documentElement: makeNode(),
    body: makeNode(),
    head: makeNode(),
    readyState: 'complete'
  });
  return doc;
}

/* --- lab.js 의 실제 헬퍼를 그대로 씀 (make 만 가로챔) -------------------- */
function loadLab(root) {
  const src = fs.readFileSync(path.join(root, 'assets/js/lab.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);        // 파일 끝의 })(window) 가 win.Lab 을 채움
  return win.Lab;
}

/* --- 컨트롤에서 시험할 값 집합을 뽑음 ------------------------------------ */
function controlCases(controls) {
  const base = {};
  controls.forEach(c => { base[c.id] = c.value; });
  const cases = [{ label: '기본값', set: {} }];
  controls.forEach(c => {
    if (c.type === 'select' || c.type === 'toggle') {
      (c.options || []).forEach(o => {
        if (o.value !== c.value) cases.push({ label: `${c.id}=${o.value}`, set: { [c.id]: o.value } });
      });
    } else if (typeof c.min === 'number' && typeof c.max === 'number') {
      cases.push({ label: `${c.id}=min`, set: { [c.id]: c.min } });
      cases.push({ label: `${c.id}=max`, set: { [c.id]: c.max } });
    }
  });
  return { base, cases };
}

/* 로그 슬라이더 기본값이 눈금에 떨어지는지 ------------------------------------
   lab.js 는 log 컨트롤을 min 0 · max LOG_STEPS · step 1 의 range 입력으로 만들고,
   초기 value 를 logPos(value) 로 넣는다. 그 값이 정수가 아니면 브라우저가 가장
   가까운 눈금으로 당기므로, 화면에 뜨는 기본값이 설정한 value 와 달라진다.
   compute() 는 설정값을 그대로 받아 계산하므로 이 어긋남은 런타임 검사로 잡히지
   않고 브라우저를 열어야만 보인다(2026-09-10 확산층 dx 10 → 10.02, 본문 2000 대
   화면 1995.6). 프리셋은 state 를 직접 갈아 끼우므로 해당하지 않는다.
   ------------------------------------------------------------------------- */
const LOG_STEPS = 100000;   /* assets/js/lab.js 의 LOG_STEPS 와 같은 값이어야 함 */

/* lab.js 쪽 값이 바뀌면 위 검사가 조용히 낡으므로 시작할 때 대조한다. */
function checkLogStepsSync(root) {
  try {
    const src = fs.readFileSync(path.join(root, 'assets/js/lab.js'), 'utf8');
    const m = src.match(/LOG_STEPS\s*=\s*(\d+)/);
    if (!m) return ['assets/js/lab.js 에서 LOG_STEPS 선언을 찾지 못함 — 로그 슬라이더 검사가 실제와 어긋날 수 있음'];
    if (Number(m[1]) !== LOG_STEPS)
      return [`LOG_STEPS 불일치 — lab.js ${m[1]} 대 check-widgets.js ${LOG_STEPS}. 두 값을 맞출 것`];
  } catch (e) {
    return [`assets/js/lab.js 를 읽지 못함: ${e.message}`];
  }
  return [];
}
function logPos(v, lo, hi) { return LOG_STEPS * (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)); }
function logVal(p, lo, hi) { return Math.pow(10, Math.log10(lo) + (p / LOG_STEPS) * (Math.log10(hi) - Math.log10(lo))); }

function checkLogSliders(cfg, where, problems) {
  (cfg.controls || []).forEach(c => {
    if (!c.log || typeof c.min !== 'number' || typeof c.max !== 'number' || typeof c.value !== 'number') return;
    if (c.min <= 0 || c.max <= 0 || c.value <= 0) {
      problems.push(`${where}: 컨트롤 ${c.id} 가 log 인데 min·max·value 에 0 이하가 있음`);
      return;
    }
    const shown = logVal(Math.round(logPos(c.value, c.min, c.max)), c.min, c.max);
    const rel = Math.abs(shown - c.value) / Math.abs(c.value);
    /* 눈금 해상도에서 오는 최대 오차는 (0.5 눈금 × 로그 범위)이며 LOG_STEPS = 10만,
       12자릿수 범위에서도 0.015 % 아래다. 그보다 큰 어긋남은 범위 설정이 이 해상도로도
       안 맞는 경우이므로, 아래 문턱을 넘고 표시 문자열까지 달라질 때만 보고한다.
       표시가 같은 문자열이면 읽는 사람에게는 차이가 없다. fmt 가 없으면 lab.js 기본인
       유효숫자 3자리로 본다. */
    if (rel <= 5e-4) return;
    const fmt = v => {
      try { return typeof c.fmt === 'function' ? String(c.fmt(v)) : Number(v).toPrecision(3); }
      catch (e) { return String(v); }
    };
    const set = fmt(c.value), see = fmt(shown);
    if (set === see) return;
    problems.push(
      `${where}: 컨트롤 ${c.id} 기본값이 로그 눈금에 안 떨어져 화면 표시가 달라짐 — ` +
      `설정 ${set} 인데 처음 뜨는 값은 ${see} (오차 ${(rel * 100).toFixed(3)} %). ` +
      `본문이 이 기본값을 수치로 인용하면 어긋난다. min·max 를 십진 배수로 잡아 logPos 가 ` +
      `정수가 되게 하거나(예: 1e-7~1e-3 범위의 1e-5) 선형 슬라이더로 바꿀 것`
    );
  });
}

function scanResult(res, where, problems, statDefs) {
  if (!res || typeof res !== 'object') { problems.push(`${where}: compute 가 객체를 안 냄`); return; }
  const fmtOf = {};
  (statDefs || []).forEach(d => { fmtOf[d.id] = d.fmt; });
  Object.keys(res.stats || {}).forEach(k => {
    const v = res.stats[k];
    if (typeof v !== 'number' || Number.isFinite(v)) return;
    // 무한대·NaN 이라도 fmt 가 받아 처리하면(예: isFinite 검사 후 '—') 화면에는 문제가 없음
    const f = fmtOf[k];
    if (typeof f === 'function') {
      let shown;
      try { shown = String(f(v)); } catch (e) { shown = 'Infinity'; }
      if (!/Infinity|NaN/.test(shown)) return;
    }
    problems.push(`${where}: stat ${k} = ${v} (표시도 그대로 나감)`);
  });
  ['series', 'series2'].forEach(key => {
    const list = res[key] || [];
    let drawn = 0;
    list.forEach((s, si) => {
      if (!s || !Array.isArray(s.points)) { problems.push(`${where}: ${key}[${si}] 에 points 없음`); return; }
      if (s.points.length) drawn++;
      for (const p of s.points) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
          problems.push(`${where}: ${key}[${si}] 에 유한하지 않은 점`); return;
        }
      }
    });
    // 계열 일부가 비는 것은 정상(판정 위젯의 불합격 목록 등). 전부 비면 그릴 것이 없음.
    if (list.length && drawn === 0) problems.push(`${where}: ${key} 의 모든 계열이 비어 그릴 것이 없음`);
  });
  ['overlays', 'overlays2'].forEach(key => {
    (res[key] || []).forEach((o, oi) => {
      ['x', 'y', 'x1', 'x2'].forEach(f => {
        if (f in o && typeof o[f] === 'number' && !Number.isFinite(o[f]))
          problems.push(`${where}: ${key}[${oi}].${f} = ${o[f]}`);
      });
    });
  });
}

function checkPage(root, file, expectations) {
  const html = fs.readFileSync(file, 'utf8');
  const body = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const problems = [];
  const Lab = loadLab(root);
  const cfgs = [];
  const stub = Object.assign(Object.create(null), Lab, { make: c => { cfgs.push(c); } });

  const doc = domStub();
  const win = Object.assign(makeNode(), {
    document: doc, innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1,
    getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
    requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false, addEventListener: () => {} })
  });
  try {
    new Function('Lab', 'document', 'window', 'navigator', 'location', 'getComputedStyle', body)(
      stub, doc, win, { userAgent: 'node' }, { href: '', pathname: '/' }, win.getComputedStyle);
  } catch (e) {
    return { file, widgets: 0, problems: [`인라인 스크립트 실행 실패: ${e.message}`] };
  }

  cfgs.forEach(cfg => {
    const m = cfg.mount || '(mount 없음)';
    if (typeof cfg.compute !== 'function') { problems.push(`${m}: compute 가 없음`); return; }
    checkLogSliders(cfg, m, problems);
    const { base, cases } = controlCases(cfg.controls || []);
    const all = cases.concat((cfg.presets || []).map(p => ({ label: `프리셋 "${p.label}"`, set: p.set })));
    all.forEach(cse => {
      const v = Object.assign({}, base, cse.set);
      let res;
      try { res = cfg.compute(v); }
      catch (e) { problems.push(`${m} / ${cse.label}: compute 예외 — ${e.message}`); return; }
      scanResult(res, `${m} / ${cse.label}`, problems, cfg.stats);
    });

    // stats 선언과 반환 키가 맞는지
    const declared = (cfg.stats || []).map(s => s.id);
    if (declared.length) {
      let res;
      try { res = cfg.compute(base) || {}; } catch (e) { res = {}; }
      declared.forEach(id => {
        if (!res.stats || !(id in res.stats)) problems.push(`${m}: stats "${id}" 를 compute 가 안 채움`);
      });
    }

    // 기대값 대조
    (expectations[m] || []).forEach(row => {
      const v = Object.assign({}, base, row.set || {});
      let res;
      try { res = cfg.compute(v); }
      catch (e) { problems.push(`${m} / ${row.label}: compute 예외 — ${e.message}`); return; }
      Object.keys(row.expect || {}).forEach(k => {
        const [want, tol] = row.expect[k];
        const got = (res.stats || {})[k];
        if (typeof got !== 'number' || Math.abs(got - want) > tol)
          problems.push(`${m} / ${row.label}: ${k} = ${got} (기대 ${want} ±${tol})`);
      });
    });
  });

  return { file, widgets: cfgs.length, problems };
}

/* --- 진입점 --------------------------------------------------------------- */
const args = process.argv.slice(2);
const target = args[0];
if (!target) {
  console.error('사용법: node scripts/check-widgets.js <page.html | pages/> [--expect file.json]');
  process.exit(2);
}
const ei = args.indexOf('--expect');
const expectations = ei >= 0 && args[ei + 1] ? JSON.parse(fs.readFileSync(args[ei + 1], 'utf8')) : {};

const files = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target).filter(f => f.endsWith('.html')).map(f => path.join(target, f)).sort()
  : [target];
const root = path.resolve(path.dirname(files[0]), '..');

let bad = 0, totalWidgets = 0;
const syncProblems = checkLogStepsSync(root);
if (syncProblems.length) {
  bad++;
  console.log('✗ assets/js/lab.js — 검사기와 어긋남');
  syncProblems.forEach(p => console.log('    ' + p));
}

files.forEach(f => {
  const r = checkPage(root, f, expectations);
  totalWidgets += r.widgets;
  if (r.problems.length) {
    bad++;
    console.log(`✗ ${path.basename(f)} — 위젯 ${r.widgets}개, 문제 ${r.problems.length}건`);
    r.problems.forEach(p => console.log('    ' + p));
  } else {
    console.log(`✓ ${path.basename(f)} — 위젯 ${r.widgets}개 이상 없음`);
  }
});
console.log(`\n${files.length}개 페이지 / 위젯 ${totalWidgets}개 — ${bad ? bad + '개 페이지에 문제 있음' : '전부 통과'}`);
process.exit(bad ? 1 : 0);
