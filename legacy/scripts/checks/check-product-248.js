const mssql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function checkProduct248() {
  let mssqlPool;
  let mysqlConn;

  try {
    // Connect to MSSQL (old DB)
    console.log('חיבור ל-DB הישן...\n');
    mssqlPool = await mssql.connect(mssqlConfig);

    const oldResult = await mssqlPool.request().query(`
      SELECT
        ProductsId,
        Name,
        Name_en,
        Hide,
        Hide_en,
        Hide_fr,
        ShowMainPage,
        WithoutKupatView,
        ProjectNumber
      FROM products WITH (NOLOCK)
      WHERE ProductsId = 248
    `);

    console.log('=== נתונים מה-DB הישן (products) ===');
    console.log(JSON.stringify(oldResult.recordset[0], null, 2));
    console.log('\n');

    // Connect to MySQL (new DB)
    console.log('חיבור ל-DB החדש...\n');
    mysqlConn = await mysql.createConnection(mysqlConfig);

    const [newProject] = await mysqlConn.query(`
      SELECT
        id,
        Name,
        ProjectType,
        RecordStatus,
        DisplayAsSelfView
      FROM project
      WHERE id = 207
    `);

    console.log('=== נתונים מה-DB החדש (project) ===');
    console.log(JSON.stringify(newProject[0], null, 2));
    console.log('\n');

    const [newProjectLoc] = await mysqlConn.query(`
      SELECT
        Id,
        ProjectId,
        Language,
        Title,
        DisplayInSite
      FROM projectlocalization
      WHERE ProjectId = 207
      ORDER BY Language
    `);

    console.log('=== נתונים מ-projectLocalization ===');
    newProjectLoc.forEach(row => {
      const lang = row.Language === 1 ? 'עברית' : row.Language === 2 ? 'אנגלית' : 'צרפתית';
      console.log(`${lang} (Language=${row.Language}):`);
      console.log(`  Title: ${row.Title}`);
      console.log(`  DisplayInSite: ${row.DisplayInSite}`);
      console.log('');
    });

    const [newProjectItemLoc] = await mysqlConn.query(`
      SELECT
        pil.Id,
        pil.ItemId,
        pil.Language,
        pil.Title,
        pil.DisplayInSite
      FROM projectitemlocalization pil
      INNER JOIN projectitem pi ON pi.Id = pil.ItemId
      WHERE pi.ProjectId = 207
      ORDER BY pil.Language
    `);

    console.log('=== נתונים מ-projectItemLocalization ===');
    if (newProjectItemLoc.length > 0) {
      newProjectItemLoc.forEach(row => {
        const lang = row.Language === 1 ? 'עברית' : row.Language === 2 ? 'אנגלית' : 'צרפתית';
        console.log(`${lang} (Language=${row.Language}):`);
        console.log(`  ItemId: ${row.ItemId}`);
        console.log(`  Title: ${row.Title}`);
        console.log(`  DisplayInSite: ${row.DisplayInSite}`);
        console.log('');
      });
    } else {
      console.log('אין נתונים ב-projectItemLocalization\n');
    }

    // Analysis
    console.log('=== ניתוח ===');
    const oldData = oldResult.recordset[0];
    console.log(`\nערכי Hide במקור:`);
    console.log(`  Hide (עברית): ${oldData.Hide}`);
    console.log(`  Hide_en (אנגלית): ${oldData.Hide_en}`);
    console.log(`  Hide_fr (צרפתית): ${oldData.Hide_fr}`);
    console.log(`  ShowMainPage: ${oldData.ShowMainPage}`);

    console.log(`\nלפי הלוגיקה הנוכחית:`);
    console.log(`  עברית - DisplayInSite צריך להיות: ${(!oldData.Hide && oldData.ShowMainPage) ? 1 : 0}`);
    console.log(`  אנגלית - DisplayInSite צריך להיות: ${(!oldData.Hide_en && oldData.ShowMainPage) ? 1 : 0}`);
    console.log(`  צרפתית - DisplayInSite צריך להיות: ${(!oldData.Hide_fr && oldData.ShowMainPage) ? 1 : 0}`);

    console.log(`\nמה המשמעות של Hide_en=${oldData.Hide_en}?`);
    if (oldData.Hide_en) {
      console.log(`  ✓ Hide_en=true מציין "להסתיר באנגלית"`);
      console.log(`  ✓ לכן DisplayInSite לאנגלית צריך להיות 0 (לא להציג)`);
    } else {
      console.log(`  ✓ Hide_en=false/null מציין "לא להסתיר באנגלית"`);
      console.log(`  ✓ לכן DisplayInSite לאנגלית צריך להיות 1 (להציג) - אם ShowMainPage=true`);
    }

    console.log(`\nהאם ההסבה נכונה?`);
    newProjectLoc.forEach(row => {
      const lang = row.Language === 1 ? 'עברית' : row.Language === 2 ? 'אנגלית' : 'צרפתית';
      const hideField = row.Language === 1 ? 'Hide' : row.Language === 2 ? 'Hide_en' : 'Hide_fr';
      const hideValue = oldData[hideField];
      const expected = (!hideValue && oldData.ShowMainPage) ? 1 : 0;
      const actual = row.DisplayInSite;
      const match = expected === actual ? '✓' : '✗';

      console.log(`  ${match} ${lang}: צפוי=${expected}, בפועל=${actual}`);
    });

  } catch (error) {
    console.error('שגיאה:', error);
  } finally {
    if (mssqlPool) await mssqlPool.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

checkProduct248();
