'use strict';

const Charts = (() => {
  const instances = new Map();

  // dark theme defaults for every chart.
  if (window.Chart) {
    Chart.defaults.color = '#8b96a5';
    Chart.defaults.borderColor = '#212936';
    Chart.defaults.font.family =
      'ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace';
    Chart.defaults.font.size = 10.5;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#171e27';
    Chart.defaults.plugins.tooltip.borderColor = '#2f3b4c';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#e6edf3';
    Chart.defaults.plugins.tooltip.bodyColor = '#8b96a5';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
  }

  function mount(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (instances.has(canvasId)) instances.get(canvasId).destroy();
    const chart = new Chart(canvas.getContext('2d'), config);
    instances.set(canvasId, chart);
    return chart;
  }

  function destroyAll() {
    for (const chart of instances.values()) chart.destroy();
    instances.clear();
  }

  const GREEN = '#3fb950';
  const GREEN_SOFT = 'rgba(63,185,80,0.55)';
  const RED = '#f85149';
  const RED_SOFT = 'rgba(248,81,73,0.55)';

  /*
   Weekly commit activity as bars.
   Coloring rule (the "green positive / red negative" ask):
      green  — this week had at least as many commits as the previous week
      red    — commit output DROPPED vs the previous week
   The tooltip spells out the week-over-week delta.
   */
  function commitActivity(canvasId, weeks) {
    const recent = weeks.slice(-26);
    const labels = recent.map((w) => UI.shortDate(w.weekStart));
    const totals = recent.map((w) => w.total);
    const colors = totals.map((t, i) =>
      i > 0 && t < totals[i - 1] ? RED_SOFT : GREEN_SOFT
    );
    const borders = totals.map((t, i) =>
      i > 0 && t < totals[i - 1] ? RED : GREEN
    );

    return mount(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: totals,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 3,
          maxBarThickness: 26,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 13 } },
          y: { beginAtZero: true, grid: { color: '#1a212c' }, ticks: { precision: 0 } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => `Week of ${items[0].label}`,
              label: (item) => `${item.parsed.y} commits`,
              afterLabel: (item) => {
                if (item.dataIndex === 0) return '';
                const prev = totals[item.dataIndex - 1];
                const diff = item.parsed.y - prev;
                if (diff === 0) return 'no change vs previous week';
                return `${diff > 0 ? '▲ +' : '▼ '}${diff} vs previous week`;
              },
            },
          },
        },
      },
    });
  }

  /*
   Commits by day of week — the `days` arrays from GitHub's stats
   endpoint (index 0 = Sunday), summed across all stored weeks.
   */
  function weekdayDistribution(canvasId, weeks) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sums = [0, 0, 0, 0, 0, 0, 0];
    for (const w of weeks) (w.days || []).forEach((d, i) => { sums[i] += d; });
    const max = Math.max(...sums, 1);

    return mount(canvasId, {
      type: 'bar',
      data: {
        labels: names,
        datasets: [{
          data: sums,
          backgroundColor: sums.map((s) => (s === max ? GREEN : GREEN_SOFT)),
          borderColor: GREEN,
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, grid: { color: '#1a212c' }, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
        plugins: {
          tooltip: { callbacks: { label: (i) => `${i.parsed.x} commits` } },
        },
      },
    });
  }

  function trend(canvasId, snapshots) {
    const labels = snapshots.map((s) => UI.shortDate(s.capturedAt));
    const mk = (label, key, color, extra = {}) => ({
      label,
      data: snapshots.map((s) => s[key]),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: snapshots.length > 20 ? 0 : 2.5,
      pointHoverRadius: 4,
      tension: 0.3,
      ...extra,
    });

    return mount(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: [
          mk('Open issues', 'openIssues', '#d29922'),
          mk('Open PRs', 'openPullRequests', '#bc8cff'),
          mk('Total commits', 'totalCommits', GREEN, { borderDash: [5, 4], yAxisID: 'y1' }),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: '#1a212c' }, ticks: { precision: 0 } },
          y1: { position: 'right', beginAtZero: false, grid: { display: false }, ticks: { precision: 0, color: '#3fb95088' } },
        },
        plugins: {
          tooltip: { displayColors: true, boxWidth: 8, boxHeight: 8 },
        },
      },
    });
  }

  return { commitActivity, weekdayDistribution, trend, destroyAll };
})();
