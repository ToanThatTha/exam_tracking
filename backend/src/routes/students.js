// Quản lý tài khoản sinh viên (GV01: "việc tạo tài khoản và phân quyền được xử lý theo quy định của hệ thống")
// Giảng viên tạo tài khoản sinh viên gồm Họ tên, Mã sinh viên, Lớp (SV01).
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../db/pool');
const { HttpError, toId } = require('../utils/http');
const { readRows, buildWorkbook } = require('../utils/excel');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function mapStudent(u) {
  return { id: u.id, username: u.username, fullName: u.full_name, studentCode: u.student_code, className: u.class_name, createdAt: u.created_at };
}

function validateStudent(body, { requirePassword }) {
  const fullName = String(body.fullName || '').trim();
  const studentCode = String(body.studentCode || '').trim();
  const className = String(body.className || '').trim();
  const username = String(body.username || studentCode).trim();
  const password = body.password ? String(body.password) : '';
  if (!fullName) return { error: 'Thiếu họ và tên' };
  if (!studentCode) return { error: 'Thiếu mã sinh viên' };
  if (!className) return { error: 'Thiếu lớp' };
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) return { error: 'Tên đăng nhập 3–50 ký tự, chỉ gồm chữ, số, . _ -' };
  if (requirePassword && password.length < 6) return { error: 'Mật khẩu phải có ít nhất 6 ký tự' };
  if (password && password.length < 6) return { error: 'Mật khẩu phải có ít nhất 6 ký tự' };
  return { value: { fullName, studentCode, className, username, password } };
}

router.get('/', async (req, res) => {
  const where = ["role = 'student'"];
  const params = [];
  if (req.query.className) { where.push('class_name = ?'); params.push(req.query.className); }
  if (req.query.q) {
    where.push('(full_name LIKE ? OR student_code LIKE ? OR username LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  const [rows] = await pool.query(`SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY class_name, student_code`, params);
  res.json(rows.map(mapStudent));
});

router.get('/classes', async (req, res) => {
  const [rows] = await pool.query(
    "SELECT class_name, COUNT(*) AS total FROM users WHERE role = 'student' GROUP BY class_name ORDER BY class_name"
  );
  res.json(rows.map((r) => ({ name: r.class_name, total: Number(r.total) })));
});

router.get('/template', async (req, res) => {
  const buf = await buildWorkbook(
    'SinhVien',
    ['Họ và tên', 'Mã sinh viên', 'Lớp', 'Tên đăng nhập (bỏ trống = mã SV)', 'Mật khẩu (bỏ trống = 123456)'],
    [['Nguyễn Văn A', '22IT201', '22IT3', '', ''], ['Trần Thị B', '22IT202', '22IT3', 'tranthib', 'matkhau1']],
    [26, 16, 12, 30, 28]
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-sinh-vien.xlsx"');
  res.send(Buffer.from(buf));
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Chưa chọn file Excel');
  let rows;
  try { rows = await readRows(req.file.buffer); } catch { throw new HttpError(400, 'File không đúng định dạng .xlsx'); }
  const errors = [];
  let imported = 0;
  const defaultHash = await bcrypt.hash('123456', 10);
  for (const { rowNumber, values } of rows) {
    const [fullName, studentCode, className, username, password] = values;
    if (!fullName && !studentCode) continue;
    const v = validateStudent({ fullName, studentCode, className, username, password }, { requirePassword: false });
    if (v.error) { errors.push({ row: rowNumber, message: v.error }); continue; }
    try {
      const hash = v.value.password ? await bcrypt.hash(v.value.password, 10) : defaultHash;
      await pool.query(
        "INSERT INTO users (username, password_hash, role, full_name, student_code, class_name) VALUES (?, ?, 'student', ?, ?, ?)",
        [v.value.username, hash, v.value.fullName, v.value.studentCode, v.value.className]
      );
      imported++;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') errors.push({ row: rowNumber, message: 'Trùng tên đăng nhập hoặc mã sinh viên' });
      else throw err;
    }
  }
  res.json({ imported, errors });
});

router.post('/', async (req, res) => {
  const v = validateStudent(req.body || {}, { requirePassword: true });
  if (v.error) throw new HttpError(400, v.error);
  const [r] = await pool.query(
    "INSERT INTO users (username, password_hash, role, full_name, student_code, class_name) VALUES (?, ?, 'student', ?, ?, ?)",
    [v.value.username, await bcrypt.hash(v.value.password, 10), v.value.fullName, v.value.studentCode, v.value.className]
  );
  const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json(mapStudent(u));
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const v = validateStudent(req.body || {}, { requirePassword: false });
  if (v.error) throw new HttpError(400, v.error);
  await withTransaction(async (conn) => {
    const [[u]] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 'student'", [id]);
    if (!u) throw new HttpError(404, 'Không tìm thấy sinh viên');
    await conn.query(
      'UPDATE users SET username = ?, full_name = ?, student_code = ?, class_name = ? WHERE id = ?',
      [v.value.username, v.value.fullName, v.value.studentCode, v.value.className, id]
    );
    if (v.value.password) {
      await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(v.value.password, 10), id]);
    }
  });
  const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  res.json(mapStudent(u));
});

router.delete('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const [[n]] = await pool.query('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?', [id]);
  if (n.n > 0) throw new HttpError(409, 'Sinh viên đã có bài thi, không thể xóa tài khoản');
  const [r] = await pool.query("DELETE FROM users WHERE id = ? AND role = 'student'", [id]);
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy sinh viên');
  res.json({ ok: true });
});

module.exports = router;
