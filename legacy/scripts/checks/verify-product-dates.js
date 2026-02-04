const { loadProductDatesMapping, getCreatedDateForProduct } = require('../utils/product-date-helper');

/**
 * בודק את מיפוי התאריכים של Products
 */
function verifyProductDates() {
  console.log('🔍 בודק מיפוי תאריכים...\n');

  try {
    // טען מיפוי
    const data = loadProductDatesMapping();
    const mapping = data.mapping;

    console.log('━'.repeat(60));
    console.log('📊 מטא-דאטה:');
    console.log('━'.repeat(60));
    console.log(JSON.stringify(data.metadata, null, 2));

    console.log('\n' + '━'.repeat(60));
    console.log('🔍 בדיקת 10 ProductIds ראשונים:');
    console.log('━'.repeat(60));

    const productIds = Object.keys(mapping).map(Number).sort((a, b) => a - b).slice(0, 10);

    productIds.forEach(id => {
      const date = getCreatedDateForProduct(id, mapping);
      const info = mapping[id];
      console.log(`ProductId ${String(id).padStart(5)} → ${date.toISOString().split('T')[0]} (day ${info.daysFromStart})`);
    });

    console.log('\n' + '━'.repeat(60));
    console.log('🔍 בדיקת ProductIds אקראיים:');
    console.log('━'.repeat(60));

    // ProductIds ספציפיים לבדיקה
    const testIds = [1, 100, 500, 1000, 1957, 2000];

    testIds.forEach(id => {
      const date = getCreatedDateForProduct(id, mapping);
      const info = mapping[id];

      if (info) {
        console.log(`ProductId ${String(id).padStart(5)} → ${date.toISOString().split('T')[0]} (day ${info.daysFromStart})`);
      } else {
        console.log(`ProductId ${String(id).padStart(5)} → לא נמצא במיפוי`);
      }
    });

    console.log('\n' + '━'.repeat(60));
    console.log('✅ בדיקת הפרשי זמן:');
    console.log('━'.repeat(60));

    // בדוק שההפרש בין כל שני ProductIds עוקבים הוא 2 ימים
    const allIds = Object.keys(mapping).map(Number).sort((a, b) => a - b);
    let errors = 0;

    for (let i = 0; i < Math.min(10, allIds.length - 1); i++) {
      const id1 = allIds[i];
      const id2 = allIds[i + 1];

      const date1 = new Date(mapping[id1].CreatedAt);
      const date2 = new Date(mapping[id2].CreatedAt);

      const diffDays = (date2 - date1) / (1000 * 60 * 60 * 24);

      if (diffDays === 2) {
        console.log(`✅ ProductId ${id1} → ${id2}: הפרש ${diffDays} ימים`);
      } else {
        console.log(`❌ ProductId ${id1} → ${id2}: הפרש ${diffDays} ימים (צפוי 2)`);
        errors++;
      }
    }

    if (errors === 0) {
      console.log('\n🎉 כל הבדיקות עברו בהצלחה!\n');
    } else {
      console.log(`\n⚠️  נמצאו ${errors} שגיאות\n`);
    }

    return { success: errors === 0, data };

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
    return { success: false, error: err };
  }
}

// הרץ אם קוראים ישירות
if (require.main === module) {
  const result = verifyProductDates();
  process.exit(result.success ? 0 : 1);
}

module.exports = { verifyProductDates };
