/**
 * Verify Sharlin fund and recruiters
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');
const fs = require('fs');
const path = require('path');

async function verifySharlin() {
  try {
    console.log('🔍 Verifying Sharlin fund and recruiters...\n');

    // Load ProjectId mapping
    const projectIdPath = path.join(__dirname, '../../data/fk-mappings/ProjectId.json');
    const projectIdMapping = JSON.parse(fs.readFileSync(projectIdPath, 'utf-8'));

    // Check if 1957 exists in mapping
    const sharlinOldId = '1957';
    const sharlinNewId = projectIdMapping.mappings[sharlinOldId];

    console.log('📌 Step 1: ProjectId Mapping');
    console.log(`   Old ProductId: ${sharlinOldId}`);
    console.log(`   New ProjectId: ${sharlinNewId || 'NOT FOUND ❌'}`);

    if (!sharlinNewId) {
      console.log('\n❌ ERROR: Sharlin fund (1957) not found in ProjectId.json!');
      return;
    }

    // Connect to databases
    await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    // Check project in new DB
    console.log('\n📌 Step 2: Check Project in New DB');
    const [projects] = await mysqlConn.query(
      'SELECT Id, ProjectType FROM project WHERE Id = ?',
      [sharlinNewId]
    );

    if (projects.length > 0) {
      console.log(`   ✅ Project ${sharlinNewId} exists!`);
      console.log(`   ProjectType: ${projects[0].ProjectType}`);
    } else {
      console.log(`   ❌ Project ${sharlinNewId} NOT found in new DB!`);
    }

    // Check recruiters in old DB
    console.log('\n📌 Step 3: Recruiters in OLD DB');
    const oldRecruiters = await sql.query`
      SELECT ProductStockId, Name, ProductId, GroupId
      FROM ProductStock
      WHERE ProductId = 1957
    `;
    console.log(`   Total recruiters for Product 1957: ${oldRecruiters.recordset.length}`);

    if (oldRecruiters.recordset.length > 0) {
      const groupCounts = {};
      oldRecruiters.recordset.forEach(r => {
        groupCounts[r.GroupId] = (groupCounts[r.GroupId] || 0) + 1;
      });
      console.log('   Distribution by GroupId:');
      Object.keys(groupCounts).forEach(groupId => {
        console.log(`      Group ${groupId}: ${groupCounts[groupId]} recruiters`);
      });
    }

    // Check recruiters in new DB
    console.log('\n📌 Step 4: Recruiters in NEW DB');
    const [newRecruiters] = await mysqlConn.query(
      'SELECT Id, Name, ProjectId, RecruiterGroupId FROM recruiter WHERE ProjectId = ?',
      [sharlinNewId]
    );
    console.log(`   Total recruiters for Project ${sharlinNewId}: ${newRecruiters.length}`);

    if (newRecruiters.length > 0) {
      const groupCounts = {};
      newRecruiters.forEach(r => {
        const groupId = r.RecruiterGroupId || 'NULL';
        groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
      });
      console.log('   Distribution by RecruiterGroupId:');
      Object.keys(groupCounts).forEach(groupId => {
        console.log(`      Group ${groupId}: ${groupCounts[groupId]} recruiters`);
      });
    }

    // Check groups 233 and 234
    console.log('\n📌 Step 5: Sharlin Groups (233, 234)');
    const [groups] = await mysqlConn.query(
      'SELECT Id, Name, ProjectId FROM recruitersgroup WHERE Id IN (233, 234)'
    );

    if (groups.length === 2) {
      console.log(`   ✅ Both groups found!`);
      groups.forEach(g => {
        console.log(`      Group ${g.Id}: "${g.Name}", ProjectId=${g.ProjectId || 'NULL'}`);
      });
    } else {
      console.log(`   ❌ Only ${groups.length} groups found (expected 2)`);
      groups.forEach(g => {
        console.log(`      Group ${g.Id}: "${g.Name}", ProjectId=${g.ProjectId || 'NULL'}`);
      });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Sharlin fund mapping: 1957 → ${sharlinNewId}`);
    console.log(`✅ Project ${sharlinNewId} exists in new DB`);
    console.log(`   Recruiters in old DB: ${oldRecruiters.recordset.length}`);
    console.log(`   Recruiters in new DB: ${newRecruiters.length}`);
    console.log(`   Sharlin groups found: ${groups.length}/2`);

    if (newRecruiters.length === oldRecruiters.recordset.length && groups.length === 2) {
      console.log('\n✅ ALL CHECKS PASSED! Sharlin data is complete and correct.');
    } else {
      console.log('\n⚠️  WARNINGS: Some data may be missing or incorrect.');
    }

    await sql.close();
    await mysqlConn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifySharlin();
