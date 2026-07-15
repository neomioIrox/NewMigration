require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const config = {
  mssql: {
    connectionString: process.env.MSSQL_CONNECTION_STRING,
    database: process.env.MSSQL_DATABASE,
    requestTimeout: parseInt(process.env.MSSQL_REQUEST_TIMEOUT) || 300000
  },
  mysqlTarget: {
    host: process.env.MYSQL_TARGET_HOST,
    user: process.env.MYSQL_TARGET_USER,
    password: process.env.MYSQL_TARGET_PASSWORD,
    database: process.env.MYSQL_TARGET_DATABASE,
    charset: 'utf8mb4',
    connectTimeout: 30000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  mysqlTracker: {
    host: process.env.MYSQL_TRACKER_HOST,
    user: process.env.MYSQL_TRACKER_USER,
    password: process.env.MYSQL_TRACKER_PASSWORD,
    database: process.env.MYSQL_TRACKER_DATABASE,
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }
};

module.exports = config;
