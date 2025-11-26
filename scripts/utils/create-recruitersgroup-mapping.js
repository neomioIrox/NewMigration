/**
 * Create mapping between old RecruitersGroups.ID and new recruitersgroup.Id
 *
 * Logic:
 * 1. Get all old RecruitersGroups with (ID, Name, ProjectId)
 * 2. Convert old ProjectId to new ProjectId using product-to-project mapping
 * 3. Find matching new recruitersgroup by (Name, ProjectId)
 * 4. Create mapping: old ID -> new Id
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

// Load product-to-project mapping
const productToProjectPath = path.join(__dirname, '../../data/id-mappings/product-to-project.json');
const productToProject = JSON.parse(fs.readFileSync(productToProjectPath, 'utf-8'));

async function createMapping() {
  console.log('Creating RecruitersGroup ID mapping...\n');

  let mssqlPool, mysqlConn;

  try {
    // Connect to MSSQL
    console.log('Connecting to MSSQL...');
    mssqlPool = await sql.connect(mssqlConfig);
    console.log('MSSQL connected');

   xxxxxxxxxct to MySQL
    console.log('Connecting to MySQL...');
    mysqlConn = await mysql.createConnection(mysqlConfig);
    console.log('MySQL connected\n');

    // Get old RecruitersGroups
    console.log('Fetching old RecruitersGroups...');
    const oldGroups = await mssqlPool.request().query(`
      SELECT ID, Name, ProjectId
      FROM RecruitersGroups
      WHERE ProjectId IS NOT NULL
    `);
    console.log(`Found ${oldGroups.recordset.length} groups in old DB\n`);

    // Get new recruitersgroup
    console.log('Fetching new recruitersgroup...');
    const [newGroups] = await mysqlConn.query(`
      SELECT Id, Name, ProjectId
      FROM recruitersgroup
    `);
    console.log(`Found ${newGroups.length} groups in new DB\n`);

    // Create lookup by Name+ProjectId for new groups
    const newGroupLookup = {};
    for (const g of newGroups) {
      const key = `${g.Name}|${g.ProjectId}`;
      newGroupLookup[key] = g.Id;
    }

    // Create mapping
    const mapping = {};
    let matched = 0;
    let notMatched = 0;

    for (const oldGroup of oldGroups.recordset) {
      // Convert old ProjectId to new ProjectId
      const newProjectId = productToProject[oldGroup.ProjectId.toString()];

      if (!newProjectId) {
        console.log(`No project mapping for old ProjectId=${oldGroup.ProjectId} (Group: ${oldGroup.Name})`);
        notMatched++;
        continue;
      }

      // Find new group by Name + new ProjectId
      const key = `${oldGroup.Name}|${newProjectId}`;
      const newGroupId = newGroupLookup[key];

      if (newGroupId) {
        mapping[oldGroup.ID] = newGroupId;
        matched++;
      } else {
        console.log(`No match for old ID=${oldGroup.ID}, Name="${oldGroup.Name}", ProjectId=${oldGroup.ProjectId} -> ${newProjectId}`);
        notMatched++;
      }
    }

    console.log(`\nResults: ${matched} matched, ${notMatched} not matched`);

    // Save mapping
    const mappingData = {
      columnName: 'RecruiterGroupId',
      sourceTable: 'RecruitersGroups',
      keyColumn: 'ID',
      description: 'Mapping from old RecruitersGroups.ID to new recruitersgroup.Id',
      totalMappings: Object.keys(mapping).length,
      mappings: mapping,
      createdAt: new Date().toISOString()
    };

    // Save to fk-mappings folder (where server expects it)
    const fkMappingPath = path.join(__dirname, '../../data/fk-mappings/RecruiterGroupId.json');
    fs.writeFileSync(fkMappingPath, JSON.stringify(mappingData, null, 2));
    console.log(`\nSaved FK mapping to: ${fkMappingPath}`);

    // Also save to id-mappings for reference
    const idMappingPath = path.join(__dirname, '../../data/id-mappings/recruitersgroup-to-recruitersgroup.json');
    fs.writeFileSync(idMappingPath, JSON.stringify(mappingData, null, 2));
    console.log(`Saved ID mapping to: ${idMappingPath}`);

    console.log('\nDone!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (mssqlPool) await mssqlPool.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

createMapping();
