// READ-ONLY: did donations of the 73 "shadowed" products (whose identity row in
// id_mappings entity 'Project' was blocked by an earlier prayer row) route to the
// correct Project? Donation routing goes through ProjectItem_* namespaces (keyed by
// productsid within each entity_type), so it SHOULD be immune — this proves/disproves it.

const mysql = require('mysql2/promise');
const config = require('../src/config/database');
const mssqlDb = require('../src/db/mssql');

async function srcQuery(sql) { return (await mssqlDb.query(sql)).recordset; }

async function main() {
  const target = await mysql.createConnection(config.mysqlTarget);
  const tracker = await mysql.createConnection(config.mysqlTracker);

  // rebuild the shadowed-product list: target Project rows whose Id is a source productsid
  // but with no identity bridge row
  const allSrc = await srcQuery('SELECT productsid FROM products WITH (NOLOCK)');
  const srcSet = new Set(allSrc.map(r => Number(r.productsid)));
  const [projRows] = await target.query('SELECT Id FROM Project WHERE Id > 1');
  const [ident] = await tracker.query(
    "SELECT target_id FROM id_mappings WHERE entity_type='Project' AND CAST(source_id AS UNSIGNED)=target_id");
  const identSet = new Set(ident.map(r => Number(r.target_id)));
  const shadowed = projRows.map(r => Number(r.Id)).filter(id => srcSet.has(id) && !identSet.has(id) && id !== 2432 && id !== 2433);
  console.log(`shadowed products (excluding post-migration source products 2432/2433): ${shadowed.length}`);

  // Donation schema: find the item/project reference column
  const [cols] = await target.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='Donation'", [config.mysqlTarget.database]);
  const colNames = cols.map(c => c.COLUMN_NAME);
  console.log('Donation columns:', colNames.join(', '));
  const itemCol = colNames.find(c => /^(Project)?ItemId$/i.test(c)) || colNames.find(c => /ItemId/i.test(c));
  console.log('using item column:', itemCol);

  // source donations for shadowed products (empty list = clean DB, nothing shadowed)
  const srcDon = shadowed.length ? await srcQuery(
    `SELECT OrdersId, ProjectId FROM Orders WITH (NOLOCK) WHERE ProjectId IN (${shadowed.join(',')})`) : [];
  console.log(`source Orders rows referencing shadowed products: ${srcDon.length}`);

  if (srcDon.length) {
    const ids = srcDon.map(r => Number(r.OrdersId));
    const srcProj = new Map(srcDon.map(r => [Number(r.OrdersId), Number(r.ProjectId)]));
    let ok = 0, wrongProject = [], toBucket1 = 0, notMigrated = 0;
    for (let i = 0; i < ids.length; i += 5000) {
      const batch = ids.slice(i, i + 5000);
      const [rows] = await target.query(
        `SELECT d.Id, d.\`${itemCol}\` itemId, pi.ProjectId piProject FROM Donation d LEFT JOIN ProjectItem pi ON pi.Id = d.\`${itemCol}\` WHERE d.Id IN (?)`, [batch]);
      const found = new Set();
      for (const r of rows) {
        found.add(Number(r.Id));
        if (Number(r.itemId) === 1) { toBucket1++; continue; }
        if (Number(r.piProject) === srcProj.get(Number(r.Id))) ok++;
        else wrongProject.push({ donationId: r.Id, itemId: r.itemId, itemProject: r.piProject, expectedProject: srcProj.get(Number(r.Id)) });
      }
      for (const id of batch) if (!found.has(id)) notMigrated++;
    }
    console.log(`routed correctly (item belongs to the right Project): ${ok}`);
    console.log(`routed to general bucket ItemId=1: ${toBucket1}`);
    console.log(`WRONG project: ${wrongProject.length}`);
    for (const w of wrongProject.slice(0, 15)) console.log('  ', JSON.stringify(w));
    console.log(`not migrated (not in Donation): ${notMigrated}`);
  }

  await target.end(); await tracker.end(); await mssqlDb.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(2); });
