const mysql = require('mysql2/promise');

async function listDatabases() {
  console.log('Connecting to MySQL...');

  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234'
    // No database specified - we want to see all databases
  });

  try {
    console.log('Connected!\n');

    const [databases] = await connection.execute('SHOW DATABASES');

    console.log('=== Available Databases ===');
    databases.forEach((db, index) => {
      const dbName = db.Database || db.database;
      console.log(`${index + 1}. ${dbName}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

listDatabases();
