/**
 * Verify DisplayInSite Hebrew Logic Fix
 *
 * This script checks that all mapping files have the correct logic
 * for Hebrew DisplayInSite field (must check both Hide and ShowMainPage)
 */

const fs = require('fs');
const path = require('path');

const mappingFiles = [
  'mappings/ProjectMapping_Funds_Fixed.json',
  'mappings/ProjectMapping_Collections_Fixed.json',
  'mappings/ProjectMapping_Collections_Type2.json',
  'mappings/ProjectMapping.json'
];

console.log('=== בדיקת תיקון DisplayInSite בעברית ===\n');

let allCorrect = true;

mappingFiles.forEach(filePath => {
  const fullPath = path.join(__dirname, '../..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${filePath}: הקובץ לא נמצא`);
    allCorrect = false;
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const mapping = JSON.parse(content);

  // Check localizationMappings.DisplayInSite.hebrew
  const hebrewDisplayInSite = mapping.localizationMappings?.DisplayInSite?.hebrew;

  if (!hebrewDisplayInSite) {
    console.log(`⚠️  ${filePath}: חסר DisplayInSite.hebrew`);
    allCorrect = false;
    return;
  }

  const expression = hebrewDisplayInSite.expression;

  // The correct expression should check both Hide and ShowMainPage
  const correctExpression = '(!row.Hide && row.ShowMainPage) ? 1 : 0';
  const oldWrongExpression = 'row.Hide ? 0 : 1';

  if (expression === correctExpression) {
    console.log(`✅ ${filePath}: נכון!`);
    console.log(`   ביטוי: ${expression}\n`);
  } else if (expression === oldWrongExpression) {
    console.log(`❌ ${filePath}: שגוי - עדיין משתמש בביטוי הישן!`);
    console.log(`   ביטוי נוכחי: ${expression}`);
    console.log(`   ביטוי צפוי:   ${correctExpression}\n`);
    allCorrect = false;
  } else {
    console.log(`⚠️  ${filePath}: ביטוי לא מוכר`);
    console.log(`   ביטוי נוכחי: ${expression}`);
    console.log(`   ביטוי צפוי:   ${correctExpression}\n`);
    allCorrect = false;
  }
});

console.log('\n' + '='.repeat(60));
if (allCorrect) {
  console.log('✅ כל קבצי המיפוי תוקנו בהצלחה!');
  console.log('\n📝 הוראות שימוש ב-UI:');
  console.log('   1. פתח את http://localhost:3030');
  console.log('   2. לחץ על "טען מיפוי"');
  console.log('   3. בחר את הקובץ המתאים (לדוגמה: ProjectMapping_Funds_Fixed)');
  console.log('   4. הרץ מיגרציה מחדש');
  console.log('\n⚠️  חשוב: חייב לטעון את המיפוי מחדש מהקובץ כדי שהתיקון ייכנס לתוקף!');
} else {
  console.log('❌ נמצאו בעיות בחלק מקבצי המיפוי');
  console.log('   אנא תקן את הקבצים לפי ההודעות למעלה');
}
console.log('='.repeat(60) + '\n');

process.exit(allCorrect ? 0 : 1);
