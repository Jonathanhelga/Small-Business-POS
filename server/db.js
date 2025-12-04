const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function initDB() {
  const db = await open({
    filename: path.join(__dirname, 'electricshop.sqlite'),
    driver: sqlite3.Database
  });

  // Always enforce foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');

  console.log("✅ Connected to SQLite database (async/await mode)");
  return db;
}
module.exports = initDB();