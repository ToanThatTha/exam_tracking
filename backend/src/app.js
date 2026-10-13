const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { pool } = require('./db/pool');
const { authenticate, requireRole } = require('./middleware/auth');
const { errorHandler, HttpError } = require('./utils/http');
const { EVENT_TYPES } = require('./utils/proctorRules');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigin.split(',').map((s) => s.trim()), credentials: false }));
// Ảnh bằng chứng gửi kèm sự kiện dạng base64 nên cần giới hạn lớn hơn mặc định
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'error', message: err.message });
  }
});

app.get('/api/meta/event-types', (req, res) => {
  res.json(Object.entries(EVENT_TYPES).map(([type, d]) => ({ type, label: d.label, source: d.source, weight: d.weight })));
});

app.use('/api/auth', require('./routes/auth'));

// Giảng viên
const teacher = express.Router();
teacher.use(authenticate, requireRole('teacher'));
teacher.use('/questions', require('./routes/questions'));
teacher.use('/exams', require('./routes/exams'));
teacher.use('/rooms', require('./routes/rooms'));
teacher.use('/students', require('./routes/students'));
teacher.use('/', require('./routes/review'));
teacher.get('/dashboard', async (req, res) => {
  const id = req.user.id;
  const [[c]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM questions WHERE teacher_id = ?) AS questions,
            (SELECT COUNT(*) FROM exams WHERE teacher_id = ?) AS exams,
            (SELECT COUNT(*) FROM rooms WHERE teacher_id = ?) AS rooms,
            (SELECT COUNT(*) FROM rooms WHERE teacher_id = ? AND open_at <= UTC_TIMESTAMP() AND close_at >= UTC_TIMESTAMP()) AS open_rooms,
            (SELECT COUNT(*) FROM attempts a JOIN rooms r ON r.id = a.room_id
              WHERE r.teacher_id = ? AND a.status = 'submitted' AND a.review_status = 'pending' AND a.risk_score >= 20) AS to_review`,
    [id, id, id, id, id]
  );
  const [recent] = await pool.query(
    `SELECT a.id, a.risk_score, a.score, a.status, a.review_status, a.submitted_at, u.full_name, u.student_code, r.name AS room_name, r.id AS room_id
       FROM attempts a JOIN rooms r ON r.id = a.room_id JOIN users u ON u.id = a.student_id
      WHERE r.teacher_id = ? AND a.risk_score >= 20 AND a.review_status = 'pending'
      ORDER BY a.risk_score DESC, a.submitted_at DESC LIMIT 8`,
    [id]
  );
  res.json({
    counts: {
      questions: Number(c.questions), exams: Number(c.exams), rooms: Number(c.rooms),
      openRooms: Number(c.open_rooms), toReview: Number(c.to_review),
    },
    toReview: recent.map((r) => ({
      attemptId: r.id, riskScore: r.risk_score, score: r.score != null ? Number(r.score) : null, status: r.status,
      submittedAt: r.submitted_at, fullName: r.full_name, studentCode: r.student_code, roomName: r.room_name, roomId: r.room_id,
    })),
  });
});
app.use('/api/teacher', teacher);

// Sinh viên
app.use('/api/student', authenticate, requireRole('student'), require('./routes/studentExam'));

app.use('/api', (req, res, next) => next(new HttpError(404, 'API không tồn tại')));

// Khi đã build frontend (npm run build trong thư mục frontend), backend phục vụ luôn giao diện
const dist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
