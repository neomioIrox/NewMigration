const fs = require('fs');
const path = require('path');

/**
 * בודק שמיפוי StatusChangedAt מוגדר נכון
 */
function verifyStatusChangedMapping() {
  console.log('🔍 בודק מיפוי StatusChangedAt...\n');

  try {
    const fundsPath = path.join(__dirname, '../../mappings/ProjectMapping_Funds_Fixed.json');
    const collectionsPath = path.join(__dirname, '../../mappings/ProjectMapping_Collections_Fixed.json');

    const funds = JSON.parse(fs.readFileSync(fundsPath, 'utf-8'));
    const collections = JSON.parse(fs.readFileSync(collectionsPath, 'utf-8'));

    console.log('━'.repeat(60));
    console.log('🔍 Funds Mapping:');
    console.log('━'.repeat(60));

    // Check StatusChangedAt in columnMappings
    const fundsStatusChanged = funds.columnMappings.StatusChangedAt;
    console.log('\nStatusChangedAt in columnMappings:');
    console.log(JSON.stringify(fundsStatusChanged, null, 2));

    // Check StatusChangedAt in fkMappings
    const fundsFkMapping = funds.fkMappings.StatusChangedAt;
    console.log('\nStatusChangedAt in fkMappings:', fundsFkMapping);

    // Verify
    let fundsOk = true;
    if (!fundsStatusChanged || !fundsStatusChanged.useFkMapping) {
      console.log('❌ StatusChangedAt לא מוגדר עם useFkMapping!');
      fundsOk = false;
    }
    if (fundsStatusChanged.mappingFile !== 'ProductCreatedDate.json') {
      console.log('❌ mappingFile לא מוגדר נכון!');
      fundsOk = false;
    }
    if (fundsFkMapping !== 'ProductCreatedDate.json') {
      console.log('❌ fkMappings לא כולל את StatusChangedAt!');
      fundsOk = false;
    }

    if (fundsOk) {
      console.log('✅ Funds: StatusChangedAt מוגדר נכון');
    }

    console.log('\n' + '━'.repeat(60));
    console.log('🔍 Collections Mapping:');
    console.log('━'.repeat(60));

    // Check StatusChangedAt in columnMappings
    const collectionsStatusChanged = collections.columnMappings.StatusChangedAt;
    console.log('\nStatusChangedAt in columnMappings:');
    console.log(JSON.stringify(collectionsStatusChanged, null, 2));

    // Check StatusChangedAt in fkMappings
    const collectionsFkMapping = collections.fkMappings.StatusChangedAt;
    console.log('\nStatusChangedAt in fkMappings:', collectionsFkMapping);

    // Verify
    let collectionsOk = true;
    if (!collectionsStatusChanged || !collectionsStatusChanged.useFkMapping) {
      console.log('❌ StatusChangedAt לא מוגדר עם useFkMapping!');
      collectionsOk = false;
    }
    if (collectionsStatusChanged.mappingFile !== 'ProductCreatedDate.json') {
      console.log('❌ mappingFile לא מוגדר נכון!');
      collectionsOk = false;
    }
    if (collectionsFkMapping !== 'ProductCreatedDate.json') {
      console.log('❌ fkMappings לא כולל את StatusChangedAt!');
      collectionsOk = false;
    }

    if (collectionsOk) {
      console.log('✅ Collections: StatusChangedAt מוגדר נכון');
    }

    console.log('\n' + '━'.repeat(60));
    console.log('📊 סיכום:');
    console.log('━'.repeat(60));

    if (fundsOk && collectionsOk) {
      console.log('✅ שני המיפויים תקינים!');
      console.log('✅ StatusChangedAt ישתמש באותו תאריך כמו CreatedAt');
      console.log('✅ שניהם יטענו מ-ProductCreatedDate.json\n');
      return { success: true };
    } else {
      console.log('❌ יש בעיות במיפויים\n');
      return { success: false };
    }

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
    return { success: false, error: err };
  }
}

// הרץ אם קוראים ישירות
if (require.main === module) {
  const result = verifyStatusChangedMapping();
  process.exit(result.success ? 0 : 1);
}

module.exports = { verifyStatusChangedMapping };
