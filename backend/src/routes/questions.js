// GV02. Quản lý ngân hàng câu hỏi
const express = require('express');
const multer = require('multer');
const { pool, withTransaction } = require('../db/pool');
const { HttpError, toId } = require('../utils/http');
const { readRows, buildWorkbook } = require('../utils/excel');
const { shuffle } = require('../utils/attempts');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function validateQuestion(body) {
  const subject = String(body.subject || '').trim();
  const chapter = String(body.chapter || '').trim();
  const content = String(body.content || '').trim();
  const options = Array.isArray(body.options) ? body.options : [];
  const cleaned = options
    .map((o) => ({ content: String(o.content || '').trim(), isCorrect: !!o.isCorrect }))
    .filter((o) => o.content);
  if (!subject) return { error: 'Thiếu môn học' };
  if (!content) return { error: 'Thiếu nội dung câu hỏi' };
  if (cleaned.length < 2 || cleaned.length > 6) return { error: 'Câu hỏi cần từ 2 đến 6 phương án' };
  if (cleaned.filter((o) => o.isCorrect).length !== 1) return { error: 'Phải chọn đúng 1 đáp án đúng' };
  return { value: { subject, chapter, content, options: cleaned } };
}

async function insertQuestion(conn, teacherId, q) {
  const [r] = await conn.query(
    'INSERT INTO questions (teacher_id, subject, chapter, content) VALUES (?, ?, ?, ?)',
    [teacherId, q.subject, q.chapter, q.content]
  );
  for (let i = 0; i < q.options.length; i++) {
    await conn.query(
      'INSERT INTO question_options (question_id, content, is_correct, position) VALUES (?, ?, ?, ?)',
      [r.insertId, q.options[i].content, q.options[i].isCorrect ? 1 : 0, i]
    );
  }
  return r.insertId;
}

/** Lấy câu hỏi kèm phương án */
async function loadQuestions(whereSql, params) {
  const [qs] = await pool.query(
    `SELECT q.*, (SELECT COUNT(*) FROM exam_questions eq WHERE eq.question_id = q.id) AS used_in_exams
       FROM questions q WHERE ${whereSql} ORDER BY q.subject, q.chapter, q.id DESC`,
    params
  );
  if (!qs.length) return [];
  const [opts] = await pool.query(
    'SELECT * FROM question_options WHERE question_id IN (?) ORDER BY position',
    [qs.map((q) => q.id)]
  );
  const byQ = new Map();
  for (const o of opts) {
    if (!byQ.has(o.question_id)) byQ.set(o.question_id, []);
    byQ.get(o.question_id).push({ id: o.id, content: o.content, isCorrect: o.is_correct === 1 });
  }
  return qs.map((q) => ({
    id: q.id,
    subject: q.subject,
    chapter: q.chapter,
    content: q.content,
    usedInExams: Number(q.used_in_exams),
    options: byQ.get(q.id) || [],
  }));
}

// Danh sách + tìm kiếm + lọc theo môn / chương
router.get('/', async (req, res) => {
  const where = ['q.teacher_id = ?'];
  const params = [req.user.id];
  if (req.query.subject) { where.push('q.subject = ?'); params.push(req.query.subject); }
  if (req.query.chapter) { where.push('q.chapter = ?'); params.push(req.query.chapter); }
  if (req.query.q) { where.push('q.content LIKE ?'); params.push(`%${req.query.q}%`); }
  res.json(await loadQuestions(where.join(' AND '), params));
});

// Danh sách môn học và chương (để lọc)
router.get('/meta', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT subject, chapter, COUNT(*) AS total FROM questions WHERE teacher_id = ? GROUP BY subject, chapter ORDER BY subject, chapter',
    [req.user.id]
  );
  const subjects = {};
  for (const r of rows) {
    subjects[r.subject] = subjects[r.subject] || { name: r.subject, total: 0, chapters: [] };
    subjects[r.subject].total += Number(r.total);
    subjects[r.subject].chapters.push({ name: r.chapter, total: Number(r.total) });
  }
  res.json(Object.values(subjects));
});

// Lấy ngẫu nhiên N câu hỏi (dùng khi tạo đề)
router.get('/random', async (req, res) => {
  const count = Math.min(200, Math.max(1, Number(req.query.count) || 10));
  const where = ['teacher_id = ?'];
  const params = [req.user.id];
  if (req.query.subject) { where.push('subject = ?'); params.push(req.query.subject); }
  if (req.query.chapter) { where.push('chapter = ?'); params.push(req.query.chapter); }
  const exclude = String(req.query.exclude || '').split(',').map(Number).filter((n) => n > 0);
  if (exclude.length) { where.push('id NOT IN (?)'); params.push(exclude); }
  const [rows] = await pool.query(`SELECT id FROM questions WHERE ${where.join(' AND ')}`, params);
  const picked = shuffle(rows.map((r) => r.id)).slice(0, count);
  res.json({ ids: picked, available: rows.length });
});

// File Excel mẫu để nhập câu hỏi
router.get('/template', async (req, res) => {
  const buf = await buildWorkbook(
    'CauHoi',
    ['Môn học', 'Chương', 'Nội dung câu hỏi', 'Đáp án đúng (A-F)', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', 'Phương án E', 'Phương án F'],
    [
      ['Cơ sở dữ liệu', 'Chương 2', 'Câu lệnh nào dùng để xóa dữ liệu trong bảng?', 'C', 'INSERT', 'UPDATE', 'DELETE', 'SELECT'],
      ['Mạng máy tính', 'Chương 1', 'HTTPS mặc định dùng cổng nào?', 'B', '80', '443', '8080'],
    ],
    [18, 14, 50, 16, 22, 22, 22, 22, 22, 22]
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-cau-hoi.xlsx"');
  res.send(Buffer.from(buf));
});

// Nhập hàng loạt từ Excel
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Chưa chọn file Excel');
  let rows;
  try {
    rows = await readRows(req.file.buffer);
  } catch {
    throw new HttpError(400, 'File không đúng định dạng .xlsx');
  }
  const valid = [];
  const errors = [];
  for (const { rowNumber, values } of rows) {
    const [subject, chapter, content, answer, ...opts] = values;
    if (!subject && !content) continue; // dòng trống
    const optionTexts = opts.slice(0, 6);
    const correctIdx = LETTERS.indexOf(String(answer || '').trim().toUpperCase());
    const options = optionTexts.map((t, i) => ({ content: t, isCorrect: i === correctIdx }));
    if (correctIdx === -1 || !optionTexts[correctIdx]) {
      errors.push({ row: rowNumber, message: 'Đáp án đúng phải là A–F và trỏ tới phương án có nội dung' });
      continue;
    }
    const v = validateQuestion({ subject, chapter, content, options });
    if (v.error) errors.push({ row: rowNumber, message: v.error });
    else valid.push(v.value);
  }
  await withTransaction(async (conn) => {
    for (const q of valid) await insertQuestion(conn, req.user.id, q);
  });
  res.json({ imported: valid.length, errors });
});

router.post('/', async (req, res) => {
  const v = validateQuestion(req.body || {});
  if (v.error) throw new HttpError(400, v.error);
  const id = await withTransaction((conn) => insertQuestion(conn, req.user.id, v.value));
  const [q] = await loadQuestions('q.id = ?', [id]);
  res.status(201).json(q);
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const v = validateQuestion(req.body || {});
  if (v.error) throw new HttpError(400, v.error);
  await withTransaction(async (conn) => {
    const [[q]] = await conn.query('SELECT id FROM questions WHERE id = ? AND teacher_id = ? FOR UPDATE', [id, req.user.id]);
    if (!q) throw new HttpError(404, 'Không tìm thấy câu hỏi');
    // Nếu câu hỏi đã có sinh viên làm, việc thay phương án sẽ làm sai kết quả cũ.
    const [[used]] = await conn.query(
      `SELECT COUNT(*) AS n FROM answers a JOIN question_options o ON o.id = a.option_id WHERE o.question_id = ?`,
      [id]
    );
    if (used.n > 0) throw new HttpError(409, 'Câu hỏi đã có sinh viên làm bài, không thể sửa. Hãy tạo câu hỏi mới.');
    await conn.query('UPDATE questions SET subject = ?, chapter = ?, content = ? WHERE id = ?', [v.value.subject, v.value.chapter, v.value.content, id]);
    await conn.query('DELETE FROM question_options WHERE question_id = ?', [id]);
    for (let i = 0; i < v.value.options.length; i++) {
      await conn.query(
        'INSERT INTO question_options (question_id, content, is_correct, position) VALUES (?, ?, ?, ?)',
        [id, v.value.options[i].content, v.value.options[i].isCorrect ? 1 : 0, i]
      );
    }
  });
  const [q] = await loadQuestions('q.id = ?', [id]);
  res.json(q);
});

router.delete('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const [[used]] = await pool.query('SELECT COUNT(*) AS n FROM exam_questions WHERE question_id = ?', [id]);
  if (used.n > 0) throw new HttpError(409, 'Câu hỏi đang nằm trong đề thi, hãy bỏ khỏi đề trước khi xóa');
  const [r] = await pool.query('DELETE FROM questions WHERE id = ? AND teacher_id = ?', [id, req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy câu hỏi');
  res.json({ ok: true });
});

module.exports = router;
module.exports.loadQuestions = loadQuestions;
