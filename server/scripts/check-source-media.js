// Script to check source media data and migration results
const mssqlDb = require('../src/db/mssql');
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function checkSourceMedia() {
  let mysqlConn;

  try {
    console.log('=== SOURCE MEDIA ANALYSIS ===\n');

    // Check source products.Pic field
    console.log('--- 1. SOURCE PRODUCTS PIC FIELD ---');
    const picStats = await mssqlDb.query(`
      SELECT
        COUNT(*) as total_products,
        SUM(CASE WHEN Pic IS NOT NULL AND Pic != '' THEN 1 ELSE 0 END) as has_pic,
        SUM(CASE WHEN ProjectVideo IS NOT NULL AND ProjectVideo != '' THEN 1 ELSE 0 END) as has_video,
        SUM(CASE WHEN DonationPageBanner1 IS NOT NULL AND DonationPageBanner1 != '' THEN 1 ELSE 0 END) as has_banner
      FROM products WITH (NOLOCK)
    `);
    console.log('Total products:', picStats.recordset[0].total_products);
    console.log('With Pic:', picStats.recordset[0].has_pic);
    console.log('With ProjectVideo:', picStats.recordset[0].has_video);
    console.log('With DonationPageBanner1:', picStats.recordset[0].has_banner);

    // Sample Pic values
    console.log('\n--- 2. SAMPLE PIC VALUES FROM SOURCE ---');
    const picSamples = await mssqlDb.query(`
      SELECT TOP 10 productsid, Name, Pic, Pic_en, Pic_fr
      FROM products WITH (NOLOCK)
      WHERE Pic IS NOT NULL AND Pic != ''
      ORDER BY productsid
    `);
    picSamples.recordset.forEach(row => {
      console.log('ProductID ' + row.productsid + ': ' + row.Pic);
      if (row.Pic_en) console.log('  EN: ' + row.Pic_en);
    });

    // Check funds specifically (using the same WHERE clause as the mapping)
    console.log('\n--- 3. FUNDS SOURCE DATA ---');
    const fundsCount = await mssqlDb.query(`
      SELECT COUNT(*) as cnt
      FROM products WITH (NOLOCK)
      WHERE IsNull(Certificate,0) != 1
        AND NOT EXISTS (SELECT 1 FROM ProductGroup g WITH (NOLOCK) WHERE g.ParentProductId=products.productsid OR g.SubProductId=products.productsid)
    `);
    console.log('Total Funds (matching base whereClause):', fundsCount.recordset[0].cnt);

    const fundsWithPic = await mssqlDb.query(`
      SELECT COUNT(*) as cnt
      FROM products WITH (NOLOCK)
      WHERE IsNull(Certificate,0) != 1
        AND NOT EXISTS (SELECT 1 FROM ProductGroup g WITH (NOLOCK) WHERE g.ParentProductId=products.productsid OR g.SubProductId=products.productsid)
        AND Pic IS NOT NULL AND Pic != ''
    `);
    console.log('Funds with Pic:', fundsWithPic.recordset[0].cnt);

    // Now connect to MySQL and check migration results
    console.log('\n--- 5. MIGRATION MEDIA RESULTS ---');
    mysqlConn = await mysql.createConnection(config.mysqlTarget);

    // Check media created with 2020/01 prefix (from migration)
    const [migMedia] = await mysqlConn.query(`
      SELECT COUNT(*) as cnt FROM media
      WHERE YearDirectory = '2020' AND MonthDirectory = '01'
    `);
    console.log('Media with YearDirectory=2020, MonthDirectory=01:', migMedia[0].cnt);

    // Check media by SourceType
    const [bySourceType] = await mysqlConn.query(`
      SELECT SourceType, COUNT(*) as cnt
      FROM media
      GROUP BY SourceType
    `);
    console.log('\nMedia by SourceType:');
    bySourceType.forEach(row => {
      const typeName = row.SourceType === 1 ? 'Project' : row.SourceType === 2 ? 'Gallery' : 'Other(' + row.SourceType + ')';
      console.log('  ' + typeName + ': ' + row.cnt);
    });

    // Check project table
    console.log('\n--- 6. PROJECT TABLE STATUS ---');
    const [projects] = await mysqlConn.query(`
      SELECT COUNT(*) as cnt, ProjectType FROM project GROUP BY ProjectType
    `);
    projects.forEach(row => {
      const typeName = row.ProjectType === 1 ? 'Fund' : row.ProjectType === 2 ? 'Collection' : 'Other(' + row.ProjectType + ')';
      console.log('  ' + typeName + ': ' + row.cnt);
    });

    // Check projectlocalization with MainMedia
    console.log('\n--- 7. PROJECTLOCALIZATION MEDIA LINKS ---');
    const [plCheck] = await mysqlConn.query(`
      SELECT
        pl.ProjectId, pl.Language, pl.MainMedia, pl.ImageForListsView,
        m1.RelativePath as MainMediaPath,
        m2.RelativePath as ImagePath
      FROM projectlocalization pl
      LEFT JOIN media m1 ON pl.MainMedia = m1.Id
      LEFT JOIN media m2 ON pl.ImageForListsView = m2.Id
      WHERE pl.ProjectId <= 5
      ORDER BY pl.ProjectId, pl.Language
    `);
    plCheck.forEach(row => {
      console.log('Project ' + row.ProjectId + ', Lang ' + row.Language + ':');
      console.log('  MainMedia=' + row.MainMedia + ' -> ' + (row.MainMediaPath || 'NULL'));
      console.log('  ImageForListsView=' + row.ImageForListsView + ' -> ' + (row.ImagePath || 'NULL'));
    });

    console.log('\n=== ANALYSIS COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await mssqlDb.close().catch(() => {});
    if (mysqlConn) await mysqlConn.end();
  }
}

checkSourceMedia();
