const express = require('express');
const router = express.Router();
const path = require('path');
const logger = require('../logger');

// Reuse validation lib from scripts
const libPath = path.resolve(__dirname, '../../../scripts/validate/lib');
const db = require(path.join(libPath, 'db'));
const runner = require(path.join(libPath, 'runner'));
const reporter = require(path.join(libPath, 'reporter'));

// Active validation jobs
const jobs = new Map();
let jobCounter = 0;

// POST /api/validation/run - Start a validation job
router.post('/run', async (req, res) => {
  const { checks, category, entity, severity, sampleSize, verbose } = req.body || {};
  const jobId = ++jobCounter;
  const io = req.app.get('io');

  const job = {
    id: jobId,
    status: 'running',
    startTime: Date.now(),
    options: { checks, category, entity, severity, sampleSize, verbose },
    report: null,
    error: null
  };
  jobs.set(jobId, job);

  res.json({ jobId, status: 'started' });

  // Run in background
  (async () => {
    try {
      await db.connect();
      if (io) io.emit('validation:started', { jobId });

      const checkResults = await runner.runChecks(job.options);
      job.report = reporter.buildReport(checkResults, job.startTime);
      job.status = 'completed';

      if (io) io.emit('validation:completed', { jobId, report: job.report });
      logger.info('Validation completed', { jobId, summary: job.report.summary });
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      if (io) io.emit('validation:error', { jobId, error: err.message });
      logger.error('Validation failed', { jobId, error: err.message });
    }
  })();
});

// GET /api/validation/results/:jobId
router.get('/results/:jobId', (req, res) => {
  const job = jobs.get(parseInt(req.params.jobId));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /api/validation/latest
router.get('/latest', (req, res) => {
  let latest = null;
  for (const job of jobs.values()) {
    if (job.status === 'completed' && (!latest || job.startTime > latest.startTime)) {
      latest = job;
    }
  }
  if (!latest) return res.status(404).json({ error: 'No completed validations' });
  res.json(latest);
});

// GET /api/validation/checks - List available checks
router.get('/checks', (req, res) => {
  try {
    const checks = runner.discoverChecks();
    res.json(checks.map(c => ({
      id: c.id,
      name: c.name,
      severity: c.severity,
      category: c.category,
      file: c.file
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
