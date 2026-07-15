/**
 * Validation report output - console, JSON, HTML formats
 */
const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const STATUS_ICONS = {
  PASS: `${COLORS.green}✓ PASS${COLORS.reset}`,
  FAIL: `${COLORS.red}✗ FAIL${COLORS.reset}`,
  WARNING: `${COLORS.yellow}⚠ WARN${COLORS.reset}`,
  SKIP: `${COLORS.dim}○ SKIP${COLORS.reset}`
};

function consoleReport(report) {
  const { summary, checks, duration } = report;

  console.log('\n' + COLORS.bold + '═══════════════════════════════════════════════════════════' + COLORS.reset);
  console.log(COLORS.bold + '  Migration Validation Report' + COLORS.reset);
  console.log(COLORS.dim + `  ${report.timestamp}  |  Duration: ${duration}` + COLORS.reset);
  console.log(COLORS.bold + '═══════════════════════════════════════════════════════════' + COLORS.reset);

  // Summary bar
  const parts = [];
  if (summary.passed > 0) parts.push(`${COLORS.green}${summary.passed} passed${COLORS.reset}`);
  if (summary.failed > 0) parts.push(`${COLORS.red}${summary.failed} failed${COLORS.reset}`);
  if (summary.warnings > 0) parts.push(`${COLORS.yellow}${summary.warnings} warnings${COLORS.reset}`);
  if (summary.skipped > 0) parts.push(`${COLORS.dim}${summary.skipped} skipped${COLORS.reset}`);
  console.log('\n  ' + parts.join('  |  ') + `  (${summary.total} total)\n`);

  // Group by category
  const categories = {};
  for (const check of checks) {
    const cat = check.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(check);
  }

  for (const [cat, catChecks] of Object.entries(categories)) {
    console.log(COLORS.bold + COLORS.cyan + `\n  ── ${cat.toUpperCase()} ──` + COLORS.reset);

    for (const check of catChecks) {
      console.log(`\n  ${COLORS.bold}${check.name}${COLORS.reset} ${COLORS.dim}(${check.id})${COLORS.reset}`);

      for (const result of check.results) {
        const icon = STATUS_ICONS[result.status];
        const entity = result.entity ? `${COLORS.magenta}[${result.entity}]${COLORS.reset} ` : '';
        console.log(`    ${icon} ${entity}${result.message}`);

        if (result.details && result.status === 'FAIL') {
          const detailStr = typeof result.details === 'string'
            ? result.details
            : JSON.stringify(result.details, null, 2).split('\n').map(l => '      ' + l).join('\n');
          console.log(COLORS.dim + detailStr + COLORS.reset);
        }
      }
    }
  }

  // Final status
  console.log('\n' + COLORS.bold + '═══════════════════════════════════════════════════════════' + COLORS.reset);
  if (summary.failed > 0) {
    console.log(`  ${COLORS.bgRed}${COLORS.white} VALIDATION FAILED ${COLORS.reset} ${summary.failed} critical issue(s) found`);
  } else if (summary.warnings > 0) {
    console.log(`  ${COLORS.bgYellow}${COLORS.white} VALIDATION PASSED WITH WARNINGS ${COLORS.reset} ${summary.warnings} warning(s)`);
  } else {
    console.log(`  ${COLORS.bgGreen}${COLORS.white} VALIDATION PASSED ${COLORS.reset} All checks passed`);
  }
  console.log(COLORS.bold + '═══════════════════════════════════════════════════════════\n' + COLORS.reset);
}

function jsonReport(report) {
  const reportsDir = path.resolve(__dirname, '../../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const filename = `validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(reportsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nJSON report saved to: ${filepath}`);
  return filepath;
}

function htmlReport(report) {
  const reportsDir = path.resolve(__dirname, '../../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const filename = `validation-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
  const filepath = path.join(reportsDir, filename);

  const statusColor = { PASS: '#22c55e', FAIL: '#ef4444', WARNING: '#eab308', SKIP: '#9ca3af' };
  const statusLabel = { PASS: 'PASS', FAIL: 'FAIL', WARNING: 'WARN', SKIP: 'SKIP' };

  let checkRows = '';
  for (const check of report.checks) {
    for (const r of check.results) {
      const color = statusColor[r.status];
      checkRows += `<tr>
        <td><span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${statusLabel[r.status]}</span></td>
        <td>${check.name}</td>
        <td>${check.category}</td>
        <td>${r.entity || '-'}</td>
        <td>${r.message}</td>
        <td><pre style="font-size:11px;max-width:400px;overflow:auto">${r.details ? JSON.stringify(r.details, null, 2) : ''}</pre></td>
      </tr>`;
    }
  }

  const { summary } = report;
  const overallStatus = summary.failed > 0 ? 'FAILED' : summary.warnings > 0 ? 'PASSED WITH WARNINGS' : 'PASSED';
  const overallColor = summary.failed > 0 ? '#ef4444' : summary.warnings > 0 ? '#eab308' : '#22c55e';

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>Migration Validation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; background: #f8fafc; color: #1e293b; direction: ltr; }
    h1 { color: #0f172a; }
    .summary { display: flex; gap: 16px; margin: 20px 0; }
    .summary-card { padding: 16px 24px; border-radius: 8px; color: #fff; font-size: 24px; font-weight: bold; }
    .summary-card small { display: block; font-size: 12px; font-weight: normal; opacity: 0.8; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #1e293b; color: #fff; padding: 12px; text-align: left; font-size: 13px; }
    td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; vertical-align: top; }
    tr:hover { background: #f1f5f9; }
    .status-bar { padding: 12px 20px; border-radius: 8px; color: #fff; font-size: 18px; font-weight: bold; margin: 20px 0; }
    pre { margin: 0; white-space: pre-wrap; }
    .filter-bar { margin: 16px 0; }
    .filter-bar button { padding: 6px 14px; margin-right: 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
    .filter-bar button.active { background: #1e293b; color: #fff; }
  </style>
</head>
<body>
  <h1>Migration Validation Report</h1>
  <p style="color:#64748b">${report.timestamp} | Duration: ${report.duration}</p>

  <div class="status-bar" style="background:${overallColor}">${overallStatus}</div>

  <div class="summary">
    <div class="summary-card" style="background:#22c55e"><small>Passed</small>${summary.passed}</div>
    <div class="summary-card" style="background:#ef4444"><small>Failed</small>${summary.failed}</div>
    <div class="summary-card" style="background:#eab308"><small>Warnings</small>${summary.warnings}</div>
    <div class="summary-card" style="background:#9ca3af"><small>Skipped</small>${summary.skipped}</div>
  </div>

  <div class="filter-bar">
    <button class="active" onclick="filterRows('all')">All</button>
    <button onclick="filterRows('FAIL')">Failures</button>
    <button onclick="filterRows('WARNING')">Warnings</button>
    <button onclick="filterRows('PASS')">Passed</button>
  </div>

  <table id="results">
    <thead><tr><th>Status</th><th>Check</th><th>Category</th><th>Entity</th><th>Message</th><th>Details</th></tr></thead>
    <tbody>${checkRows}</tbody>
  </table>

  <script>
    function filterRows(status) {
      document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('#results tbody tr').forEach(tr => {
        if (status === 'all') { tr.style.display = ''; return; }
        const badge = tr.querySelector('span').textContent;
        tr.style.display = badge === (status === 'WARNING' ? 'WARN' : status) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(filepath, html, 'utf8');
  console.log(`\nHTML report saved to: ${filepath}`);
  return filepath;
}

function buildReport(checkResults, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
  let passed = 0, failed = 0, warnings = 0, skipped = 0;

  for (const check of checkResults) {
    for (const r of check.results) {
      if (r.status === 'PASS') passed++;
      else if (r.status === 'FAIL') failed++;
      else if (r.status === 'WARNING') warnings++;
      else if (r.status === 'SKIP') skipped++;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    duration,
    summary: { total: passed + failed + warnings + skipped, passed, failed, warnings, skipped },
    checks: checkResults
  };
}

module.exports = { consoleReport, jsonReport, htmlReport, buildReport };
