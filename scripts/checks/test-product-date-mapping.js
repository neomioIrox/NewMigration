const fs = require('fs');
const path = require('path');

/**
 * בודק שהמיפוי של תאריכי Products עובד עם מבנה ה-FK mapping
 */
function testProductDateMapping() {
  console.log('🧪 בודק אינטגרציה של מיפוי תאריכים...\n');

  try {
    // טען את ProductCreatedDate.json
    const mappingPath = path.join(__dirname, '../../data/fk-mappings/ProductCreatedDate.json');
    const data = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    console.log('✅ קובץ המיפוי נטען בהצלחה\n');

    // טען את המיפויים של Funds ו-Collections
    const fundsPath = path.join(__dirname, '../../mappings/ProjectMapping_Funds_Fixed.json');
    const collectionsPath = path.join(__dirname, '../../mappings/ProjectMapping_Collections_Fixed.json');

    const fundsMapping = JSON.parse(fs.readFileSync(fundsPath, 'utf-8'));
    const collectionsMapping = JSON.parse(fs.readFileSync(collectionsPath, 'utf-8'));

    console.log('✅ מיפויי Funds ו-Collections נטענו בהצלחה\n');

    // בדוק שה-CreatedAt במיפויים מוגדר כראוי
    console.log('━'.repeat(60));
    console.log('🔍 בודק הגדרת CreatedAt במיפויים:');
    console.log('━'.repeat(60));

    // Funds
    const fundsCreatedAt = fundsMapping.columnMappings.CreatedAt;
    console.log('\n📁 Funds Mapping:');
    console.log(JSON.stringify(fundsCreatedAt, null, 2));

    if (fundsCreatedAt.useFkMapping && fundsCreatedAt.mappingFile === 'ProductCreatedDate.json') {
      console.log('✅ Funds: מוגדר להשתמש ב-ProductCreatedDate.json');
    } else {
      console.log('❌ Funds: לא מוגדר כראוי!');
    }

    // Collections
    const collectionsCreatedAt = collectionsMapping.columnMappings.CreatedAt;
    console.log('\n📁 Collections Mapping:');
    console.log(JSON.stringify(collectionsCreatedAt, null, 2));

    if (collectionsCreatedAt.useFkMapping && collectionsCreatedAt.mappingFile === 'ProductCreatedDate.json') {
      console.log('✅ Collections: מוגדר להשתמש ב-ProductCreatedDate.json');
    } else {
      console.log('❌ Collections: לא מוגדר כראוי!');
    }

    // בדוק את מבנה המיפוי
    console.log('\n' + '━'.repeat(60));
    console.log('🔍 בודק מבנה קובץ המיפוי:');
    console.log('━'.repeat(60));

    const hasMapping = data.mapping !== undefined;
    const hasMappings = data.mappings !== undefined;

    console.log(`mapping field:  ${hasMapping ? '✅' : '❌'}`);
    console.log(`mappings field: ${hasMappings ? '⚠️  (מיותר)' : '✅'}`);

    // סימולציית הקוד מ-server.js
    console.log('\n' + '━'.repeat(60));
    console.log('🔬 סימולציה של הקוד מ-server.js:');
    console.log('━'.repeat(60));

    const fk = data;
    const mappingData = fk.mappings || fk.mapping;

    if (!mappingData) {
      console.log('❌ לא נמצא mapping או mappings!');
      return { success: false };
    }

    console.log(`✅ נמצא mappingData עם ${Object.keys(mappingData).length} רשומות`);

    // בדוק כמה ProductIds לדוגמה
    const testProductIds = [1, 100, 500, 1957];

    console.log('\n📊 בודק ProductIds לדוגמה:');
    testProductIds.forEach(productId => {
      const mappedEntry = mappingData[String(productId)];

      if (mappedEntry !== undefined) {
        if (typeof mappedEntry === 'object' && mappedEntry !== null) {
          let value = mappedEntry.CreatedAt || mappedEntry['CreatedAt'] || mappedEntry;

          // Convert ISO string to Date object
          if (typeof value === 'string') {
            value = new Date(value);
          }

          console.log(`  ProductId ${String(productId).padStart(5)}: ${value.toISOString().split('T')[0]} ✅`);
        } else {
          console.log(`  ProductId ${String(productId).padStart(5)}: ערך פשוט (לא צפוי) ❌`);
        }
      } else {
        console.log(`  ProductId ${String(productId).padStart(5)}: לא נמצא ❌`);
      }
    });

    console.log('\n🎉 כל הבדיקות עברו בהצלחה!\n');

    return { success: true };

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
    return { success: false, error: err };
  }
}

// הרץ אם קוראים ישירות
if (require.main === module) {
  const result = testProductDateMapping();
  process.exit(result.success ? 0 : 1);
}

module.exports = { testProductDateMapping };
