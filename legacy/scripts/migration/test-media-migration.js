// Script to test media migration with a small sample
const fs = require('fs');

async function testMediaMigration() {
  console.log('🎬 Testing Media Migration');
  console.log('========================\n');

  // Load the mapping file
  console.log('📂 Loading mapping file...');
  const mapping = JSON.parse(fs.readFileSync('./mappings/ProjectMapping_Funds_Fixed.json', 'utf-8'));

  console.log('✅ Mapping loaded successfully\n');

  // Show media mappings structure
  console.log('📋 Media Mappings Configuration:');
  console.log('   Languages:', Object.keys(mapping.mediaMappings));
  for (const [lang, types] of Object.entries(mapping.mediaMappings)) {
    console.log(`   ${lang}:`, Object.keys(types).join(', '));
  }
  console.log('');

  // Show sample media mapping
  console.log('🖼️  Sample: Hebrew Project Image');
  const hebrewImage = mapping.mediaMappings.hebrew.projectImage;
  console.log('   RelativePath:', hebrewImage.RelativePath.oldColumn);
  console.log('   YearDirectory:', hebrewImage.YearDirectory.value);
  console.log('   MonthDirectory:', hebrewImage.MonthDirectory.value);
  console.log('   SourceType:', hebrewImage.SourceType.value);
  console.log('   MediaType:', hebrewImage.MediaType.value);
  console.log('   Condition:', hebrewImage.condition);
  console.log('');

  // Ask for confirmation
  console.log('⚠️  This will:');
  console.log('   1. Clear existing data from: project, projectLocalization, projectItem, media, linkSetting, entityContent, entityContentItem');
  console.log('   2. Migrate 5 Funds projects');
  console.log('   3. Create ProjectLocalization records (3 per project)');
  console.log('   4. Create ProjectItem records (1 per project)');
  console.log('   5. Create Media records (up to 9 per project, based on conditions)');
  console.log('   6. Create LinkSetting records (3 per project - Hebrew, English, French)');
  console.log('   7. Update ProjectLocalization.MainLinkButtonSettingId for each language');
  console.log('   8. Create EntityContent records (up to 3 per project - one per language with content)');
  console.log('   9. Create EntityContentItem records (1 per EntityContent with ItemType=11)');
  console.log('   10. Update ProjectLocalization.ContentId for each language');
  console.log('');

  // Prepare the migration request
  console.log('🚀 Starting migration...\n');

  try {
    const response = await fetch('http://localhost:3030/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableName: 'project',
        mappings: mapping.columnMappings,
        fkMappings: mapping.fkMappings,
        localizationMappings: mapping.localizationMappings,
        projectItemMappings: mapping.projectItemMappings,
        mediaMappings: mapping.mediaMappings,
        whereClause: mapping.whereClause + ' AND productsid <= 3' // Only first 3 projects for testing
      })
    });

    const result = await response.json();

    console.log('═══════════════════════════════════════════════════════');
    console.log('                    MIGRATION RESULTS                  ');
    console.log('═══════════════════════════════════════════════════════\n');

    if (result.success) {
      console.log('✅ Migration completed successfully!\n');

      // Project results
      if (result.project) {
        console.log('📊 PROJECT TABLE:');
        console.log(`   Total rows: ${result.project.totalRows}`);
        console.log(`   Inserted: ${result.project.insertedCount}`);
        if (result.project.errors && result.project.errors.length > 0) {
          console.log(`   ❌ Errors: ${result.project.errors.length}`);
          result.project.errors.slice(0, 3).forEach((err, i) => {
            console.log(`      ${i + 1}. ${err}`);
          });
        }
        console.log('');
      }

      // ProjectLocalization results
      if (result.projectLocalization) {
        console.log('🌍 PROJECT LOCALIZATION TABLE:');
        console.log(`   Total rows: ${result.projectLocalization.totalRows}`);
        console.log(`   Inserted: ${result.projectLocalization.insertedCount}`);
        if (result.projectLocalization.errors && result.projectLocalization.errors.length > 0) {
          console.log(`   ❌ Errors: ${result.projectLocalization.errors.length}`);
        }
        console.log('');
      }

      // ProjectItem results
      if (result.projectItem) {
        console.log('🔧 PROJECT ITEM TABLE:');
        console.log(`   Inserted: ${result.projectItem.insertedCount}`);
        if (result.projectItem.errors && result.projectItem.errors.length > 0) {
          console.log(`   ❌ Errors: ${result.projectItem.errors.length}`);
          result.projectItem.errors.slice(0, 3).forEach((err, i) => {
            console.log(`      ${i + 1}. ${err}`);
          });
        }
        console.log('');
      }

      // Media results - THE NEW PART!
      if (result.media) {
        console.log('📸 MEDIA TABLE:');
        console.log(`   ✨ Inserted: ${result.media.insertedCount}`);

        if (result.media.errors && result.media.errors.length > 0) {
          console.log(`   ❌ Errors: ${result.media.errors.length}`);
          result.media.errors.slice(0, 5).forEach((err, i) => {
            console.log(`      ${i + 1}. ${err}`);
          });
        } else {
          console.log('   ✅ No errors!');
        }

        // Calculate expected vs actual
        const projectCount = result.project?.insertedCount || 0;
        const maxPossibleMedia = projectCount * 9; // 9 media types per project
        const percentage = projectCount > 0
          ? ((result.media.insertedCount / maxPossibleMedia) * 100).toFixed(1)
          : 0;

        console.log(`   📊 Coverage: ${result.media.insertedCount}/${maxPossibleMedia} possible (${percentage}%)`);
        console.log('   ℹ️  Note: Not all projects have all 9 media types (based on conditions)');
        console.log('');
      } else {
        console.log('⚠️  No media results returned - check if mediaMappings was processed');
        console.log('');
      }

      // LinkSetting results
      if (result.linkSetting) {
        console.log('🔗 LINKSETTING TABLE:');
        console.log(`   ✨ Inserted: ${result.linkSetting.insertedCount}`);

        if (result.linkSetting.errors && result.linkSetting.errors.length > 0) {
          console.log(`   ❌ Errors: ${result.linkSetting.errors.length}`);
          result.linkSetting.errors.slice(0, 5).forEach((err, i) => {
            console.log(`      ${i + 1}. ${err}`);
          });
        } else {
          console.log('   ✅ No errors!');
        }

        // Three LinkSettings per project (one per language)
        const projectCount = result.project?.insertedCount || 0;
        console.log(`   📊 Expected: ${projectCount * 3} (3 per project - Hebrew, English, French)`);
        console.log('');
      } else {
        console.log('⚠️  No linkSetting results returned');
        console.log('');
      }

      // Display EntityContent results
      if (result.entityContent) {
        console.log('📄 EntityContent:');
        console.log(`   ✅ Created: ${result.entityContent.insertedCount}`);
        if (result.entityContent.errors && result.entityContent.errors.length > 0) {
          console.log(`   ❌ Errors: ${result.entityContent.errors.length}`);
          result.entityContent.errors.slice(0, 3).forEach(err => {
            console.log(`      - ${err.language}: ${err.error}`);
          });
        } else {
          console.log('   ✅ No errors!');
        }
        console.log(`   📊 Expected: up to ${projectCount * 3} (3 per project if content exists)`);
        console.log('');

        console.log('📝 EntityContentItem:');
        console.log(`   ✅ Created: ${result.entityContent.contentItemInsertedCount}`);
        console.log(`   📊 Expected: ${result.entityContent.insertedCount} (1 per EntityContent)`);
        console.log('');
      } else {
        console.log('⚠️  No entityContent results returned');
        console.log('');
      }

      console.log('═══════════════════════════════════════════════════════\n');

      // Summary
      console.log('📝 SUMMARY:');
      console.log(`   Projects migrated: ${result.project?.insertedCount || 0}`);
      console.log(`   Localization records: ${result.projectLocalization?.insertedCount || 0}`);
      console.log(`   ProjectItem records: ${result.projectItem?.insertedCount || 0}`);
      console.log(`   Media records: ${result.media?.insertedCount || 0}`);
      console.log(`   LinkSetting records: ${result.linkSetting?.insertedCount || 0} 🎉`);
      console.log('');

      console.log('💡 Next steps:');
      console.log('   1. Check the logs: powershell -Command "Get-Content migration-logs.log -Tail 50"');
      console.log('   2. Query the media table to verify the data');
      console.log('   3. Check that conditions are working correctly');
      console.log('');

    } else {
      console.log('❌ Migration failed!');
      console.log('   Error:', result.message || 'Unknown error');
      console.log('');
    }

  } catch (error) {
    console.error('💥 Error during migration:');
    console.error('   ', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('   1. Is the server running? (npm start)');
    console.error('   2. Are database connections configured?');
    console.error('   3. Check migration-logs.log for details');
  }
}

// Run the test
testMediaMigration();
