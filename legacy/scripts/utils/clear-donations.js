/**
 * Clear all donations from donation table
 * Use this before re-running donation migration with fixed AUTO_INCREMENT code
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function clearDonations() {
  console.log('🗑️  Clearing donation table...\n');

  const conn = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });

  try {
    // Count current donations
    const [count] = await conn.query('SELECT COUNT(*) as total FROM donation');
    const [currencyCount] = await conn.query('SELECT COUNT(*) as total FROM donationcurrencyvalue');
    console.log(`Current donations: ${count[0].total}`);
    console.log(`Current currency values: ${currencyCount[0].total}`);

    if (count[0].total === 0 && currencyCount[0].total === 0) {
      console.log('✅ Tables are already empty\n');
      await conn.end();
      return;
    }

    // Delete all currency values first (child table)
    console.log('\n🗑️  Deleting all donationcurrencyvalue rows...');
    await conn.query('DELETE FROM donationcurrencyvalue');
    console.log('✅ All currency values deleted');

    // Delete all donations (parent table)
    console.log('\n🗑️  Deleting all donations...');
    await conn.query('DELETE FROM donation');
    console.log('✅ All donations deleted');

    // Reset AUTO_INCREMENT to 1
    console.log('\n🔄 Resetting AUTO_INCREMENT to 1...');
    await conn.query('ALTER TABLE donation AUTO_INCREMENT = 1');
    console.log('✅ AUTO_INCREMENT reset');

    // Verify
    const [newCount] = await conn.query('SELECT COUNT(*) as total FROM donation');
    const [autoInc] = await conn.query(`
      SELECT AUTO_INCREMENT
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'kupathairnew'
      AND TABLE_NAME = 'donation'
    `);

    console.log('\n📊 Verification:');
    console.log(`   Donations remaining: ${newCount[0].total}`);
    console.log(`   AUTO_INCREMENT next value: ${autoInc[0].AUTO_INCREMENT}`);

    console.log('\n✅ Done! You can now run donation migration with fixed code.\n');

    await conn.end();

  } catch (err) {
    console.error('\n❌ Error:', err);
    await conn.end();
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  clearDonations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { clearDonations };
