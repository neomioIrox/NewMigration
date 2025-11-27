const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

/**
 * Create a new Role for Affiliates (שותף)
 * Duplicates an existing role and changes Description to "שותף"
 */

async function createAffiliateRole() {
  let connection;

  try {
    console.log('🔧 Creating Affiliate Role...\n');

    connection = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Check if "שותף" role already exists
    const [existingRole] = await connection.query(
      'SELECT * FROM role WHERE Description = ?',
      ['שותף']
    );

    if (existingRole.length > 0) {
      console.log('✅ Role "שותף" already exists:');
      console.table(existingRole);
      return existingRole[0].Id;
    }

    // Get an existing role to duplicate
    const [existingRoles] = await connection.query('SELECT * FROM role LIMIT 5');

    console.log('📋 Existing roles:');
    console.table(existingRoles);

    if (existingRoles.length === 0) {
      throw new Error('No existing roles found to duplicate!');
    }

    // Use the first role as template
    const template = existingRoles[0];

    console.log(`\n📝 Using role Id=${template.Id} as template`);

    // Insert new role
    const insertQuery = `
      INSERT INTO role (
        Description,
        IsSystemValue,
        RecordStatus,
        StatusChangedAt,
        StatusChangedBy,
        CreatedAt,
        CreatedBy,
        UpdatedAt,
        UpdatedBy
      ) VALUES (?, ?, ?, NOW(), -1, NOW(), -1, NOW(), -1)
    `;

    const [result] = await connection.query(insertQuery, [
      'שותף',                    // Description
      template.IsSystemValue,    // Copy IsSystemValue
      2                          // RecordStatus = 2 (Accept)
    ]);

    const newRoleId = result.insertId;

    console.log(`\n✅ Created new role "שותף" with Id=${newRoleId}`);

    // Verify
    const [newRole] = await connection.query(
      'SELECT * FROM role WHERE Id = ?',
      [newRoleId]
    );

    console.log('\n📊 New role details:');
    console.table(newRole);

    return newRoleId;

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  createAffiliateRole()
    .then((roleId) => {
      console.log(`\n🎉 Done! Affiliate RoleId = ${roleId}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

module.exports = { createAffiliateRole };
