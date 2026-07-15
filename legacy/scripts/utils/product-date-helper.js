const fs = require('fs');
const path = require('path');

/**
 * טוען את מיפוי התאריכים של Products
 */
function loadProductDatesMapping() {
  const mappingPath = path.join(__dirname, '../../data/fk-mappings/ProductCreatedDate.json');

  if (!fs.existsSync(mappingPath)) {
    throw new Error('ERROR: ProductCreatedDate.json לא נמצא! הרץ תחילה: node scripts/utils/create-product-dates-mapping.js');
  }

  const data = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  return data;
}

/**
 * מחזיר תאריך יצירה עבור ProductId
 *
 * @param {number} productId - ProductId מהטבלה הישנה
 * @param {Object} mapping - המיפוי (אופציונלי - יטען אוטומטית)
 * @returns {Date} תאריך היצירה
 */
function getCreatedDateForProduct(productId, mapping = null) {
  if (!mapping) {
    const data = loadProductDatesMapping();
    mapping = data.mapping;
  }

  const dateInfo = mapping[productId];

  if (!dateInfo) {
    // אם ProductId לא נמצא במיפוי, השתמש בתאריך ברירת מחדל
    // (זה לא אמור לקרות, אבל למקרה בטחון)
    console.warn(`⚠️  ProductId ${productId} לא נמצא במיפוי תאריכים - משתמש בתאריך ברירת מחדל`);
    return new Date('2020-01-01');
  }

  return new Date(dateInfo.CreatedAt);
}

/**
 * Expression function להשתמש במיגרציה
 * מקבל row ומחזיר תאריך
 */
function createDateExpression() {
  // טוען את המיפוי פעם אחת
  const data = loadProductDatesMapping();
  const mapping = data.mapping;

  console.log(`📅 נטען מיפוי תאריכים: ${Object.keys(mapping).length.toLocaleString()} products`);

  // מחזיר פונקציה שמשתמשת במיפוי
  return function(value, row) {
    // אם יש DateCreated בטבלה הישנה - השתמש בו
    if (value && value instanceof Date) {
      return value;
    }

    // אחרת - קח מהמיפוי לפי ProductId
    const productId = row.productsid || row.sourceId;

    if (!productId) {
      console.warn('⚠️  אין ProductId - משתמש בתאריך ברירת מחדל');
      return new Date('2020-01-01');
    }

    return getCreatedDateForProduct(productId, mapping);
  };
}

module.exports = {
  loadProductDatesMapping,
  getCreatedDateForProduct,
  createDateExpression
};
