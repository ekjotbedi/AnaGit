'use strict';

const statsService = require('./statsService');
const Repository = require('../models/Repository');

/*
 Builds exportable reports for a repository, in JSON or CSV.
 JSON gives a full report; CSV gives one flat table for a chosen section
 */

// Assemble a complete report object from the stored statistics.
async function buildReport(repoId) {
  const repo = await Repository.findById(repoId).lean();
  const [overview, commitActivity, languages, contributors, staleIssues, labels] =
    await Promise.all([
      statsService.getOverview(repoId),
      statsService.getCommitActivity(repoId),
      statsService.getLanguages(repoId),
      statsService.getTopContributors(repoId, 100),
      statsService.getStaleIssues(repoId),
      statsService.getLabelDistribution(repoId),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    repository: repo
      ? {
          fullName: repo.fullName,
          description: repo.description,
          stars: repo.stars,
          forks: repo.forks,
          lastSyncedAt: repo.lastSyncedAt,
        }
      : null,
    overview,
    commitActivity,
    languages,
    contributors,
    staleIssues,
    labels,
  };
}

// Turn an array of flat objects into a CSV string.
function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Quote values containing commas, quotes, or newlines.
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

/*
  Produce a CSV for one section of the report.
  Supported sections: contributors | commit-activity | languages | stale-issues
 */
async function buildCsv(repoId, section) {
  switch (section) {
    case 'contributors': {
      const rows = await statsService.getTopContributors(repoId, 1000);
      return toCsv(
        rows.map((c) => ({
          login: c.login,
          commits: c.commits,
          additions: c.additions,
          deletions: c.deletions,
          lastActiveAt: c.lastActiveAt ? new Date(c.lastActiveAt).toISOString() : '',
        }))
      );
    }
    case 'commit-activity': {
      const weeks = await statsService.getCommitActivity(repoId);
      return toCsv(
        weeks.map((w) => ({
          weekStart: new Date(w.weekStart).toISOString().slice(0, 10),
          commits: w.total,
        }))
      );
    }
    case 'languages': {
      const { languages } = await statsService.getLanguages(repoId);
      return toCsv(
        languages.map((l) => ({
          language: l.language,
          bytes: l.bytes,
          percentage: l.percentage,
        }))
      );
    }
    case 'stale-issues': {
      const { issues } = await statsService.getStaleIssues(repoId);
      return toCsv(
        issues.map((i) => ({
          number: i.number,
          title: i.title,
          author: i.authorLogin,
          idleDays: i.idleDays,
          lastUpdated: new Date(i.ghUpdatedAt).toISOString(),
        }))
      );
    }
    default:
      return null; // unknown section
  }
}

module.exports = { buildReport, buildCsv, toCsv };
