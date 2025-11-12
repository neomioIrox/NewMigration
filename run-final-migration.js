// Final migration script with correct database credentials
const fs = require('fs');

async function runFinalMigration() {
  console.log('========================================');
  console.log('   FINAL MIGRATION - FUNDS PROJECT');
  console.log('========================================\n');

  // Load the fixed mapping
  console.log('Loading ProjectMapping_Funds.json...');
  const mapping = JSON.parse(fs.readFileSync('./mappings/ProjectMapping_Funds.json', 'utf-8'));

  console.log('\n✅ Fixed Expressions:');
  console.log('  - AllowFreeAddPrayerNames:', mapping.projectItemMappings.funds.AllowFreeAddPrayerNames.expression);
  console.log('  - ItemName:', mapping.projectItemMappings.funds.ItemName.expression);

  console.log('\n📊 Running migration...\n');

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
        whereClause: mapping.whereClause
      })
    });

    const result = await response.json();

    console.log('========================================');
    console.log('         MIGRATION RESULTS');
    console.log('========================================\n');

    if (!result.success) {
      console.error('❌ Migration failed:', result.message);
      return;
    }

    // Project table
    if (result.project) {
      const projectSuccess = result.project.insertedCount === result.project.totalRows;
      console.log(`📦 Project Table: ${projectSuccess ? '✅' : '⚠️'}`);
      console.log(`   Inserted: ${result.project.insertedCount}/${result.project.totalRows}`);
      if (result.project.errors && result.project.errors.length > 0) {
        console.log(`   Errors: ${result.project.errors.length}`);
      }
    }

    // ProjectLocalization table
    if (result.projectLocalization) {
      const locSuccess = result.projectLocalization.insertedCount === result.projectLocalization.totalRows;
      console.log(`\n🌍 ProjectLocalization Table: ${locSuccess ? '✅' : '⚠️'}`);
      console.log(`   Inserted: ${result.projectLocalization.insertedCount}/${result.projectLocalization.totalRows}`);
      if (result.projectLocalization.errors && result.projectLocalization.errors.length > 0) {
        console.log(`   Errors: ${result.projectLocalization.errors.length}`);
      }
    }

    // ProjectItem table
    if (result.projectItem) {
      const expectedItems = result.project ? result.project.totalRows : 1395;
      const itemSuccess = result.projectItem.insertedCount === expectedItems;
      console.log(`\n📝 ProjectItem Table: ${itemSuccess ? '✅' : '⚠️'}`);
      console.log(`   Inserted: ${result.projectItem.insertedCount}/${expectedItems}`);
      if (result.projectItem.errors && result.projectItem.errors.length > 0) {
        console.log(`   Errors: ${result.projectItem.errors.length}`);

        // Group errors by type
        const errorTypes = {};
        result.projectItem.errors.forEach(err => {
          const msg = err.error || 'Unknown error';
          if (msg.includes('AllowFreeAddPrayerNames')) {
            errorTypes['AllowFreeAddPrayerNames NULL'] = (errorTypes['AllowFreeAddPrayerNames NULL'] || 0) + 1;
          } else if (msg.includes('ItemName')) {
            errorTypes['ItemName too long'] = (errorTypes['ItemName too long'] || 0) + 1;
          } else {
            errorTypes[msg.substring(0, 50)] = (errorTypes[msg.substring(0, 50)] || 0) + 1;
          }
        });

        console.log('\n   Error breakdown:');
        Object.entries(errorTypes).forEach(([type, count]) => {
          console.log(`     - ${type}: ${count}`);
        });
      }
    }

    console.log('\n========================================');
    console.log('✅ Migration completed!');
    console.log('========================================\n');

    console.log('💡 Next steps:');
    if (result.projectItem && result.projectItem.errors && result.projectItem.errors.length > 0) {
      console.log('  - Check migration-logs.log for detailed error information');
      console.log('  - Run: node check-projectitem.js to verify database state');
    } else {
      console.log('  - All tables migrated successfully!');
      console.log('  - Ready for Collections migration (ProjectMapping_Collections.json)');
    }

  } catch (error) {
    console.error('\n❌ Migration request failed:', error.message);
  }
}

runFinalMigration();
