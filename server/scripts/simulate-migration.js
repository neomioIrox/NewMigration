// Simulate what the migration does to find the bug
const mssqlDb = require('../src/db/mssql');
const mysql = require('mysql2/promise');
const config = require('../src/config/database');
const {evaluateCondition} = require('../src/engine/expression-eval');

async function simulate() {
  let targetConn;

  try {
    console.log('=== SIMULATING MIGRATION FOR ONE ROW ===\n');

    // Get source row for ProductID 1
    console.log('--- 1. GETTING SOURCE ROW ---');
    const result = await mssqlDb.query(`
      SELECT TOP 1 productsid, Name, Pic, Pic_en, Pic_fr,
             ProjectVideo, DonationPageBanner1,
             Hide, Hide_en, Hide_fr, ShowMainPage
      FROM products WITH (NOLOCK)
      WHERE productsid = 1
    `);
    const row = result.recordset[0];
    console.log('Source row:', JSON.stringify(row, null, 2));

    // Load the mapping
    const mapping = require('../mappings/ProjectMapping_Funds_Fixed.json');

    // Check the media condition
    console.log('\n--- 2. CHECKING MEDIA CONDITIONS ---');
    const mediaMappings = mapping.mediaMappings;

    for (const lang of Object.keys(mediaMappings)) {
      const langDefs = mediaMappings[lang];
      for (const mediaKey of Object.keys(langDefs)) {
        const mediaDef = langDefs[mediaKey];
        const condition = mediaDef.condition;
        const conditionResult = evaluateCondition(condition, row);
        console.log(lang + '_' + mediaKey + ':');
        console.log('  Condition: ' + condition);
        console.log('  Result: ' + conditionResult);

        if (conditionResult && mediaKey === 'projectImage') {
          const picCol = mediaDef.RelativePath.oldColumn;
          console.log('  Pic column: ' + picCol);
          console.log('  Pic value: ' + row[picCol]);
        }
      }
    }

    // Simulate what mediaIdMap would look like
    console.log('\n--- 3. SIMULATED MEDIA ID MAP ---');
    const mediaIdMap = {};
    for (const lang of Object.keys(mediaMappings)) {
      const langDefs = mediaMappings[lang];
      for (const mediaKey of Object.keys(langDefs)) {
        const mediaDef = langDefs[mediaKey];
        const condition = mediaDef.condition;
        if (evaluateCondition(condition, row)) {
          // Would have inserted media row and got back an ID
          mediaIdMap[lang + '_' + mediaKey] = '(would be new ID)';
        }
      }
    }
    console.log('mediaIdMap:', JSON.stringify(mediaIdMap, null, 2));

    // Check localization conditions
    console.log('\n--- 4. CHECKING LOCALIZATION CONDITIONS ---');
    const locConditions = mapping.localizationConditions;
    console.log('Condition for english:', locConditions?.english);
    console.log('Result for english:', locConditions?.english ? evaluateCondition(locConditions.english, row) : 'no condition');
    console.log('Condition for french:', locConditions?.french);
    console.log('Result for french:', locConditions?.french ? evaluateCondition(locConditions.french, row) : 'no condition');

    // Check what _postInsertUpdates would do
    console.log('\n--- 5. SIMULATING POST-INSERT UPDATES ---');
    const LANG_IDS = {hebrew: 1, english: 2, french: 3};

    // Assuming createdLangs = ['hebrew'] (only Hebrew created)
    const createdLangs = ['hebrew']; // simplified for demo
    const langsToUpdate = createdLangs.length > 0 ? createdLangs : ['hebrew', 'english', 'french'];

    console.log('createdLangs:', createdLangs);
    console.log('langsToUpdate:', langsToUpdate);

    for (const lang of langsToUpdate) {
      const langId = LANG_IDS[lang];
      const setData = {};

      // MainMedia calculation
      const imgKey = lang + '_projectImage';
      const vidKey = lang + '_projectVideo';
      let mainMedia = mediaIdMap[imgKey] || mediaIdMap[vidKey];
      if (!mainMedia && lang !== 'hebrew') {
        mainMedia = mediaIdMap['hebrew_projectImage'] || mediaIdMap['hebrew_projectVideo'];
      }
      if (!mainMedia) mainMedia = 1;
      setData.MainMedia = mainMedia;

      console.log('\n  Lang ' + lang + ' (' + langId + '):');
      console.log('    imgKey: ' + imgKey + ' -> ' + mediaIdMap[imgKey]);
      console.log('    vidKey: ' + vidKey + ' -> ' + mediaIdMap[vidKey]);
      console.log('    mainMedia: ' + mainMedia);
      console.log('    setData:', JSON.stringify(setData));
    }

    // Check actual state in DB
    console.log('\n--- 6. ACTUAL DB STATE ---');
    targetConn = await mysql.createConnection(config.mysqlTarget);

    const [plRows] = await targetConn.query(`
      SELECT ProjectId, Language, MainMedia, ImageForListsView
      FROM projectlocalization
      WHERE ProjectId = 2888
    `);
    console.log('projectlocalization for Project 2888:');
    plRows.forEach(r => {
      console.log('  Lang ' + r.Language + ': MainMedia=' + r.MainMedia + ', ImageForListsView=' + r.ImageForListsView);
    });

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await mssqlDb.close();
    if (targetConn) await targetConn.end();
  }
}

simulate();
