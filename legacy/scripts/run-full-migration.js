/**
 * Run full migration - Funds + Recruiters
 */

const http = require('http');

function callApi(path, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3030,
      path: path,
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
          resolve(body);
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

async function runMigration() {
  try {
    console.log('🚀 Starting full migration...\n');

    // Step 1: Run Funds migration
    console.log('📊 Step 1: Running Funds/Project migration...');
    console.log('   Endpoint: POST /api/migrate/funds');

    const fundsResult = await callApi('/api/migrate/funds', 'POST');

    if (fundsResult.success) {
      console.log('   ✅ Funds migration completed successfully!');
      console.log(`   Projects: ${fundsResult.results?.project?.inserted || 'N/A'}`);
      console.log(`   ProjectItems: ${fundsResult.results?.projectItem?.inserted || 'N/A'}`);
      console.log(`   ProjectLocalizations: ${fundsResult.results?.projectLocalization?.inserted || 'N/A'}`);
    } else {
      console.log('   ❌ Funds migration failed:', fundsResult.error);
      process.exit(1);
    }

    console.log('\n⏳ Waiting 2 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Run Recruiters migration
    console.log('📊 Step 2: Running Recruiters migration...');
    console.log('   Endpoint: POST /api/migrate/recruiters');

    const recruitersResult = await callApi('/api/migrate/recruiters', 'POST');

    if (recruitersResult.success) {
      console.log('   ✅ Recruiters migration completed successfully!');
      console.log(`   RecruitersGroups: ${recruitersResult.results?.step1_groups?.inserted || 'N/A'}`);
      console.log(`   Recruiters: ${recruitersResult.results?.step3_recruiters?.inserted || 'N/A'}`);
      console.log(`   RecruiterLocalizations: ${recruitersResult.results?.step5_localization?.inserted || 'N/A'}`);

      if (recruitersResult.results?.step1_groups?.inserted) {
        console.log(`\n   📌 RecruitersGroups details:`);
        console.log(`      Total groups: ${recruitersResult.results.step1_groups.total}`);
        console.log(`      Inserted: ${recruitersResult.results.step1_groups.inserted}`);
        console.log(`      Errors: ${recruitersResult.results.step1_groups.errors || 0}`);
      }

      if (recruitersResult.results?.step2_mapping) {
        console.log(`\n   📌 RecruiterGroupId mapping:`);
        console.log(`      Matched: ${recruitersResult.results.step2_mapping.matched}`);
        console.log(`      With NULL ProjectId: ${recruitersResult.results.step2_mapping.matchedWithNull || 0}`);
      }
    } else {
      console.log('   ❌ Recruiters migration failed:', recruitersResult.error);
    }

    console.log('\n✅ Full migration completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigration();
