const fs = require('fs');
const path = require('path');

// Read the mapping file
const mappingPath = path.join(__dirname, 'mappings', 'ProjectMapping.json');
const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// Determine which project type to use (collections or funds)
// For full migration, we'll use collections (ProjectType=2)
const projectType = 'collections';
const columnMappings = mappingData.projectMappings[projectType];
const fkMappings = mappingData.fkMappings ? mappingData.fkMappings[projectType] : {};

// Build the request body
const requestBody = {
  tableName: 'project',
  mappings: columnMappings,
  fkMappings: fkMappings,
  localizationMappings: mappingData.localizationMappings || {},
  projectItemMappings: mappingData.projectItemMappings || {},
  whereClause: null
};

// Make the API call
const http = require('http');

const postData = JSON.stringify(requestBody);

const options = {
  hostname: 'localhost',
  port: 3030,
  path: '/api/migrate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🚀 Starting migration...');
console.log('Project Type:', projectType);
console.log('Column Mappings:', Object.keys(columnMappings).length, 'fields');
console.log('Localization Mappings:', Object.keys(requestBody.localizationMappings).length, 'fields');
console.log('ProjectItem Mappings:', requestBody.projectItemMappings ? 'Yes' : 'No');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);

      if (result.success) {
        console.log('\n✅ Migration completed successfully!\n');

        if (result.project) {
          console.log('📊 Project table:', result.project.insertedCount, '/', result.project.totalRows, 'rows');
        }

        if (result.projectLocalization) {
          console.log('📊 ProjectLocalization:', result.projectLocalization.insertedCount, 'rows');
          if (result.projectLocalization.errors && result.projectLocalization.errors.length > 0) {
            console.log('⚠️  Errors:', result.projectLocalization.errors.length);
            result.projectLocalization.errors.slice(0, 5).forEach(err => {
              console.log('   -', err.error);
            });
          }
        }

        if (result.projectItem) {
          console.log('📊 ProjectItem:', result.projectItem.insertedCount, 'items created');
        }

        console.log('\n✅ Check migration-logs.log for detailed logs');
      } else {
        console.error('\n❌ Migration failed:', result.message);
      }
    } catch (err) {
      console.error('\n❌ Error parsing response:', err.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request failed:', err.message);
});

req.write(postData);
req.end();
