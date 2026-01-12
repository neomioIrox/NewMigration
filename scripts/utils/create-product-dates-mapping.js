const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const { mssqlConfig } = require('../../config/database');

/**
 * יצירת מיפוי מראש של ProductId → תאריך יצירה
 *
 * הגיון:
 * - התאריך מתחיל מלפני 5 שנים (מהיום)
 * - כל ProductId הבא מקבל תאריך גדול ב-2 ימים מהקודם
 * - הסדר: לפי ProductsId עולה
 *
 * זה חשוב כי Funds ו-Collections עוברים בנפרד, אז צריך consistency!
 */

async function createProductDatesMapping() {
  console.log('📅 יוצר מיפוי תאריכים לטבלת Products...\n');

  let mssqlConn;

  try {
    // התחבר ל-MSSQL
    console.log('🔌 מתחבר ל-SQL Server...');
    mssqlConn = await sql.connect(mssqlConfig);
    console.log('✅ חיבור הצליח\n');

    // שלב 1: שלוף את כל ה-ProductIds במיון עולה
    console.log('📊 שולף ProductIds מהטבלה...');
    const result = await sql.query(`
      SELECT productsid
      FROM products WITH (NOLOCK)
      ORDER BY productsid ASC
    `);

    const products = result.recordset;
    console.log(`✅ נמצאו ${products.length.toLocaleString()} products\n`);

    // שלב 2: חשב תאריך התחלה (לפני 5 שנים)
    const today = new Date();
    const fiveYearsAgo = new Date(today);
    fiveYearsAgo.setFullYear(today.getFullYear() - 5);

    console.log(`📅 תאריך התחלה: ${fiveYearsAgo.toISOString()}`);
    console.log(`   (לפני 5 שנים מהיום)\n`);

    // שלב 3: צור mapping - כל ProductId מקבל תאריך
    console.log('🔨 יוצר mapping...');
    const mapping = {};
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 2 ימים במילישניות

    products.forEach((product, index) => {
      const productId = product.productsid;
      const createdDate = new Date(fiveYearsAgo.getTime() + (index * TWO_DAYS_MS));

      mapping[productId] = {
        CreatedAt: createdDate.toISOString(),
        index: index,
        daysFromStart: index * 2
      };
    });

    console.log(`✅ נוצרו ${Object.keys(mapping).length.toLocaleString()} רשומות\n`);

    // שלב 4: הצג סטטיסטיקות
    const productIds = products.map(p => p.productsid);
    const minId = Math.min(...productIds);
    const maxId = Math.max(...productIds);
    const lastDate = new Date(fiveYearsAgo.getTime() + ((products.length - 1) * TWO_DAYS_MS));

    console.log('━'.repeat(60));
    console.log('📊 סטטיסטיקות:');
    console.log('━'.repeat(60));
    console.log(`ProductId טווח:     ${minId} → ${maxId}`);
    console.log(`תאריך ראשון:        ${fiveYearsAgo.toISOString().split('T')[0]}`);
    console.log(`תאריך אחרון:        ${lastDate.toISOString().split('T')[0]}`);
    console.log(`סה"כ ימים:          ${(products.length - 1) * 2} ימים`);
    console.log(`סה"כ שנים:          ${((products.length - 1) * 2 / 365).toFixed(2)} שנים\n`);

    // שלב 5: שמור לקובץ JSON
    const outputPath = path.join(__dirname, '../../data/fk-mappings/ProductCreatedDate.json');

    const output = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalProducts: products.length,
        minProductId: minId,
        maxProductId: maxId,
        startDate: fiveYearsAgo.toISOString(),
        endDate: lastDate.toISOString(),
        incrementDays: 2,
        description: 'ProductId → CreatedAt mapping. Each ProductId gets a date 2 days after the previous one.'
      },
      mapping: mapping
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`💾 נשמר לקובץ: ${outputPath}\n`);

    // הדגמה: הצג כמה דוגמאות
    console.log('━'.repeat(60));
    console.log('🔍 דוגמאות (10 ראשונים):');
    console.log('━'.repeat(60));
    products.slice(0, 10).forEach(product => {
      const data = mapping[product.productsid];
      console.log(`ProductId ${String(product.productsid).padStart(5)} → ${data.CreatedAt.split('T')[0]} (day ${data.daysFromStart})`);
    });

    console.log('\n✅ הושלם בהצלחה!\n');

    return output;

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
    throw err;
  } finally {
    if (mssqlConn) {
      await sql.close();
    }
  }
}

// הרץ אם קוראים ישירות
if (require.main === module) {
  createProductDatesMapping()
    .then(() => {
      console.log('🎉 סקריפט הושלם!');
      process.exit(0);
    })
    .catch(err => {
      console.error('💥 סקריפט נכשל:', err);
      process.exit(1);
    });
}

module.exports = { createProductDatesMapping };
