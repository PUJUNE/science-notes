/* ==========================================================================
   site.js — shared chrome: theme toggle, active nav, in-page TOC, hub search
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- theme ---------- */
  const KEY = 'sn-theme';
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    document.dispatchEvent(new CustomEvent('themechange'));
  }
  const saved = (function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
  if (saved) applyTheme(saved);

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.querySelector('.theme-btn');
    if (btn) {
      const sync = () => { btn.textContent = currentTheme() === 'dark' ? 'LIGHT' : 'DARK'; };
      sync();
      btn.addEventListener('click', function () {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(KEY, next); } catch (e) { }
        sync();
      });
    }

    /* ---------- mark active top nav ---------- */
    const here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.topnav a').forEach(a => {
      const href = (a.getAttribute('href') || '').split('/').pop();
      if (href === here) a.classList.add('on');
    });

    /* ---------- build in-page TOC ---------- */
    const tocHost = document.querySelector('[data-toc]');
    if (tocHost) {
      const ol = document.createElement('ol');
      document.querySelectorAll('main section[id] > .wrap > h2, main section[id] > h2').forEach(hh => {
        const sec = hh.closest('section');
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + sec.id;
        a.textContent = hh.textContent.trim();
        li.appendChild(a); ol.appendChild(li);
      });
      if (ol.children.length) {
        const box = document.createElement('div');
        box.className = 'toc';
        const t = document.createElement('h4'); t.textContent = '이 페이지의 내용';
        box.appendChild(t); box.appendChild(ol);
        tocHost.appendChild(box);
      }
    }

    /* ---------- scroll spy on section nav ---------- */
    const spyLinks = Array.from(document.querySelectorAll('.topnav a[href^="#"]'));
    if (spyLinks.length) {
      const secs = spyLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          spyLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      secs.forEach(s => io.observe(s));
    }

    /* ---------- hub search + filter ---------- */
    const q = document.getElementById('q');
    const cards = Array.from(document.querySelectorAll('[data-search]'));
    const filterBtns = Array.from(document.querySelectorAll('.filters button'));
    const nores = document.querySelector('.nores');
    let activeCat = 'all';

    function run() {
      const term = (q ? q.value : '').trim().toLowerCase();
      let shown = 0;
      cards.forEach(c => {
        const hay = (c.getAttribute('data-search') || '').toLowerCase();
        const cat = c.getAttribute('data-cat') || '';
        const okTerm = !term || hay.indexOf(term) !== -1;
        const okCat = activeCat === 'all' || cat === activeCat;
        const ok = okTerm && okCat;
        c.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });
      if (nores) nores.classList.toggle('hidden', shown > 0);
    }
    if (q) q.addEventListener('input', run);
    filterBtns.forEach(b => b.addEventListener('click', function () {
      activeCat = b.getAttribute('data-filter') || 'all';
      filterBtns.forEach(x => x.classList.toggle('on', x === b));
      run();
    }));
    if (cards.length) run();
  });
})();
