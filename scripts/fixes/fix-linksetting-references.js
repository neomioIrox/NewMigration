/**
 * Fix LinkSetting references in ProjectItemLocalization
 *
 * Problem: LinkSettings were created but ProjectItemLocalization wasn't updated
 * with MainButtonLinkSettingId and ProjectFooterLinkSettingId
 *
 * Solution: Find LinkSettings with matching ItemId and update ProjectItemLocalization
 */
const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../legacy/config/database');

// Configuration - set to specific project ID for testing, or null for all
const TEST_PROJECT_ID = process.argv[2] ? parseInt(process.argv[2]) : null;
const DRY_RUN = process.argv.includes('--dry-run');

async function fixLinkSettingReferences() {
  console.log('🔧 Fix LinkSetting References in ProjectItemLocalization');
  console.log('='.repeat(60));
  if (TEST_PROJECT_ID) {
    console.log(`🎯 Testing on Project ID: ${TEST_PROJECT_ID}`);
  } else {
    console.log('🌍 Running on ALL projects');
  }
  if (DRY_RUN) {
    console.log('📋 DRY RUN - no changes will be made\n');
  } else {
    console.log('⚡ LIVE RUN - changes will be applied\n');
  }

  const conn = await mysql.createConnection(mysqlConfig);
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Find all ProjectItems that need fixing
    let query = `
      SELECT
        pi.Id as ItemId,
        pi.ProjectId,
        pil.Language,
        pil.MainButtonLinkSettingId,
        pil.ProjectFooterLinkSettingId,
        ls_button.Id as ButtonLinkSettingId
      FROM projectitem pi
      JOIN projectitemlocalization pil ON pi.Id = pil.ItemId
      LEFT JOIN linksetting ls_button ON ls_button.ItemId = pi.Id
        AND ls_button.ProjectId = pi.ProjectId
        AND ls_button.LinkType = 1  -- Button type
        AND ls_button.LinkTargetType = 3  -- ToExecutionPage
      WHERE (pil.MainButtonLinkSettingId IS NULL OR pil.ProjectFooterLinkSettingId IS NULL)
    `;

    if (TEST_PROJECT_ID) {
      query += ` AND pi.ProjectId = ${TEST_PROJECT_ID}`;
    }

    query += ' ORDER BY pi.ProjectId, pi.Id, pil.Language';

    const [rows] = await conn.execute(query);
    console.log(`📊 Found ${rows.length} ProjectItemLocalization records to fix\n`);

    for (const row of rows) {
      const { ItemId, ProjectId, Language, MainButtonLinkSettingId, ProjectFooterLinkSettingId, ButtonLinkSettingId } = row;

      // Skip if no matching LinkSetting found
      if (!ButtonLinkSettingId) {
        console.log(`⚠️  Project ${ProjectId}, Item ${ItemId}, Lang ${Language}: No matching LinkSetting found - SKIPPED`);
        skipped++;
        continue;
      }

      // Check what needs updating
      const updates = {};
      if (!MainButtonLinkSettingId) {
        updates.MainButtonLinkSettingId = ButtonLinkSettingId;
      }
      if (!ProjectFooterLinkSettingId) {
        updates.ProjectFooterLinkSettingId = ButtonLinkSettingId;
      }

      if (Object.keys(updates).length === 0) {
        skipped++;
        continue;
      }

      console.log(`✏️  Project ${ProjectId}, Item ${ItemId}, Lang ${Language}:`);
      console.log(`    Setting MainButtonLinkSettingId = ${updates.MainButtonLinkSettingId || 'unchanged'}`);
      console.log(`    Setting ProjectFooterLinkSettingId = ${updates.ProjectFooterLinkSettingId || 'unchanged'}`);

      if (!DRY_RUN) {
        try {
          const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
          const values = [...Object.values(updates), ItemId, Language];

          await conn.execute(
            `UPDATE projectitemlocalization SET ${setClauses} WHERE ItemId = ? AND Language = ?`,
            values
          );
          updated++;
        } catch (err) {
          console.log(`    ❌ Error: ${err.message}`);
          errors++;
        }
      } else {
        updated++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made');
      console.log('   Run without --dry-run to apply changes');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await conn.end();
  }
}

fixLinkSettingReferences();
