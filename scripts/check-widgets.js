/* ==========================================================================
   check-widgets.js — 위젯의 계산을 실제로 돌려 보는 검증기

   check.js 가 정적 구조(스크립트 파싱·마운트 div·topnav 짝)를 본다면, 이쪽은
   런타임을 봄. 페이지의 Lab.make 설정을 가로채 compute() 를 직접 호출하고,
   기본값·프리셋·컨트롤 양 끝값에서 산출값과 그래프 점이 유한한지 확인함.
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
