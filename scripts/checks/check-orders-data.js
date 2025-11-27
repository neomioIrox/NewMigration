const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkOrdersData() {
  console.log('🔍 בודק נתונים בטבלת Orders...\n');

  try {
    await sql.connect(mssqlConfig);

    // 1. Total count
    const totalResult = await sql.query`
      SELECT COUNT(*) as Total FROM Orders
    `;
    console.log(`📊 סה"כ רשומות: ${totalResult.recordset[0].Total}`);

    // 2. Count by ChargeStatus
    const statusResult = await sql.query`
      SELECT
        ChargeStatus,
        COUNT(*) as Count
      FROM Orders
      GROUP BY ChargeStatus
      ORDER BY Count DESC
    `;
    console.log('\n📈 לפי ChargeStatus:');
    statusResult.recordset.forEach(row => {
      console.log(`   ${row.ChargeStatus || 'NULL'}: ${row.Count}`);
    });

    // 3. Count eligible for migration (as per mapping filter)
    const eligibleResult = await sql.query`
      SELECT COUNT(*) as EligibleCount
      FROM Orders
      WHERE ChargeStatus = 'OrderFinished'
         OR DateCreated > DATEADD(month, -1, GETDATE())
    `;
    console.log(`\n✅ רשומות כשירות למיגרציה (OrderFinished או חודש אחרון): ${eligibleResult.recordset[0].EligibleCount}`);

    // 4. Count by PaymentMethod
    const paymentResult = await sql.query`
      SELECT
        PaymentMethod,
        COUNT(*) as Count
      FROM Orders
      WHERE ChargeStatus = 'OrderFinished'
         OR DateCreated > DATEADD(month, -1, GETDATE())
      GROUP BY PaymentMethod
      ORDER BY Count DESC
    `;
    console.log('\n💳 לפי PaymentMethod (רק רשומות כשירות):');
    paymentResult.recordset.slice(0, 15).forEach(row => {
      console.log(`   ${row.PaymentMethod || 'NULL'}: ${row.Count}`);
    });

    // 5. ProjectId analysis
    const projectResult = await sql.query`
      SELECT
        CASE
          WHEN ProjectId IS NULL THEN 'NULL'
          WHEN ProjectId = 0 THEN 'ZERO'
          ELSE 'HAS_VALUE'
        END as ProjectIdStatus,
        COUNT(*) as Count
      FROM Orders
      WHERE ChargeStatus = 'OrderFinished'
         OR DateCreated > DATEADD(month, -1, GETDATE())
      GROUP BY
        CASE
          WHEN ProjectId IS NULL THEN 'NULL'
          WHEN ProjectId = 0 THEN 'ZERO'
          ELSE 'HAS_VALUE'
        END
      ORDER BY Count DESC
    `;
    console.log('\n🎯 ניתוח ProjectId:');
    projectResult.recordset.forEach(row => {
      console.log(`   ${row.ProjectIdStatus}: ${row.Count}`);
    });

    // 6. PrayerId analysis
    const prayerResult = await sql.query`
      SELECT
        CASE
          WHEN PrayerId IS NULL THEN 'NULL'
          WHEN PrayerId = 0 THEN 'ZERO'
          ELSE 'HAS_VALUE'
        END as PrayerIdStatus,
        COUNT(*) as Count
      FROM Orders
      WHERE ChargeStatus = 'OrderFinished'
         OR DateCreated > DATEADD(month, -1, GETDATE())
      GROUP BY
        CASE
          WHEN PrayerId IS NULL THEN 'NULL'
          WHEN PrayerId = 0 THEN 'ZERO'
          ELSE 'HAS_VALUE'
        END
      ORDER BY Count DESC
    `;
    console.log('\n🙏 ניתוח PrayerId:');
    prayerResult.recordset.forEach(row => {
      console.log(`   ${row.PrayerIdStatus}: ${row.Count}`);
    });

    // 7. Sample data
    const sampleResult = await sql.query`
      SELECT TOP 3
        OrdersId,
        ChargeStatus,
        PaymentMethod,
        ProjectId,
        PrayerId,
        Total,
        Payments,
        DateCreated,
        UserSource,
        RecruiterId
      FROM Orders
      WHERE ChargeStatus = 'OrderFinished'
      ORDER BY DateCreated DESC
    `;
    console.log('\n📄 דוגמת 3 רשומות (OrderFinished):');
    sampleResult.recordset.forEach((row, i) => {
      console.log(`\n   ${i+1}. OrdersId: ${row.OrdersId}`);
      console.log(`      Status: ${row.ChargeStatus}, Method: ${row.PaymentMethod}`);
      console.log(`      ProjectId: ${row.ProjectId}, PrayerId: ${row.PrayerId}`);
      console.log(`      Total: ${row.Total}, Payments: ${row.Payments}`);
      console.log(`      Created: ${row.DateCreated}`);
      console.log(`      UserSource: ${row.UserSource || 'NULL'}`);
      console.log(`      RecruiterId: ${row.RecruiterId}`);
    });

    // 8. Check for orphaned records (ProjectId and PrayerId both NULL/0)
    const orphanedResult = await sql.query`
      SELECT COUNT(*) as OrphanedCount
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND (ProjectId IS NULL OR ProjectId = 0)
        AND (PrayerId IS NULL OR PrayerId = 0)
    `;
    console.log(`\n⚠️  רשומות ללא ProjectId וללא PrayerId (orphaned): ${orphanedResult.recordset[0].OrphanedCount}`);

    console.log('\n✅ בדיקה הושלמה!');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
  } finally {
    await sql.close();
  }
}

checkOrdersData();
