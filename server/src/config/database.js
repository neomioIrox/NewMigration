const config = {
  mssql: {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=DESKTOP-7QELS7G;Database=kupatOld;Trusted_Connection=Yes;',
    database: 'kupatOld',
    requestTimeout: 300000
  },
  mysqlTarget: {
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairnew',
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  mysqlTracker: {
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'migration_tracker',
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }
};

module.exports = config;
