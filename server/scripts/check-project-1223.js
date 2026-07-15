// Check project 1223 (source) -> 932 (target) and its items
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    conn = await mysql.createConnection(config.mysqlTarget);

    console.log('=== Project 932 (source 1223) ===\n');

    // Check Project
    const [project] = await conn.query('SELECT * FROM project WHERE Id = 932');
    console.log('Project:', project[0] || 'NOT FOUND');

    // Check ProjectLocalization
    console.log('\n=== ProjectLocalization ===');
    const [projLoc] = await conn.query('SELECT * FROM projectlocalization WHERE ProjectId = 932');
    console.log('ProjectLocalization rows:', projLoc.length);
    projLoc.forEach(r => console.log('  Lang ' + r.Language + ': Id=' + r.Id));

    // Check ProjectItem
    console.log('\n=== ProjectItem ===');
    const [items] = await conn.query('SELECT Id, ProjectId FROM projectitem WHERE ProjectId = 932');
    console.log('ProjectItem rows:', items.length);
    items.forEach(r => console.log('  Item ' + r.Id));

    // Check ProjectItemLocalization
    console.log('\n=== ProjectItemLocalization ===');
    const [itemLoc] = await conn.query(`
      SELECT pil.*
      FROM projectitemlocalization pil
      JOIN projectitem pi ON pil.ItemId = pi.Id
      WHERE pi.ProjectId = 932
    `);
    console.log('ProjectItemLocalization rows:', itemLoc.length);
    itemLoc.forEach(r => console.log('  Item ' + r.ItemId + ', Lang ' + r.Language + ': Id=' + r.Id));

    // Check LinkSetting
    console.log('\n=== LinkSetting ===');
    const [links] = await conn.query('SELECT Id, LinkType, LinkTargetType, ItemId, LinkText FROM linksetting WHERE ProjectId = 932');
    console.log('LinkSetting rows:', links.length);
    links.forEach(r => console.log('  LinkSetting ' + r.Id + ' Type=' + r.LinkType + ' TargetType=' + r.LinkTargetType + ' ItemId=' + r.ItemId + ' Text=' + r.LinkText));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

check();
