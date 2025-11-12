// Script to test migration with fixed mappings
const fs = require('fs');

async function runMigration() {
  console.log('Loading mapping file...');
  const mapping = JSON.parse(fs.readFileSync('./mappings/ProjectMapping_Funds.json', 'utf-8'));

  console.log('\n=== Fixed Expression for AllowFreeAddPrayerNames ===');
  console.log(mapping.projectItemMappings.funds.AllowFreeAddPrayerNames.expression);

  console.log('\n=== Fixed Expression for ItemName ===');
  console.log(mapping.projectItemMappings.funds.ItemName.expression);

  console.log('\n=== Running Migration ===');
  console.log('Sending request to http://localhost:3030/api/migrate...\n');

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

    console.log('\n=== Migration Result ===');
    console.log('Success:', result.success);
    console.log('Message:', result.message);

    if (result.project) {
      console.log('\n--- Project Table ---');
      console.log('Inserted:', result.project.insertedCount);
      console.log('Total:', result.project.totalRows);
      if (result.project.errors && result.project.errors.length > 0) {
        console.log('Errors:', result.project.errors.length);
        console.log('Sample errors:', result.project.errors.slice(0, 3));
      }
    }

    if (result.projectLocalization) {
      console.log('\n--- ProjectLocalization Table ---');
      console.log('Inserted:', result.projectLocalization.insertedCount);
      console.log('Total:', result.projectLocalization.totalRows);
      if (result.projectLocalization.errors && result.projectLocalization.errors.length > 0) {
        console.log('Errors:', result.projectLocalization.errors.length);
      }
    }

    if (result.projectItem) {
      console.log('\n--- ProjectItem Table ---');
      console.log('Inserted:', result.projectItem.insertedCount);
      if (result.projectItem.errors && result.projectItem.errors.length > 0) {
        console.log('Errors:', result.projectItem.errors.length);
        console.log('Sample errors:', result.projectItem.errors.slice(0, 5));
      }
    }

    console.log('\n=== Check Logs ===');
    console.log('For detailed logs, run: powershell -Command "Get-Content migration-logs.log -Tail 100"');

  } catch (error) {
    console.error('Migration failed:', error.message);
  }
}

runMigration();
