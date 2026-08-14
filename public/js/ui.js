'use strict';

/*
 Small DOM / formatting helpers shared by every view.
 */
const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Escape untrusted text before inserting into innerHTML templates.
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 4213 -> "4.2k", 1200000 -> "1.2M"
  function compact(n) {
    if (n === null || n === undefined) return '—';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  // "2m ago" / "3h ago" / "5d ago"
  function timeAgo(date) {
    if (!date) return 'never';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function shortDate(date) {
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // GitHub's real language colors.
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516', PHP: '#4F5D95',
    HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Shell: '#89e051',
    Kotlin: '#A97BFF', Swift: '#F05138', Dart: '#00B4AB', Vue: '#41b883',
    Svelte: '#ff3e00', 'Objective-C': '#438eff', R: '#198CE7',
    Lua: '#2C2D72', Perl: '#0298c3', Haskell: '#5e5086', Elixir: '#6e4a7e',
    Dockerfile: '#384d54', Makefile: '#427819', 'Jupyter Notebook': '#DA5B0B',
    EJS: '#a91e50', Astro: '#ff5a03', Zig: '#ec915c', Solidity: '#AA6746',
  };
  const FALLBACK_COLORS = ['#58a6ff', '#bc8cff', '#39c5cf', '#d29922', '#ff7b72', '#7ee787', '#f778ba'];

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  const langColor = (name) => LANG_COLORS[name] || FALLBACK_COLORS[hashCode(name) % FALLBACK_COLORS.length];
  const labelColor = (name) => FALLBACK_COLORS[hashCode(name) % FALLBACK_COLORS.length];

  function labelPill(name) {
    const c = labelColor(name);
    return `<span class="label-pill" style="color:${c};border-color:${c}55;background:${c}18">${esc(name)}</span>`;
  }

  function avatar(url, login, size = 26) {
    if (url) {
      return `<img class="avatar-sm" style="width:${size}px;height:${size}px" src="${esc(url)}" alt="${esc(login)}" loading="lazy" />`;
    }
    const initials = (login || '?').slice(0, 2).toUpperCase();
    const c = labelColor(login || '?');
    return `<span class="avatar-fallback" style="width:${size}px;height:${size}px;background:${c}33;border-color:${c}66">${esc(initials)}</span>`;
  }

  // toasts
  function toast(message, type = 'info', sub = '') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `${esc(message)}${sub ? `<div class="toast-sub">${esc(sub)}</div>` : ''}`;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, 4200);
  }

  // modals
  function openModal(id) {
    $('#modal-backdrop').classList.remove('hidden');
    $(`#${id}`).classList.remove('hidden');
  }
  function closeModals() {
    $('#modal-backdrop').classList.add('hidden');
    $$('.modal').forEach((m) => m.classList.add('hidden'));
  }

  // Promise-based confirm dialog.
  function confirmDialog(title, text) {
    return new Promise((resolve) => {
      $('#confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      openModal('modal-confirm');
      const yes = $('#confirm-yes');
      const done = (answer) => {
        yes.removeEventListener('click', onYes);
        closeModals();
        resolve(answer);
      };
      const onYes = () => done(true);
      yes.addEventListener('click', onYes);
      $('#modal-confirm [data-close-modal]').onclick = () => done(false);
      $('#modal-backdrop').onclick = () => done(false);
    });
  }

  function skeletonCard(spanClass, height = 200) {
    return `<div class="card ${spanClass}"><div class="skeleton" style="width:40%"></div><div class="skeleton lg" style="height:${height}px"></div></div>`;
  }

  return {
    $, $$, esc, compact, timeAgo, shortDate,
    langColor, labelColor, labelPill, avatar,
    toast, openModal, closeModals, confirmDialog, skeletonCard,
  };
})();
