(function () {
  'use strict';

  // Mark JS-enabled (so reveal styles apply only when JS can drive them)
  document.documentElement.classList.add('js');

  // ---------- Year ----------
  var yEl = document.getElementById('year');
  if (yEl) yEl.textContent = String(new Date().getFullYear());

  // ---------- Theme toggle (in-memory only; sandbox blocks storage) ----------
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');

  // Honor system preference initially
  try {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } catch (_) {
    root.setAttribute('data-theme', 'light');
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
    });
  }

  // ---------- Smooth-scroll for in-page anchors (offset for sticky header) ----------
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id === '#' || id === '#top') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var headerH = document.querySelector('.site-header');
      var offset = headerH ? headerH.getBoundingClientRect().height + 12 : 0;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  // (Scroll-reveal removed — relying on solid layout; avoids hidden content if JS or IO fails.)
})();
