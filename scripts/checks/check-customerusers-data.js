const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function checkCustomerUsersData() {
  console.log('🔍 בודק נתונים בטבלת Users (→ customeruser)...\n');

  let mssqlConn, mysqlConn;

  try {
    // Connect to databases
    console.log('📡 מתחבר לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // 1. Check old DB structure
    // ========================================
    console.log('━'.repeat(60));
    console.log('1️⃣  מבנה טבלת Users (DB ישן)');
    console.log('━'.repeat(60));

    const sampleResult = await sql.query`
      SELECT TOP 5 *
      FROM Users
      ORDER BY Id
    `;

    if (sampleResult.recordset.length > 0) {
      console.log('Columns:', Object.keys(sampleResult.recordset[0]).join(', '));
      console.log('\nדוגמה:');
      console.log(sampleResult.recordset[0]);
    }

    // ========================================
    // 2. Count total Users
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('2️⃣  סה"כ Users ב-DB הישן');
    console.log('━'.repeat(60));

    const countResult = await sql.query`
      SELECT COUNT(*) as total
      FROM Users
    `;
    console.log(`סה"כ: ${countResult.recordset[0].total} משתמשים\n`);

    // ========================================
    // 3. Check how many Orders reference Users
    // ========================================
    console.log('━'.repeat(60));
    console.log('3️⃣  Orders שתלויים ב-Users');
    console.log('━'.repeat(60));

    const ordersResult = await sql.query`
      SELECT COUNT(DISTINCT UserId) as uniqueCustomers,
             COUNT(*) as totalOrders
      FROM Orders
      WHERE UserId IS NOT NULL
    `;

    console.log(`משתמשים ייחודיים עם Orders: ${ordersResult.recordset[0].uniqueCustomers}`);
    console.log(`סה"כ Orders: ${ordersResult.recordset[0].totalOrders}\n`);

    // ========================================
    // 4. Check existing customeruser in new DB
    // ========================================
    console.log('━'.repeat(60));
    console.log('4️⃣  customeruser ב-DB החדש');
    console.log('━'.repeat(60));

    const [existingUsers] = await mysqlConn.query(`
      SELECT COUNT(*) as count FROM customeruser
    `);
    console.log(`customeruser קיימים: ${existingUsers[0].count}\n`);

    // ========================================
    // 5. Check new DB schema
    // ========================================
    console.log('━'.repeat(60));
    console.log('5️⃣  מבנה טבלת customeruser (DB חדש)');
    console.log('━'.repeat(60));

    const [newSchema] = await mysqlConn.query(`
      DESCRIBE customeruser
    `);

    newSchema.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type}${col.Null === 'NO' ? ' NOT NULL' : ''}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ בדיקה הושלמה!\n');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    throw err;
  } finally {
    if (mysqlConn) await mysqlConn.end();
    await sql.close();
  }
}

checkCustomerUsersData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Check failed:', err);
    process.exit(1);
  });
