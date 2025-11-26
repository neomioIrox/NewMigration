/**
 * Create mapping between old ProductStock.ID and new recruiter.Id
 *
 * Logic:
 * 1. Get all old ProductStock with (ID, Name, RecruiterGroupId)
 * 2. Convert old RecruiterGroupId to new RecruiterGroupId using mapping
 * 3. Find matching new recruiter by (Name, RecruiterGroupId)
 * 4. Create mapping: old ID -> new Id
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

// Load RecruiterGroupId mapping
const recruiterGroupMappingPath = path.join(__dirname, '../../data/fk-mappings/RecruiterGroupId.json');
const recruiterGroupMapping = JSON.parse(fs.readFileSync(recruiterGroupMappingPath, 'utf-8'));

async function createMapping() {
  console.log('Creating Recruiter ID mapping...\n');

  try {
    // Connect to both databases
    const mssqlPool = await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Get old ProductStock
    const oldRecruiters = await mssqlPool.request().query(`
      SELECT ProductStockId, Name, GroupId
      FROM ProductStock
      WHERE GroupId IS NOT NULL
    `);
    console.log(`Found ${oldRecruiters.recordset.length} recruiters in old DB`);

    // Get new recruiters
    const [newRecruiters] = await mysqlConn.query(`
      SELECT Id, Name, RecruiterGroupId
      FROM recruiter
    `);
    console.log(`Found ${newRecruiters.length} recruiters in new DB`);

    // Create lookup map: Name|RecruiterGroupId -> Id
    const newRecruiterLookup = {};
    for (const recruiter of newRecruiters) {
      const key = `${recruiter.Name}|${recruiter.RecruiterGroupId}`;
      newRecruiterLookup[key] = recruiter.Id;
    }

    // Create mapping
    const recruiterIdMapping = {};
    let matched = 0;
    let notMatched = 0;

    for (const oldRecruiter of oldRecruiters.recordset) {
      // Convert old GroupId to new RecruiterGroupId
      const newRecruiterGroupId = recruiterGroupMapping.mappings[oldRecruiter.GroupId.toString()];

      if (newRecruiterGroupId) {
        const key = `${oldRecruiter.Name}|${newRecruiterGroupId}`;
        const newId = newRecruiterLookup[key];

        if (newId) {
          recruiterIdMapping[oldRecruiter.ProductStockId] = newId;
          matched++;
        } else {
          notMatched++;
          if (notMatched <= 5) {
            console.log(`No match for: ${oldRecruiter.Name} (old GroupId: ${oldRecruiter.GroupId}, new: ${newRecruiterGroupId})`);
          }
        }
      } else {
        notMatched++;
        if (notMatched <= 5) {
          console.log(`No RecruiterGroupId mapping for old GroupId: ${oldRecruiter.GroupId}`);
        }
      }
    }

    // Save mapping to JSON file
    const outputPath = path.join(__dirname, '../../data/fk-mappings/RecruiterId.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      columnName: 'RecruiterId',
      sourceTable: 'ProductStock',
      targetTable: 'recruiter',
      mappings: recruiterIdMapping,
      createdAt: new Date().toISOString()
    }, null, 2));

    console.log(`\nMapping created successfully!`);
    console.log(`- Matched: ${matched}`);
    console.log(`- Not matched: ${notMatched}`);
    console.log(`- Output file: ${outputPath}`);

    await mssqlPool.close();
    await mysqlConn.end();

  } catch (error) {
    console.error('Error creating mapping:', error);
    process.exit(1);
  }
}

createMapping();
