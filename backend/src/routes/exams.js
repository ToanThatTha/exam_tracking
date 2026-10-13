// GV03. Tạo và quản lý đề thi
const express = require('express');
const { pool, withTransaction } = require('../db/pool');
const { HttpError, toId } = require('../utils/http');
const { loadQuestions } = require('./questions');

const router = express.Router();

function validateExam(body) {
  const title = String(body.title || '').trim();
  const subject = String(body.subject || '').trim();
  const duration = Number(body.durationMinutes);
  const ids = [...new Set((body.questionIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!title) return { error: 'Thiếu tên đề thi' };
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) return { error: 'Thời gian làm bài phải từ 1 đến 600 phút' };
  if (!ids.length) return { error: 'Đề thi cần ít nhất 1 câu hỏi' };
  return {
    value: {
      title, subject, duration, ids,
      shuffleQuestions: body.shuffleQuestions !== false,
      shuffleOptions: body.shuffleOptions !== false,
    },
  };
}

async function assertOwnQuestions(conn, teacherId, ids) {
  const [[r]] = await conn.query('SELECT COUNT(*) AS n FROM questions WHERE teacher_id = ? AND id IN (?)', [teacherId, ids]);
  if (Number(r.n) !== ids.length) throw new HttpError(400, 'Có câu hỏi không tồn tại hoặc không thuộc ngân hàng của bạn');
}

async function setExamQuestions(conn, examId, ids) {
  await conn.query('DELETE FROM exam_questions WHERE exam_id = ?', [examId]);
  for (let i = 0; i < ids.length; i++) {
    await conn.query('INSERT INTO exam_questions (exam_id, question_id, position) VALUES (?, ?, ?)', [examId, ids[i], i]);
  }
}

function mapExam(e) {
  return {
    id: e.id,
    title: e.title,
    subject: e.subject,
    durationMinutes: e.duration_minutes,
    shuffleQuestions: e.shuffle_questions === 1,
    shuffleOptions: e.shuffle_options === 1,
    createdAt: e.created_at,
    questionCount: e.question_count != null ? Number(e.question_count) : undefined,
    roomCount: e.room_count != null ? Number(e.room_count) : undefined,
  };
}

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.*,
            (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count,
            (SELECT COUNT(*) FROM rooms r WHERE r.exam_id = e.id) AS room_count
       FROM exams e WHERE e.teacher_id = ? ORDER BY e.id DESC`,
    [req.user.id]
  );
  res.json(rows.map(mapExam));
});

router.get('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const [[e]] = await pool.query(
    `SELECT e.*, (SELECT COUNT(*) FROM rooms r WHERE r.exam_id = e.id) AS room_count
       FROM exams e WHERE e.id = ? AND e.teacher_id = ?`,
    [id, req.user.id]
  );
  if (!e) throw new HttpError(404, 'Không tìm thấy đề thi');
  const [qrows] = await pool.query('SELECT question_id FROM exam_questions WHERE exam_id = ? ORDER BY position', [id]);
  const ids = qrows.map((r) => r.question_id);
  const questions = ids.length ? await loadQuestions('q.id IN (?)', [ids]) : [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  res.json({ ...mapExam(e), questionIds: ids, questions: ids.map((i) => byId.get(i)).filter(Boolean) });
});

router.post('/', async (req, res) => {
  const v = validateExam(req.body || {});
  if (v.error) throw new HttpError(400, v.error);
  const id = await withTransaction(async (conn) => {
    await assertOwnQuestions(conn, req.user.id, v.value.ids);
    const [r] = await conn.query(
      'INSERT INTO exams (teacher_id, title, subject, duration_minutes, shuffle_questions, shuffle_options) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, v.value.title, v.value.subject, v.value.duration, v.value.shuffleQuestions ? 1 : 0, v.value.shuffleOptions ? 1 : 0]
    );
    await setExamQuestions(conn, r.insertId, v.value.ids);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const v = validateExam(req.body || {});
  if (v.error) throw new HttpError(400, v.error);
  await withTransaction(async (conn) => {
    const [[e]] = await conn.query('SELECT id FROM exams WHERE id = ? AND teacher_id = ? FOR UPDATE', [id, req.user.id]);
    if (!e) throw new HttpError(404, 'Không tìm thấy đề thi');
    const [[started]] = await conn.query(
      'SELECT COUNT(*) AS n FROM attempts a JOIN rooms r ON r.id = a.room_id WHERE r.exam_id = ?',
      [id]
    );
    if (started.n > 0) throw new HttpError(409, 'Đề thi đã có sinh viên làm bài, không thể sửa. Hãy tạo đề mới.');
    await assertOwnQuestions(conn, req.user.id, v.value.ids);
    await conn.query(
      'UPDATE exams SET title = ?, subject = ?, duration_minutes = ?, shuffle_questions = ?, shuffle_options = ? WHERE id = ?',
      [v.value.title, v.value.subject, v.value.duration, v.value.shuffleQuestions ? 1 : 0, v.value.shuffleOptions ? 1 : 0, id]
    );
    await setExamQuestions(conn, id, v.value.ids);
  });
  res.json({ id });
});

router.delete('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const [[used]] = await pool.query('SELECT COUNT(*) AS n FROM rooms WHERE exam_id = ?', [id]);
  if (used.n > 0) throw new HttpError(409, 'Đề thi đang được gắn với phòng thi, hãy xóa phòng thi trước');
  const [r] = await pool.query('DELETE FROM exams WHERE id = ? AND teacher_id = ?', [id, req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy đề thi');
  res.json({ ok: true });
});

module.exports = router;
