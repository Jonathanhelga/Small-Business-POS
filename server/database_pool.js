const mysql = require('mysql2');
const config = require('./config');

const pool = mysql.createPool({
    host: config.DB_HOST,
    user: config.DB_USER,   
    password: config.DB_PASS,  
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,   // adjust based on your app load
    queueLimit: 0
  });

const db = pool.promise();

db.getConnection()
  .then(conn => {
    console.log("✅ Connected to MySQL database (using pool + promises)!");
    conn.release();
  })
  .catch(err => console.error("❌ Database connection failed:", err.message));


module.exports = db;
