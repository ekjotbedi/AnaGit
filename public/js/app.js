'use strict';

(() => {
  const { $, $$, esc, compact, timeAgo, shortDate } = UI;

  // application state
  const state = {
    user: null,
    repos: [],
    currentRepoId: null,
    currentTab: 'overview',
    cache: new Map(), // repoId -> { overview, activity, languages, labels, contributors }
    issuesFilters: { type: '', state: 'open', label: '', page: 1 },
    staleDays: 30,
    contribLimit: 25,
    pollTimer: null,
    githubRepoList: null, // cached picker list
  };

  const currentRepo = () =>
    state.repos.find((r) => r._id === state.currentRepoId) || null;

  function formatBytes(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' KB';
    return n + ' B';
  }

  // boot
  async function boot() {
    if (CONFIG.DEMO) {
      const banner = document.createElement('div');
      banner.className = 'demo-banner';
      banner.textContent = '◉ demo data — running without a backend';
      document.body.appendChild(banner);
    }

    $('#login-api-url').textContent = location.origin;
    initLoginTagline();
    initStaticEvents();
    Palette.init();
    Palette.setProvider(paletteItems);
    checkHealth();
    setInterval(checkHealth, 60000);

    try {
      state.user = await API.me();
      showApp();
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    stopPolling();
    $('#view-app').classList.add('hidden');
    $('#view-login').classList.remove('hidden');
  }

  async function showApp() {
    $('#view-login').classList.add('hidden');
    $('#view-app').classList.remove('hidden');
    renderUserChip();
    await loadRepos();
  }

  // login screen typing animation
  function initLoginTagline() {
    const phrases = [
      'engineering analytics for your GitHub repos',
      'issues · pull requests · commits · languages',
      'cached, rate-limit aware, webhook driven',
      'historical stats a live API call can never show',
    ];
    const el = $('#login-tagline');
    let pi = 0, ci = 0, deleting = false;
    (function tick() {
      const phrase = phrases[pi];
      ci += deleting ? -1 : 1;
      el.textContent = phrase.slice(0, ci);
      let wait = deleting ? 22 : 46;
      if (!deleting && ci === phrase.length) { deleting = true; wait = 2100; }
      if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; wait = 350; }
      setTimeout(tick, wait);
    })();
  }

  async function checkHealth() {
    const el = $('#api-health');
    try {
      const h = await API.health();
      el.innerHTML = `<span class="dot dot-green"></span><span class="mono">api: online · db ${esc(h.db)}</span>`;
    } catch {
      el.innerHTML = `<span class="dot dot-red"></span><span class="mono">api: unreachable</span>`;
    }
  }

  function renderUserChip() {
    const u = state.user;
    $('#user-chip').innerHTML = `
      ${UI.avatar(u.avatarUrl, u.login, 30)}
      <div class="user-names">
        <div class="user-login">${esc(u.login)}</div>
        <div class="user-sub">${esc(u.name || 'GitHub account')} · ${compact(u.followers)} followers</div>
      </div>
      <button class="icon-btn" id="btn-logout" title="Log out">⏻</button>`;
    $('#btn-logout').addEventListener('click', async () => {
      try { await API.logout(); } catch { /* session may already be gone */ }
      state.user = null;
      showLogin();
    });
  }

  // repo list
  async function loadRepos(selectId) {
    state.repos = await API.repos();
    renderRepoList();

    if (state.repos.length === 0) {
      state.currentRepoId = null;
      $('#view-repo').classList.add('hidden');
      $('#view-empty').classList.remove('hidden');
      $('#topbar-crumbs').innerHTML = `~/ <b>no repos tracked</b>`;
      return;
    }
    $('#view-empty').classList.add('hidden');

    const remembered = localStorage.getItem('anagit_last_repo');
    const target =
      selectId ||
      (state.repos.some((r) => r._id === state.currentRepoId) && state.currentRepoId) ||
      (state.repos.some((r) => r._id === remembered) && remembered) ||
      state.repos[0]._id;
    selectRepo(target);
  }

  function statusDot(repo) {
    if (repo.syncStatus === 'syncing') return 'dot-amber';
    if (repo.syncStatus === 'error') return 'dot-red';
    return repo.lastSyncedAt ? 'dot-green' : 'dot-gray';
  }

  function renderRepoList() {
    $('#repo-list').innerHTML = state.repos
      .map(
        (r) => `
      <button class="repo-item ${r._id === state.currentRepoId ? 'active' : ''}" data-id="${r._id}" title="${esc(r.fullName)}">
        <span class="dot ${statusDot(r)}"></span>
        <span class="repo-item-name">${esc(r.fullName)}</span>
        <span class="repo-item-meta">★${compact(r.stars)}</span>
      </button>`
      )
      .join('');
    $$('#repo-list .repo-item').forEach((btn) =>
      btn.addEventListener('click', () => selectRepo(btn.dataset.id))
    );
  }

  // repository selection
  function selectRepo(id) {
    state.currentRepoId = id;
    localStorage.setItem('anagit_last_repo', id);
    state.issuesFilters = { type: '', state: 'open', label: '', page: 1 };
    renderRepoList();

    const repo = currentRepo();
    if (!repo) return;

    $('#view-empty').classList.add('hidden');
    $('#view-repo').classList.remove('hidden');
    renderRepoHeader(repo);
    setTab('overview');

    if (repo.syncStatus === 'syncing') startPolling();
  }

  function renderRepoHeader(repo) {
    $('#topbar-crumbs').innerHTML =
      `~/repos/<b>${esc(repo.fullName)}</b> <span style="color:var(--text-faint)">· ${esc(state.currentTab)}</span>`;
    $('#repo-owner').textContent = `${repo.owner} /`;
    $('#repo-name').textContent = repo.name;
    $('#repo-desc').textContent = repo.description || '';

    const badges = [];
    badges.push(
      repo.isPrivate
        ? `<span class="badge badge-amber">private</span>`
        : `<span class="badge">public</span>`
    );
    if (repo.isFork) badges.push(`<span class="badge badge-purple">fork</span>`);
    if (repo.defaultBranch) badges.push(`<span class="badge">⑂ ${esc(repo.defaultBranch)}</span>`);
    $('#repo-badges').innerHTML = badges.join('');

    $('#repo-stats').innerHTML = `
      <span title="Stars">★ <b>${compact(repo.stars)}</b></span>
      <span title="Forks">⑂ <b>${compact(repo.forks)}</b></span>
      <span title="Watchers">◉ <b>${compact(repo.watchers)}</b></span>`;

    $('#btn-open-github').href = repo.htmlUrl || `https://github.com/${repo.fullName}`;
    renderSyncBadge(repo);
  }

  function renderSyncBadge(repo) {
    const el = $('#sync-badge');
    if (repo.syncStatus === 'syncing') {
      el.className = 'sync-badge busy';
      el.textContent = '⟳ syncing…';
      el.title = 'A sync is running in the background';
    } else if (repo.syncStatus === 'error') {
      el.className = 'sync-badge err';
      el.textContent = '✕ sync failed';
      el.title = repo.syncError || 'Unknown sync error';
    } else {
      el.className = 'sync-badge ok';
      el.textContent = repo.lastSyncedAt ? `● synced ${timeAgo(repo.lastSyncedAt)}` : '○ never synced';
      el.title = repo.lastSyncedAt ? new Date(repo.lastSyncedAt).toLocaleString() : '';
    }
  }

  // sync polling
  // While a repo is syncing, polling it so the UI updates itself live
  function startPolling() {
    stopPolling();
    const id = state.currentRepoId;
    state.pollTimer = setInterval(async () => {
      try {
        const fresh = await API.repo(id);
        const idx = state.repos.findIndex((r) => r._id === id);
        if (idx !== -1) state.repos[idx] = fresh;
        renderRepoList();
        if (id === state.currentRepoId) renderSyncBadge(fresh);

        if (fresh.syncStatus !== 'syncing') {
          stopPolling();
          state.cache.delete(id); // stored stats changed
          if (fresh.syncStatus === 'error') {
            UI.toast('Sync failed', 'error', fresh.syncError || '');
          } else {
            UI.toast(`${fresh.fullName} synced`, 'success', 'Statistics updated');
          }
          if (id === state.currentRepoId) {
            renderRepoHeader(fresh);
            setTab(state.currentTab); // re-render with fresh data
          }
        }
      } catch {
        // transient poll error
      }
    }, CONFIG.POLL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  // data cache
  // Fetching everything the overview needs
  async function repoData(id) {
    if (state.cache.has(id)) return state.cache.get(id);
    const [overview, activity, languages, labels, contributors] = await Promise.all([
      API.overview(id),
      API.commitActivity(id),
      API.languages(id),
      API.labels(id),
      API.contributors(id, 100),
    ]);
    const data = { overview, activity, languages, labels, contributors };
    state.cache.set(id, data);
    return data;
  }

  // tabs
  const TAB_RENDERERS = {
    overview: renderOverview,
    issues: renderIssues,
    stale: renderStale,
    contributors: renderContributors,
    sync: renderSyncTab,
  };

  function setTab(tab) {
    state.currentTab = tab;
    $$('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    const repo = currentRepo();
    if (repo) {
      $('#topbar-crumbs').innerHTML =
        `~/repos/<b>${esc(repo.fullName)}</b> <span style="color:var(--text-faint)">· ${esc(tab)}</span>`;
    }
    Charts.destroyAll();

    // A repo that is doing its FIRST sync has no stored stats yet, showing live progress instead of empty cards.
    if (repo && repo.syncStatus === 'syncing' && !repo.lastSyncedAt) {
      $('#tab-body').innerHTML = `
        <div class="syncing-hero">
          <div class="spinner"></div>
          <h3>First sync in progress</h3>
          <p>Pulling issues, pull requests, commits, languages and contributor stats from GitHub…</p>
          <p class="mono" style="margin-top:8px">page updates automatically — no refresh needed</p>
        </div>`;
      return;
    }

    TAB_RENDERERS[tab]().catch((err) => {
      $('#tab-body').innerHTML = `
        <div class="error-hero">
          <div class="mono">✕ ${esc(err.message)}</div>
          <button class="btn btn-ghost btn-sm" id="btn-error-reload">Reload</button>
        </div>`;
      $('#btn-error-reload').addEventListener('click', () => location.reload());
    });
  }

  // tab: overview
  async function renderOverview() {
    const body = $('#tab-body');
    body.innerHTML = `<div class="grid">
      ${UI.skeletonCard('span-8')}${UI.skeletonCard('span-4')}
      ${UI.skeletonCard('span-7')}${UI.skeletonCard('span-5')}
    </div>`;

    const id = state.currentRepoId;
    const [{ overview, activity, languages, labels, contributors }, stale] =
      await Promise.all([repoData(id), API.staleIssues(id, state.staleDays)]);
    if (id !== state.currentRepoId || state.currentTab !== 'overview') return;

    // stale pill on the tab header
    const pill = $('#stale-pill');
    if (stale.count > 0) {
      pill.textContent = stale.count;
      pill.classList.remove('hidden');
    } else pill.classList.add('hidden');

    // week-over-week + snapshot-over-snapshot deltas
    const trend = overview.trend || [];
    const prev = trend.length >= 2 ? trend[trend.length - 2] : null;

    const kpi = (label, value, prevValue, goodWhenUp) => {
      let deltaHtml = `<div class="kpi-delta delta-flat">— no trend yet</div>`;
      if (prevValue !== null && prevValue !== undefined) {
        const d = value - prevValue;
        if (d === 0) deltaHtml = `<div class="kpi-delta delta-flat">= unchanged</div>`;
        else {
          const improving = goodWhenUp ? d > 0 : d < 0;
          deltaHtml = `<div class="kpi-delta ${improving ? 'delta-up' : 'delta-down'}">
            ${d > 0 ? '▲ +' : '▼ '}${compact(d)} since last snapshot</div>`;
        }
      }
      return `<div class="card kpi span-2">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${compact(value)}</div>
        ${deltaHtml}</div>`;
    };

    const calloutHtml =
      stale.count > 0
        ? `<div class="callout">▲ <b>${stale.count}</b>&nbsp;open issue${stale.count === 1 ? '' : 's'} untouched for ${stale.thresholdDays}+ days
           <a href="#" id="goto-stale">review stale issues →</a></div>`
        : '';

    const langRows = (languages.languages || []).slice(0, 8).map((l) => `
      <div class="lang-row">
        <span class="lang-bullet" style="background:${UI.langColor(l.language)}"></span>
        <span class="lang-name">${esc(l.language)}</span>
        <span class="lang-pct">${l.percentage}%</span>
        <span class="lang-bytes">${formatBytes(l.bytes)}</span>
      </div>`).join('');
    const langBar = (languages.languages || []).map((l) =>
      `<span style="width:${l.percentage}%;background:${UI.langColor(l.language)}" title="${esc(l.language)} ${l.percentage}%"></span>`
    ).join('');

    const maxLabel = Math.max(...(labels.length ? labels.map((l) => l.count) : [1]));
    const labelRows = labels.slice(0, 9).map((l) => `
      <div class="label-dist-row">
        <span class="name"><span class="lang-bullet" style="background:${UI.labelColor(l.label)}"></span><span>${esc(l.label)}</span></span>
        <span class="track"><span class="fill" style="width:${Math.round((l.count / maxLabel) * 100)}%;background:${UI.labelColor(l.label)}"></span></span>
        <span class="count">${l.count}</span>
      </div>`).join('');

    const maxCommits = Math.max(...(contributors.length ? contributors.map((c) => c.commits) : [1]));
    const topContribRows = contributors.slice(0, 5).map((c) => `
      <div class="lang-row" style="gap:10px">
        ${UI.avatar(c.avatarUrl, c.login, 22)}
        <span class="lang-name mono" style="font-size:12px">${esc(c.login)}</span>
        <span class="commit-bar-track" style="flex:1;margin-left:0"><span class="commit-bar-fill" style="width:${Math.round((c.commits / maxCommits) * 100)}%"></span></span>
        <span class="lang-pct">${compact(c.commits)}</span>
      </div>`).join('');

    body.innerHTML = `<div class="grid">
      ${calloutHtml}
      ${kpi('Open issues', overview.issues.open, prev && prev.openIssues, false)}
      ${kpi('Closed issues', overview.issues.closed, prev && prev.closedIssues, true)}
      ${kpi('Open PRs', overview.pullRequests.open, prev && prev.openPullRequests, false)}
      ${kpi('Closed PRs', overview.pullRequests.closed, prev && prev.closedPullRequests, true)}
      ${kpi('Commits stored', overview.totalCommits, prev && prev.totalCommits, true)}
      ${kpi('Contributors', overview.contributorsCount, prev && prev.contributorsCount, true)}

      <div class="card span-8">
        <div class="card-title"><span>Commit activity · weekly</span><span class="hint">last 26 weeks</span></div>
        ${activity.length
          ? `<div class="chart-wrap"><canvas id="chart-activity"></canvas></div>
             <div class="chart-legend">
               <span><span class="swatch" style="background:#3fb950"></span>held or grew vs previous week</span>
               <span><span class="swatch" style="background:#f85149"></span>output dropped vs previous week</span>
             </div>`
          : `<p class="td-dim">No commit activity stored yet — GitHub may still be computing stats; try another sync in a minute.</p>`}
      </div>

      <div class="card span-4">
        <div class="card-title"><span>Commits by weekday</span></div>
        ${activity.length
          ? `<div class="chart-wrap"><canvas id="chart-weekday"></canvas></div>`
          : `<p class="td-dim">No data yet.</p>`}
      </div>

      <div class="card span-7">
        <div class="card-title"><span>Historical trend</span><span class="hint">one point per sync snapshot</span></div>
        ${trend.length >= 2
          ? `<div class="chart-wrap"><canvas id="chart-trend"></canvas></div>
             <div class="chart-legend">
               <span><span class="swatch" style="background:#d29922"></span>open issues</span>
               <span><span class="swatch" style="background:#bc8cff"></span>open PRs</span>
               <span><span class="swatch" style="background:#3fb950"></span>total commits</span>
             </div>`
          : `<p class="td-dim">Trends appear after a couple of syncs — each sync stores a snapshot, and the line connects them over time.</p>`}
      </div>

      <div class="card span-5">
        <div class="card-title"><span>Languages</span><span class="hint">${formatBytes(languages.totalBytes || 0)} of code</span></div>
        ${(languages.languages || []).length
          ? `<div class="lang-bar">${langBar}</div><div class="lang-list">${langRows}</div>`
          : `<p class="td-dim">No language data yet.</p>`}
      </div>

      <div class="card span-6">
        <div class="card-title"><span>Labels</span><span class="hint">across issues &amp; PRs</span></div>
        ${labels.length ? `<div class="label-dist">${labelRows}</div>` : `<p class="td-dim">No labels found.</p>`}
      </div>

      <div class="card span-6">
        <div class="card-title"><span>Top contributors</span><span class="hint">by commits</span></div>
        ${contributors.length ? `<div class="lang-list">${topContribRows}</div>` : `<p class="td-dim">No contributor stats yet.</p>`}
      </div>
    </div>`;

    if (activity.length) {
      Charts.commitActivity('chart-activity', activity);
      Charts.weekdayDistribution('chart-weekday', activity);
    }
    if (trend.length >= 2) Charts.trend('chart-trend', trend);

    const goStale = $('#goto-stale');
    if (goStale) goStale.addEventListener('click', (e) => { e.preventDefault(); setTab('stale'); });
  }

  // tab: issues and PR
  async function renderIssues() {
    const body = $('#tab-body');
    const f = state.issuesFilters;
    const { labels } = await repoData(state.currentRepoId);

    const seg = (name, options) => `
      <div class="seg" data-seg="${name}">
        ${options.map(([val, lab]) =>
          `<button data-val="${val}" class="${f[name] === val ? 'active' : ''}">${lab}</button>`).join('')}
      </div>`;

    body.innerHTML = `
      <div class="filter-bar">
        ${seg('type', [['', 'All'], ['issue', 'Issues'], ['pr', 'Pull requests']])}
        ${seg('state', [['', 'Any state'], ['open', 'Open'], ['closed', 'Closed']])}
        <select class="select" id="filter-label">
          <option value="">All labels</option>
          ${labels.map((l) => `<option value="${esc(l.label)}" ${f.label === l.label ? 'selected' : ''}>${esc(l.label)} (${l.count})</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="result-count" id="issues-count"></span>
      </div>
      <div class="card" style="padding:6px 12px" id="issues-table-wrap">
        <div class="skeleton-rows"></div>
      </div>
      <div class="pager">
        <button class="btn btn-ghost btn-sm" id="pg-prev">← Prev</button>
        <span class="mono" id="pg-info"></span>
        <button class="btn btn-ghost btn-sm" id="pg-next">Next →</button>
      </div>`;

    $$('.seg', body).forEach((segEl) => {
      segEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        f[segEl.dataset.seg] = btn.dataset.val;
        f.page = 1;
        renderIssues();
      });
    });
    $('#filter-label').addEventListener('change', (e) => {
      f.label = e.target.value;
      f.page = 1;
      loadIssuesTable();
    });
    $('#pg-prev').addEventListener('click', () => { f.page -= 1; loadIssuesTable(); });
    $('#pg-next').addEventListener('click', () => { f.page += 1; loadIssuesTable(); });

    await loadIssuesTable();
  }

  async function loadIssuesTable() {
    const f = state.issuesFilters;
    const wrap = $('#issues-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="skeleton-rows"></div>`;

    const data = await API.issues(state.currentRepoId, {
      type: f.type, state: f.state, label: f.label, page: f.page, limit: 20,
    });
    if (!$('#issues-table-wrap')) return; // user switched tabs mid-flight
    const { items, pagination } = data;

    $('#issues-count').textContent = `${pagination.total} result${pagination.total === 1 ? '' : 's'}`;
    $('#pg-info').textContent = `page ${pagination.page} / ${Math.max(pagination.totalPages, 1)}`;
    $('#pg-prev').disabled = pagination.page <= 1;
    $('#pg-next').disabled = pagination.page >= pagination.totalPages;

    if (!items.length) {
      wrap.innerHTML = `<p class="td-dim" style="padding:20px">Nothing matches these filters.</p>`;
      return;
    }

    wrap.innerHTML = `<table class="table">
      <thead><tr>
        <th style="width:70px">#</th><th>Title</th><th>Author</th>
        <th class="td-right" style="width:80px">Comments</th><th style="width:110px">Updated</th>
      </tr></thead>
      <tbody>
        ${items.map((i) => {
          const ico = i.isPullRequest
            ? `<span class="state-ico state-pr" title="Pull request · ${i.state}">⑂</span>`
            : `<span class="state-ico ${i.state === 'open' ? 'state-open' : 'state-closed'}" title="Issue · ${i.state}">●</span>`;
          const labelHtml = (i.labels || []).slice(0, 3).map(UI.labelPill).join('') +
            (i.labels && i.labels.length > 3 ? `<span class="td-dim mono" style="font-size:10px">+${i.labels.length - 3}</span>` : '');
          return `<tr>
            <td class="td-num">${ico} ${i.number}</td>
            <td class="td-title"><a href="${esc(i.htmlUrl)}" target="_blank" rel="noopener">${esc(i.title)}</a><div style="margin-top:2px">${labelHtml}</div></td>
            <td class="td-mono td-dim">${UI.avatar(i.authorAvatar, i.authorLogin, 20)}${esc(i.authorLogin || '—')}</td>
            <td class="td-right td-mono td-dim">${i.comments || 0}</td>
            <td class="td-mono td-dim">${timeAgo(i.ghUpdatedAt)}</td>
          </tr>`;
        }).join('')}
      </tbody></table>`;
  }

  // stale issues
  async function renderStale() {
    const body = $('#tab-body');
    body.innerHTML = `
      <div class="filter-bar">
        <span class="td-dim" style="font-size:13px">Open issues untouched for</span>
        <input type="number" min="1" max="365" class="input input-sm" id="stale-days" value="${state.staleDays}" />
        <span class="td-dim" style="font-size:13px">days</span>
        <button class="btn btn-sm" id="stale-apply">Apply</button>
        <span class="spacer"></span>
        <span class="result-count" id="stale-count"></span>
      </div>
      <div class="card" style="padding:6px 12px" id="stale-wrap"><div class="skeleton-rows"></div></div>`;

    $('#stale-apply').addEventListener('click', () => {
      const v = parseInt($('#stale-days').value, 10);
      if (v >= 1) { state.staleDays = v; renderStale(); }
    });

    const data = await API.staleIssues(state.currentRepoId, state.staleDays);
    const wrap = $('#stale-wrap');
    if (!wrap) return;
    $('#stale-count').textContent = `${data.count} stale (threshold: ${data.thresholdDays}d)`;

    if (!data.issues.length) {
      wrap.innerHTML = `<p class="td-dim" style="padding:20px">
        No open issues idle for ${data.thresholdDays}+ days — the backlog is healthy.</p>`;
      return;
    }
    wrap.innerHTML = `<table class="table">
      <thead><tr>
        <th style="width:70px">#</th><th>Title</th><th>Author</th>
        <th style="width:110px">Idle</th><th style="width:120px">Last activity</th>
      </tr></thead>
      <tbody>
        ${data.issues.map((i) => `<tr>
          <td class="td-num">● ${i.number}</td>
          <td class="td-title"><a href="${esc(i.htmlUrl)}" target="_blank" rel="noopener">${esc(i.title)}</a>
            <div style="margin-top:2px">${(i.labels || []).slice(0, 3).map(UI.labelPill).join('')}</div></td>
          <td class="td-mono td-dim">${esc(i.authorLogin || '—')}</td>
          <td><span class="idle-badge ${i.idleDays >= 60 ? 'idle-bad' : 'idle-warn'}">${i.idleDays}d idle</span></td>
          <td class="td-mono td-dim">${shortDate(i.ghUpdatedAt)}</td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  // contributors
  async function renderContributors() {
    const body = $('#tab-body');
    body.innerHTML = `
      <div class="filter-bar">
        <span class="td-dim" style="font-size:13px">Show top</span>
        <select class="select" id="contrib-limit">
          ${[10, 25, 50, 100].map((n) => `<option value="${n}" ${state.contribLimit === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="result-count">ranked by commits · +added / −deleted lines from GitHub stats</span>
      </div>
      <div class="card" style="padding:6px 12px" id="contrib-wrap"><div class="skeleton-rows"></div></div>`;

    $('#contrib-limit').addEventListener('change', (e) => {
      state.contribLimit = parseInt(e.target.value, 10);
      renderContributors();
    });

    const { contributors } = await repoData(state.currentRepoId);
    const wrap = $('#contrib-wrap');
    if (!wrap) return;
    const list = contributors.slice(0, state.contribLimit);
    if (!list.length) {
      wrap.innerHTML = `<p class="td-dim" style="padding:20px">No contributor statistics stored yet — run a sync.</p>`;
      return;
    }
    const max = Math.max(...list.map((c) => c.commits), 1);
    wrap.innerHTML = `<table class="table">
      <thead><tr>
        <th style="width:44px">#</th><th>Contributor</th><th>Commits</th>
        <th class="td-right">Additions</th><th class="td-right">Deletions</th><th style="width:120px">Last active</th>
      </tr></thead>
      <tbody>
        ${list.map((c, idx) => `<tr>
          <td class="td-num">${idx + 1}</td>
          <td>${UI.avatar(c.avatarUrl, c.login, 26)}
            <a class="mono" style="margin-left:8px;font-size:12.5px" href="${esc(c.htmlUrl || `https://github.com/${c.login}`)}" target="_blank" rel="noopener">${esc(c.login)}</a></td>
          <td class="td-mono">${compact(c.commits)}<span class="commit-bar-track"><span class="commit-bar-fill" style="width:${Math.round((c.commits / max) * 100)}%"></span></span></td>
          <td class="td-right plus">+${compact(c.additions)}</td>
          <td class="td-right minus">−${compact(c.deletions)}</td>
          <td class="td-mono td-dim">${c.lastActiveAt ? timeAgo(c.lastActiveAt) : '—'}</td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  // sync and export
  async function renderSyncTab() {
    const body = $('#tab-body');
    const id = state.currentRepoId;
    body.innerHTML = `<div class="grid">
      <div class="card span-7" id="sync-history-card">
        <div class="card-title"><span>Sync history</span>
          <span class="hint">auto re-sync every 6h (cron) + on webhook events</span></div>
        <div class="skeleton-rows"></div>
      </div>
      <div class="card span-5">
        <div class="card-title"><span>Export report</span><span class="hint">files download with your session</span></div>
        <div class="export-grid">
          <a class="export-btn" href="${API.exportJsonUrl(id)}"><span class="ext json">JSON</span> Full analytics report</a>
          <a class="export-btn" href="${API.exportCsvUrl(id, 'contributors')}"><span class="ext">CSV</span> Contributors</a>
          <a class="export-btn" href="${API.exportCsvUrl(id, 'commit-activity')}"><span class="ext">CSV</span> Commit activity</a>
          <a class="export-btn" href="${API.exportCsvUrl(id, 'languages')}"><span class="ext">CSV</span> Languages</a>
          <a class="export-btn" href="${API.exportCsvUrl(id, 'stale-issues')}"><span class="ext">CSV</span> Stale issues</a>
        </div>
      </div>
      <div class="card span-12">
        <div class="card-title"><span>Webhook — live updates</span>
          <span class="hint">GitHub → AnaGit, verified with an HMAC signature</span></div>
        <p class="td-dim" style="font-size:12.5px;margin-bottom:10px">
          Add this payload URL on the repo (Settings → Webhooks) and pushes, issues and PR events
          will re-sync it automatically. Deliveries show up above tagged <span class="trigger-chip trigger-webhook">webhook</span>.
        </p>
        <div class="webhook-url"><span id="webhook-url-text">${esc(API.webhookUrl())}</span>
          <button class="icon-btn" id="btn-copy-webhook" title="Copy URL">⧉</button></div>
        <ul class="help-list" style="margin-top:10px">
          <li>Content type: <code>application/json</code></li>
          <li>Secret: the <code>GITHUB_WEBHOOK_SECRET</code> value from the backend .env</li>
          <li>Local dev needs a public tunnel (e.g. <code>ngrok http 4000</code>)</li>
        </ul>
      </div>
    </div>`;

    $('#btn-copy-webhook').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(API.webhookUrl());
        UI.toast('Webhook URL copied', 'success');
      } catch {
        UI.toast('Could not copy — select the text manually', 'error');
      }
    });

    const logs = await API.syncLogs(id);
    const card = $('#sync-history-card');
    if (!card) return;
    const rows = logs.length
      ? logs.map((l) => {
          const ico =
            l.status === 'success' ? `<span class="sync-status-ico plus">✓</span>`
            : l.status === 'error' ? `<span class="sync-status-ico minus">✗</span>`
            : `<span class="sync-status-ico" style="color:var(--amber);animation:pulse 1.2s infinite">●</span>`;
          const dur = l.finishedAt
            ? `${Math.max(1, Math.round((new Date(l.finishedAt) - new Date(l.startedAt)) / 1000))}s`
            : '…';
          const chipClass =
            l.triggeredBy === 'webhook' ? 'trigger-chip trigger-webhook'
            : l.triggeredBy === 'scheduled' ? 'trigger-chip trigger-scheduled'
            : 'trigger-chip';
          return `<div class="sync-row">
            ${ico}
            <span class="${chipClass}">${esc(l.triggeredBy)}</span>
            <span class="td-mono td-dim">${l.itemsProcessed ?? 0} items</span>
            <span class="td-mono td-dim">${dur}</span>
            <span class="td-mono td-dim" style="margin-left:auto">${timeAgo(l.startedAt)}</span>
            ${l.error ? `<span class="sync-err" title="${esc(l.error)}">${esc(l.error)}</span>` : ''}
          </div>`;
        }).join('')
      : `<p class="td-dim">No syncs recorded yet.</p>`;
    card.innerHTML = `
      <div class="card-title"><span>Sync history</span>
        <span class="hint">auto re-sync every 6h (cron) + on webhook events</span></div>
      <div class="sync-list">${rows}</div>`;
  }

  // actions
  async function doSync() {
    const repo = currentRepo();
    if (!repo) return;
    try {
      await API.syncRepo(repo._id);
      UI.toast('Sync started', 'info', 'Running in the background — the page will update itself.');
      repo.syncStatus = 'syncing';
      renderSyncBadge(repo);
      renderRepoList();
      startPolling();
    } catch (err) {
      if (err.status === 409) UI.toast('A sync is already in progress', 'info');
      else UI.toast('Could not start sync', 'error', err.message + (err.resetAt ? ` (rate limit resets ${timeAgo(err.resetAt)})` : ''));
    }
  }

  async function doDelete() {
    const repo = currentRepo();
    if (!repo) return;
    const yes = await UI.confirmDialog(
      `Remove ${repo.fullName}?`,
      'This deletes the repo and ALL analyzed data (issues, commits, snapshots, sync logs) from AnaGit. GitHub itself is not touched.'
    );
    if (!yes) return;
    try {
      await API.deleteRepo(repo._id);
      UI.toast(`${repo.fullName} removed`, 'success');
      state.cache.delete(repo._id);
      state.currentRepoId = null;
      await loadRepos();
    } catch (err) {
      UI.toast('Delete failed', 'error', err.message);
    }
  }

  // repo picker
  async function openPicker() {
    UI.openModal('modal-picker');
    $('#picker-search').value = '';
    $('#picker-search').focus();
    const listEl = $('#picker-list');
    listEl.innerHTML = `<div class="skeleton-rows"></div>`;
    try {
      if (!state.githubRepoList) state.githubRepoList = await API.myGithubRepos();
      renderPickerList('');
    } catch (err) {
      listEl.innerHTML = `<p class="td-dim" style="padding:14px">✕ ${esc(err.message)}</p>`;
    }
  }

  function renderPickerList(query) {
    const q = query.trim().toLowerCase();
    const tracked = new Set(state.repos.map((r) => r.fullName));
    const list = (state.githubRepoList || []).filter((r) =>
      !q || r.fullName.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
    );
    $('#picker-list').innerHTML = list.length
      ? list.slice(0, 60).map((r) => {
          const added = tracked.has(r.fullName);
          return `<div class="picker-row" data-full="${esc(r.fullName)}" data-added="${added}">
            <div class="picker-main">
              <div class="picker-name">${esc(r.fullName)}
                ${r.private ? '<span class="badge badge-amber" style="margin-left:6px">private</span>' : ''}
                ${r.fork ? '<span class="badge badge-purple" style="margin-left:6px">fork</span>' : ''}</div>
              <div class="picker-desc">${esc(r.description || '')}</div>
            </div>
            <div class="picker-meta">
              ${r.language ? `<span><span class="lang-bullet" style="background:${UI.langColor(r.language)};display:inline-block;vertical-align:-1px;margin-right:5px"></span>${esc(r.language)}</span>` : ''}
              <span>★${compact(r.stars)}</span>
              ${added ? '<span class="added">✓ added</span>' : ''}
            </div>
          </div>`;
        }).join('')
      : `<p class="td-dim" style="padding:14px">No repositories match.</p>`;

    $$('#picker-list .picker-row').forEach((row) => {
      row.addEventListener('click', async () => {
        if (row.dataset.added === 'true') {
          UI.toast('Already tracked', 'info');
          return;
        }
        const fullName = row.dataset.full;
        UI.closeModals();
        try {
          const res = await API.addRepo(fullName);
          UI.toast(`${fullName} added`, 'success', 'Initial sync started in the background.');
          await loadRepos(res.repo._id);
          startPolling(); // first sync is running
        } catch (err) {
          UI.toast('Could not add repository', 'error', err.message);
        }
      });
    });
  }

  // command palette
  function paletteItems() {
    const items = [];
    for (const r of state.repos) {
      items.push({
        icon: '⌂', kind: 'repo', label: r.fullName,
        action: () => selectRepo(r._id),
      });
    }
    if (currentRepo()) {
      const tabs = [
        ['overview', 'Overview'], ['issues', 'Issues & PRs'], ['stale', 'Stale issues'],
        ['contributors', 'Contributors'], ['sync', 'Sync & export'],
      ];
      for (const [key, label] of tabs) {
        items.push({ icon: '▸', kind: 'tab', label: `Go to ${label}`, action: () => setTab(key) });
      }
      items.push({ icon: '⟳', kind: 'action', label: 'Sync current repository', action: doSync });
      items.push({ icon: '⇩', kind: 'action', label: 'Export JSON report', action: () => { location.href = API.exportJsonUrl(state.currentRepoId); } });
      items.push({ icon: '↗', kind: 'action', label: 'Open current repo on GitHub', action: () => window.open(currentRepo().htmlUrl, '_blank') });
    }
    items.push({ icon: '+', kind: 'action', label: 'Add repository', action: openPicker });
    items.push({ icon: '⏻', kind: 'action', label: 'Log out', action: async () => { try { await API.logout(); } catch {} showLogin(); } });
    return items;
  }

  // static event writing
  function initStaticEvents() {
    $('#btn-login').addEventListener('click', () => { location.href = API.loginUrl(); });
    $('#btn-add-repo').addEventListener('click', openPicker);
    $('#btn-add-repo-empty').addEventListener('click', openPicker);
    $('#btn-sync').addEventListener('click', doSync);
    $('#btn-delete').addEventListener('click', doDelete);
    $('#picker-search').addEventListener('input', (e) => renderPickerList(e.target.value));

    $$('.tab', $('#tabs')).forEach((t) =>
      t.addEventListener('click', () => setTab(t.dataset.tab))
    );

    $$('[data-close-modal]').forEach((b) => b.addEventListener('click', UI.closeModals));
    $('#modal-backdrop').addEventListener('click', () => { UI.closeModals(); Palette.hide(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.closeModals();
    });

    // Anywhere the backend says "not signed in", fall back to login.
    window.addEventListener('anagit:unauth', showLogin);
  }

  boot();
})();
