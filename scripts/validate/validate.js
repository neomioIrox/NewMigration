#!/usr/bin/env node
/**
 * Migration Validation Agent - CLI Entry Point
 *
 * Usage:
 *   node scripts/validate/validate.js                     # Run all checks
 *   node scripts/validate/validate.js --checks 01,03,05   # Specific checks
 *   node scripts/validate/validate.js --category integrity # By category
 *   node scripts/validate/validate.js --entity Project     # One entity
 *   node scripts/validate/validate.js --severity critical  # By severity
 *   node scripts/validate/validate.js --format json        # JSON output
 *   node scripts/validate/validate.js --format html        # HTML report
 *   node scripts/validate/validate.js --sample-size 200    # Custom sample size
 *   node scripts/validate/validate.js --verbose            # Detailed output
 */

const db = require('./lib/db');
const runner = require('./lib/runner');
const reporter = require('./lib/reporter');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--checks': options.checks = args[++i]; break;
      case '--category': options.category = args[++i]; break;
      case '--entity': options.entity = args[++i]; break;
      case '--severity': options.severity = args[++i]; break;
      case '--format': options.format = args[++i]; break;
      case '--sample-size': options.sampleSize = parseInt(args[++i]); break;
      case '--verbose': case '-v': options.verbose = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      case '--list': listChecks(); process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Migration Validation Agent
==========================

Usage: node scripts/validate/validate.js [options]

Options:
  --checks 01,03,05    Run specific checks (by number prefix or id)
  --category <name>    Filter by category (completeness|integrity|consistency|known-issues)
  --entity <name>      Filter by entity (Project|Affiliate|Source|Donation|...)
  --severity <level>   Filter by severity (critical|warning|info)
  --format <type>      Output format: console (default), json, html
  --sample-size <n>    Number of rows to sample (default: 100)
  --verbose, -v        Show detailed output including sample data
  --list               List all available checks
  --help, -h           Show this help
`);
}

function listChecks() {
  const checks = runner.discoverChecks();
  console.log('\nAvailable checks:\n');
  for (const c of checks) {
    console.log(`  ${c.file.replace('.js', '').padEnd(40)} ${c.severity.padEnd(10)} ${c.category}`);
    console.log(`    ${c.name}`);
  }
  console.log();
}

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('\n  Connecting to databases...');
  try {
    const conns = await db.connect();
    console.log(`  ✓ MSSQL: ${conns.mssql.database}`);
    console.log(`  ✓ Target: ${conns.target.database}`);
    console.log(`  ✓ Tracker: ${conns.tracker.database}`);
  } catch (err) {
    console.error('\n  ✗ ' + err.message);
    process.exit(1);
  }

  console.log('\n  Running validation checks...\n');

  const checkResults = await runner.runChecks(options);
  const report = reporter.buildReport(checkResults, startTime);

  // Output
  const format = options.format || 'console';
  if (format === 'console' || format === 'json' || format === 'html') {
    reporter.consoleReport(report);
  }
  if (format === 'json') {
    reporter.jsonReport(report);
  }
  if (format === 'html') {
    reporter.htmlReport(report);
  }

  await db.closeAll();

  // Exit code: 1 if any failures
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
