const mysql = require('mysql2/promise');

async function checkContentStructure() {
  console.log('🔍 Checking Content Structure...\n');

  // MySQL connection
  const mysqlConnection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'T770sz#!',
    database: 'Kupat1New'
  });

  try {
    // Check lutcontentitemtype
    console.log('📋 LutContentItemType:');
    console.log('='.repeat(60));
    const [itemTypes] = await mysqlConnection.execute('SELECT * FROM lutcontentitemtype');
    console.table(itemTypes);

    // Check EntityContent
    console.log('\n📦 EntityContent (sample):');
    console.log('='.repeat(60));
    const [contents] = await mysqlConnection.execute('SELECT * FROM entitycontent LIMIT 5');
    console.table(contents);

    // Check EntityContentItem
    console.log('\n📝 EntityContentItem (sample):');
    console.log('='.repeat(60));
    const [contentItems] = await mysqlConnection.execute('SELECT * FROM entitycontentitem LIMIT 5');
    console.table(contentItems);

    // Check ProjectLocalization ContentId usage
    console.log('\n🔗 ProjectLocalization with ContentId:');
    console.log('='.repeat(60));
    const [plContent] = await mysqlConnection.execute(`
      SELECT pl.Id, pl.ProjectId, pl.Language, pl.ContentId, pl.Title
      FROM projectlocalization pl
      WHERE pl.ContentId IS NOT NULL
      LIMIT 5
    `);
    console.table(plContent);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mysqlConnection.end();
  }
}

checkContentStructure();
