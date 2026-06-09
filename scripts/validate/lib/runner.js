/**
 * Check runner - discovers, loads, and executes validation checks
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const sampler = require('./sampler');
const mappingLoader = require('./mapping-loader');

const CHECKS_DIR = path.resolve(__dirname, '../checks');

function discoverChecks() {
  return fs.readdirSync(CHECKS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => {
      const check = require(path.join(CHECKS_DIR, f));
      return { file: f, ...check };
    });
}

function filterChecks(checks, options) {
  let filtered = checks;

  if (options.checks) {
    const ids = options.checks.split(',').map(s => s.trim());
    filtered = filtered.filter(c => ids.some(id => c.file.startsWith(id) || c.id === id));
  }

  if (options.category) {
    filtered = filtered.filter(c => c.category === options.category);
  }

  if (options.severity) {
    filtered = filtered.filter(c => c.severity === options.severity);
  }

  if (options.entity) {
    filtered = filtered.filter(c =>
      !c.entities || c.entities.includes('all') || c.entities.includes(options.entity)
    );
  }

  return filtered;
}

async function runChecks(options = {}) {
  const allChecks = discoverChecks();
  const checks = filterChecks(allChecks, options);

  if (checks.length === 0) {
    console.log('No checks match the given filters.');
    return [];
  }

  const { meta, mappings } = mappingLoader.loadAll();
  const entities = mappingLoader.getEntities();

  const ctx = {
    mssql: db.mssqlQuery,
    target: db.targetQuery,
    tracker: db.trackerQuery,
    mappings: { meta, all: mappings, entities },
    sample: sampler,
    options: {
      sampleSize: options.sampleSize || 100,
      entity: options.entity || null,
      verbose: options.verbose || false
    },
    log: (msg) => options.verbose && console.log(`    ${msg}`)
  };

  const results = [];

  for (const check of checks) {
    const label = `${check.id} - ${check.name}`;
    process.stdout.write(`  Running: ${label}...`);
    const start = Date.now();

    try {
      const checkResults = await check.run(ctx);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const fails = checkResults.filter(r => r.status === 'FAIL').length;
      const warns = checkResults.filter(r => r.status === 'WARNING').length;

      let statusChar = '✓';
      if (fails > 0) statusChar = '✗';
      else if (warns > 0) statusChar = '⚠';

      process.stdout.write(` ${statusChar} (${elapsed}s)\n`);

      results.push({
        id: check.id,
        name: check.name,
        severity: check.severity,
        category: check.category,
        results: checkResults
      });
    } catch (err) {
      process.stdout.write(` ERROR\n`);
      console.error(`    ${err.message}`);

      results.push({
        id: check.id,
        name: check.name,
        severity: check.severity,
        category: check.category,
        results: [{
          status: 'FAIL',
          entity: null,
          message: `Check threw error: ${err.message}`,
          details: options.verbose ? err.stack : null
        }]
      });
    }
  }

  return results;
}

module.exports = { discoverChecks, runChecks };
