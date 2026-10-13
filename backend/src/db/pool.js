const mysql = require('mysql2/promise');
const config = require('../config');

// Mọi thời gian được lưu theo UTC; frontend tự đổi sang giờ địa phương khi hiển thị.
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: false,
  charset: 'utf8mb4',
});

pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

/** Chạy một hàm trong transaction. */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
