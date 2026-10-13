const fs = require('fs');
const app = require('./app');
const config = require('./config');
const { pool } = require('./db/pool');
const { finalizeExpired } = require('./utils/attempts');

fs.mkdirSync(config.evidenceDir, { recursive: true });

const server = app.listen(config.port, async () => {
  console.log(`✓ Backend chạy tại http://localhost:${config.port}`);
  try {
    await pool.query('SELECT 1');
    console.log(`✓ Đã kết nối MySQL (${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database})`);
  } catch (err) {
    console.error('✗ Chưa kết nối được MySQL:', err.message);
    console.error('  → Kiểm tra MySQL đã bật chưa và cấu hình trong backend/.env; lần đầu hãy chạy: npm run db:init');
  }
});

// Tự chốt các bài đã hết giờ nhưng sinh viên chưa nộp (tắt máy, mất mạng...)
const timer = setInterval(() => {
  finalizeExpired().catch((err) => {
    if (err.code !== 'ECONNREFUSED') console.error('Lỗi tự nộp bài hết giờ:', err.message);
  });
}, 30 * 1000);

function shutdown() {
  clearInterval(timer);
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
