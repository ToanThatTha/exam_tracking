const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const config = require('../config');
const { HttpError } = require('../utils/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, fullName: user.full_name },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    fullName: u.full_name,
    studentCode: u.student_code,
    className: u.class_name,
  };
}

// GV01, SV01: Đăng nhập
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new HttpError(400, 'Vui lòng nhập tên đăng nhập và mật khẩu');
  const [[user]] = await pool.query('SELECT * FROM users WHERE username = ?', [String(username).trim()]);
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Đăng ký tài khoản. Sinh viên: họ tên, mã SV, lớp (SV01). Giảng viên: cần mã giảng viên do nhà trường cấp.
router.post('/register', async (req, res) => {
  const b = req.body || {};
  const role = b.role === 'teacher' ? 'teacher' : 'student';
  const fullName = String(b.fullName || '').trim();
  const studentCode = String(b.studentCode || '').trim().toUpperCase();
  const className = String(b.className || '').trim().toUpperCase();
  const username = String(b.username || (role === 'student' ? studentCode : '')).trim();
  const password = String(b.password || '');

  if (fullName.length < 2) throw new HttpError(400, 'Vui lòng nhập họ và tên');
  if (role === 'student') {
    if (!/^[A-Z0-9]{3,20}$/.test(studentCode)) throw new HttpError(400, 'Mã sinh viên gồm 3–20 chữ hoặc số');
    if (!/^[A-Z0-9._-]{2,30}$/.test(className)) throw new HttpError(400, 'Vui lòng nhập lớp (ví dụ 22IT1)');
  } else {
    if (!config.teacherInviteCode) throw new HttpError(403, 'Hệ thống không cho tự đăng ký tài khoản giảng viên');
    if (String(b.teacherCode || '').trim() !== config.teacherInviteCode) throw new HttpError(403, 'Mã giảng viên không đúng');
  }
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) throw new HttpError(400, 'Tên đăng nhập 3–50 ký tự, chỉ gồm chữ, số, dấu . _ -');
  if (password.length < 6) throw new HttpError(400, 'Mật khẩu phải có ít nhất 6 ký tự');

  const [[dup]] = await pool.query(
    'SELECT username, student_code FROM users WHERE username = ? OR (student_code IS NOT NULL AND student_code = ?)',
    [username, role === 'student' ? studentCode : '']
  );
  if (dup) {
    throw new HttpError(409, dup.username === username ? 'Tên đăng nhập đã được sử dụng' : 'Mã sinh viên đã có tài khoản');
  }
  const [r] = await pool.query(
    'INSERT INTO users (username, password_hash, role, full_name, student_code, class_name) VALUES (?, ?, ?, ?, ?, ?)',
    [username, await bcrypt.hash(password, 10), role, fullName, role === 'student' ? studentCode : null, role === 'student' ? className : null]
  );
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authenticate, async (req, res) => {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) throw new HttpError(401, 'Tài khoản không còn tồn tại');
  res.json({ user: publicUser(user) });
});

router.post('/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) throw new HttpError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự');
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !(await bcrypt.compare(String(oldPassword || ''), user.password_hash))) {
    throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  }
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(newPassword), 10), user.id]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.publicUser = publicUser;
