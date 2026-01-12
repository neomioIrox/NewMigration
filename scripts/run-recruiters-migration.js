/**
 * Run Recruiters migration
 */

const http = require('http');

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

async function runRecruitersMigration() {
  try {
    console.log('🚀 Running Recruiters migration...\n');
    console.log('📤 Sending request to /api/run-all-recruiters...\n');

    const result = await callApi('/api/run-all-recruiters', 'POST', {});

    if (result.success) {
      console.log('\n✅ Recruiters migration completed successfully!\n');

      if (result.results) {
        const r = result.results;

        if (r.step1_groups) {
          console.log(`📊 Step 1 - RecruitersGroups:`);
          console.log(`   Inserted: ${r.step1_groups.inserted || 0}`);
          console.log(`   Total: ${r.step1_groups.total || 0}`);
          console.log(`   Errors: ${r.step1_groups.errors || 0}`);
        }

        if (r.step1_5_groupLanguage) {
          console.log(`\n📊 Step 1.5 - RecruitersGroupLanguage:`);
          console.log(`   Inserted: ${r.step1_5_groupLanguage.inserted || 0}`);
        }

        if (r.step2_mapping) {
          console.log(`\n📊 Step 2 - RecruiterGroupId Mapping:`);
          console.log(`   Matched: ${r.step2_mapping.matched || 0}`);
          console.log(`   With NULL ProjectId: ${r.step2_mapping.matchedWithNull || 0}`);
          console.log(`   Total groups: ${r.step2_mapping.total || 0}`);
        }

        if (r.validation) {
          console.log(`\n📊 Step 2.5 - Validation:`);
          console.log(`   Status: ${r.validation.status}`);
          if (r.validation.missingMappings > 0) {
            console.log(`   ⚠️  Missing mappings: ${r.validation.missingMappings}`);
          }
        }

        if (r.step3_recruiters) {
          console.log(`\n📊 Step 3 - Recruiters:`);
          console.log(`   Inserted: ${r.step3_recruiters.inserted || 0}`);
          console.log(`   Skipped: ${r.step3_recruiters.skipped || 0}`);
          console.log(`   Errors: ${r.step3_recruiters.errors || 0}`);
          console.log(`   Total: ${r.step3_recruiters.total || 0}`);
        }

        if (r.step4_mapping) {
          console.log(`\n📊 Step 4 - RecruiterId Mapping:`);
          console.log(`   Matched: ${r.step4_mapping.matched || 0}`);
        }

        if (r.step5_localization) {
          console.log(`\n📊 Step 5 - RecruiterLocalization:`);
          console.log(`   Inserted: ${r.step5_localization.inserted || 0}`);
        }
      }

      console.log('\n✅ All steps completed!\n');
      return result;

    } else {
      console.log('\n❌ Recruiters migration failed!');
      console.log(`   Error: ${result.error || result.message || 'Unknown error'}`);
      throw new Error(result.error || result.message || 'Migration failed');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

runRecruitersMigration();
