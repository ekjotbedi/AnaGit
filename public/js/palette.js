'use strict';

/*
  Command palette (Ctrl/Cmd + K) — hand-rolled, no library.
 
 The app registers a provider function that returns the currently
 available commands (repos to jump to, tabs, actions). The palette
 filters them as you type and runs the selected one.
 */
const Palette = (() => {
  let provider = () => [];
  let items = [];
  let selected = 0;
  let open = false;

  const el = () => UI.$('#palette');
  const input = () => UI.$('#palette-input');
  const results = () => UI.$('#palette-results');

  function setProvider(fn) { provider = fn; }

  function show() {
    items = provider();
    selected = 0;
    open = true;
    el().classList.remove('hidden');
    UI.$('#modal-backdrop').classList.remove('hidden');
    input().value = '';
    input().focus();
    render('');
  }

  function hide() {
    open = false;
    el().classList.add('hidden');
    // Only hide the backdrop if no modal is using it.
    if (UI.$$('.modal').every((m) => m.classList.contains('hidden'))) {
      UI.$('#modal-backdrop').classList.add('hidden');
    }
  }

  function filtered(query) {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      `${it.label} ${it.kind}`.toLowerCase().includes(q)
    );
  }

  function render(query) {
    const list = filtered(query);
    selected = Math.min(selected, Math.max(0, list.length - 1));
    results().innerHTML = list.length
      ? list
          .map(
            (it, i) => `
          <div class="palette-row ${i === selected ? 'selected' : ''}" data-idx="${i}">
            <span class="p-ico">${it.icon || '›'}</span>
            <span>${UI.esc(it.label)}</span>
            <span class="p-kind">${UI.esc(it.kind)}</span>
          </div>`
          )
          .join('')
      : `<div class="palette-row"><span class="p-ico">∅</span><span>No matches</span></div>`;

    UI.$$('.palette-row[data-idx]', results()).forEach((row) => {
      row.addEventListener('click', () => {
        const list2 = filtered(input().value);
        run(list2[Number(row.dataset.idx)]);
      });
      row.addEventListener('mousemove', () => {
        selected = Number(row.dataset.idx);
        UI.$$('.palette-row', results()).forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
      });
    });
  }

  function run(item) {
    if (!item) return;
    hide();
    item.action();
  }

  function init() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open ? hide() : show();
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { hide(); return; }
      const list = filtered(input().value);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selected = (selected + 1) % Math.max(list.length, 1);
        render(input().value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selected = (selected - 1 + Math.max(list.length, 1)) % Math.max(list.length, 1);
        render(input().value);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(list[selected]);
      }
    });

    input().addEventListener('input', () => {
      selected = 0;
      render(input().value);
    });

    UI.$('#btn-palette').addEventListener('click', show);
  }

  return { init, setProvider, show, hide };
})();
