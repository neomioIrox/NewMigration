/**
 * Run Funds/Project migration
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

function callApi(apiPath, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3030,
      path: apiPath,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runFundsMigration() {
  try {
    console.log('🚀 Running Funds/Project migration...\n');

    // Load the mapping file
    const mappingPath = path.join(__dirname, '../mappings/ProjectMapping_Funds_Fixed.json');

    if (!fs.existsSync(mappingPath)) {
      throw new Error(`Mapping file not found: ${mappingPath}`);
    }

    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    console.log('✅ Loaded mapping from ProjectMapping_Funds_Fixed.json\n');

    // Prepare the request body for /api/migrate
    const requestBody = {
      tableName: 'project',
      mappings: mapping.columnMappings || {},
      fkMappings: mapping.fkMappings || {},
      localizationMappings: mapping.localizationMappings || {},
      projectItemMappings: mapping.projectItemMappings || {},
      projectItemLocalizationMappings: mapping.projectItemLocalizationMappings || {},
      mediaMappings: mapping.mediaMappings || {},
      whereClause: mapping.whereClause || ''
    };

    console.log('📤 Sending migration request to /api/migrate...\n');
    console.log(`   WHERE clause: ${requestBody.whereClause || '(none)'}`);

    const result = await callApi('/api/migrate', 'POST', requestBody);

    if (result.success) {
      console.log('\n✅ Funds migration completed successfully!\n');

      if (result.project) {
        console.log(`📊 Project table:`);
        console.log(`   Inserted: ${result.project.insertedCount}`);
        console.log(`   Total: ${result.project.totalRows}`);
        if (result.project.errors && result.project.errors.length > 0) {
          console.log(`   Errors: ${result.project.errors.length}`);
        }
      }

      if (result.projectLocalization) {
        console.log(`\n📊 ProjectLocalization table:`);
        console.log(`   Inserted: ${result.projectLocalization.insertedCount}`);
        console.log(`   Total: ${result.projectLocalization.totalRows}`);
      }

      if (result.projectItem) {
        console.log(`\n📊 ProjectItem table:`);
        console.log(`   Inserted: ${result.projectItem.insertedCount}`);
        console.log(`   Total: ${result.projectItem.totalRows}`);
      }

      console.log('\n✅ Migration completed successfully!');
      return result;

    } else {
      console.log('\n❌ Funds migration failed!');
      console.log(`   Error: ${result.error || result.message || 'Unknown error'}`);
      throw new Error(result.error || result.message || 'Migration failed');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

runFundsMigration();
