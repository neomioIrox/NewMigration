/**
 * Post-migration runner: marks the first image of each Gallery as isMainMedia=1.
 *
 * Invoked by the engine when GalleryMediaMapping_Images.postMigrationRunners
 * includes "set-gallery-main-media". The BE likely uses isMainMedia to pick a
 * gallery cover image; the per-row mapping cannot express "first per gallery",
 * so it inserts NULL and this runner fixes it once all rows exist.
 *
 * Safe to run repeatedly: only touches galleries that have no isMainMedia=1 yet.
 * "First" = the GalleryMedia row with the lowest Id (engine inserts pics in
 * GaleryPicsId order, so lowest junction Id == first source pic).
 */
const targetDb = require('../../db/mysql-target');
const logger = require('../../logger');

async function run() {
  logger.info('post-runner: set-gallery-main-media starting');

  const [candidates] = await targetDb.query(`
    SELECT MIN(gm.Id) AS firstId, gm.GalleryId
    FROM GalleryMedia gm
    WHERE NOT EXISTS (
      SELECT 1 FROM GalleryMedia x
      WHERE x.GalleryId = gm.GalleryId AND x.isMainMedia = 1
    )
    GROUP BY gm.GalleryId
  `);

  if (candidates.length === 0) {
    logger.info('post-runner: set-gallery-main-media — nothing to do');
    return { updated: 0 };
  }

  let updated = 0;
  for (const row of candidates) {
    const [res] = await targetDb.query(
      'UPDATE GalleryMedia SET isMainMedia = 1 WHERE Id = ?',
      [row.firstId]
    );
    updated += res.affectedRows;
  }

  logger.info('post-runner: set-gallery-main-media completed', { updated });
  return { updated, galleries: candidates.length };
}

module.exports = { run };
