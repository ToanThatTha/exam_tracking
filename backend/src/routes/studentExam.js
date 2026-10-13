// SV02–SV07: luồng làm bài của sinh viên + nhận sự kiện giám sát (AI04)
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, withTransaction } = require('../db/pool');
const config = require('../config');
const { HttpError, toId } = require('../utils/http');
const { isStudentAllowed, roomTimeStatus, mapRoomConfig } = require('../utils/rooms');
const { buildQuestionOrder, finalizeAttempt, finalizeExpired, recomputeAttemptStats, parseJson } = require('../utils/attempts');
const { EVENT_TYPES } = require('../utils/proctorRules');

const router = express.Router();
const GRACE_MS = 15 * 1000; // cho phép trễ mạng khi lưu đáp án / nộp bài sát giờ
const LATE_EVENT_MS = 60 * 1000; // vẫn nhận sự kiện còn tồn đọng trong 60 giây sau khi nộp
const MAX_SNAPSHOT_BYTES = 600 * 1024;

async function getStudent(id) {
  const [[u]] = await pool.query("SELECT * FROM users WHERE id = ? AND role = 'student'", [id]);
  if (!u) throw new HttpError(401, 'Tài khoản không còn tồn tại');
  return u;
}

async function explicitIdsOf(roomId) {
  const [rows] = await pool.query('SELECT student_id FROM room_students WHERE room_id = ?', [roomId]);
  return rows.map((r) => r.student_id);
}

function mapStudentRoom(r, attempt) {
  return {
    id: r.id,
    name: r.name,
    examTitle: r.exam_title,
    subject: r.subject,
    durationMinutes: r.duration_minutes,
    questionCount: r.question_count != null ? Number(r.question_count) : undefined,
    openAt: r.open_at,
    closeAt: r.close_at,
    status: roomTimeStatus(r),
    ...mapRoomConfig(r),
    attempt: attempt
      ? { id: attempt.id, status: attempt.status, score: attempt.score != null ? Number(attempt.score) : null, submittedAt: attempt.submitted_at }
      : null,
  };
}

const ROOM_SELECT = `SELECT r.*, e.title AS exam_title, e.subject, e.duration_minutes,
       (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = r.exam_id) AS question_count
  FROM rooms r JOIN exams e ON e.id = r.exam_id`;

/** Kiểm tra sinh viên có được giao bài thi này không (SV02). Trả về phòng nếu hợp lệ. */
async function checkRoomAccess(student, roomId) {
  const [[room]] = await pool.query(`${ROOM_SELECT} WHERE r.id = ?`, [roomId]);
  if (!room) throw new HttpError(404, 'Không tìm thấy bài thi');
  if (!isStudentAllowed(room, student, await explicitIdsOf(room.id))) {
    throw new HttpError(403, 'Bạn không được giao bài thi này');
  }
  return room;
}

/** Bài làm của chính sinh viên đang đăng nhập */
async function getOwnAttempt(attemptId, studentId, conn = pool, lock = false) {
  const [[a]] = await conn.query(
    `SELECT a.*, r.max_tab_violations, r.violation_action, r.require_camera, r.require_fullscreen, r.show_answers,
            r.name AS room_name, e.title AS exam_title
       FROM attempts a JOIN rooms r ON r.id = a.room_id JOIN exams e ON e.id = r.exam_id
      WHERE a.id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [attemptId]
  );
  if (!a || a.student_id !== studentId) throw new HttpError(404, 'Không tìm thấy bài làm');
  return a;
}

function attemptState(a, stats) {
  return {
    status: a.status,
    submitReason: a.submit_reason,
    deadlineAt: a.deadline_at,
    serverTime: new Date(),
    tabViolations: stats ? stats.tabViolations : a.tab_violations,
    fullscreenViolations: stats ? stats.fullscreenViolations : a.fullscreen_violations,
    maxTabViolations: a.max_tab_violations,
    violationAction: a.violation_action,
  };
}

/** Bài đã quá giờ (kể cả thời gian ân hạn) thì tự chốt */
async function expireIfNeeded(a) {
  if (a.status === 'in_progress' && Date.now() > new Date(a.deadline_at).getTime() + GRACE_MS) {
    await finalizeAttempt(a.id, 'timeout');
    throw new HttpError(409, 'Đã hết thời gian làm bài. Bài thi đã được nộp tự động.', { submitted: true });
  }
}

// ---------------------------------------------------------------- SV02
// Danh sách bài thi được giao: theo lớp của sinh viên hoặc được thêm riêng
router.get('/rooms', async (req, res) => {
  const student = await getStudent(req.user.id);
  await finalizeExpired('student_id = ?', [student.id]);
  const [rooms] = await pool.query(
    `${ROOM_SELECT}
      WHERE FIND_IN_SET(?, REPLACE(r.allowed_classes, ' ', '')) > 0
         OR r.id IN (SELECT room_id FROM room_students WHERE student_id = ?)
         OR r.id IN (SELECT room_id FROM attempts WHERE student_id = ?)
      ORDER BY r.open_at DESC`,
    [student.class_name || '', student.id, student.id]
  );
  const [attempts] = await pool.query('SELECT * FROM attempts WHERE student_id = ?', [student.id]);
  const byRoom = new Map(attempts.map((a) => [a.room_id, a]));
  res.json(rooms.map((r) => mapStudentRoom(r, byRoom.get(r.id))));
});

// Thông tin bài thi + quy tắc giám sát cho trang chuẩn bị (GV05: thông báo quy tắc trước khi thi)
router.get('/rooms/:id', async (req, res) => {
  const student = await getStudent(req.user.id);
  const room = await checkRoomAccess(student, toId(req.params.id));
  await finalizeExpired('room_id = ? AND student_id = ?', [room.id, student.id]);
  const [[attempt]] = await pool.query('SELECT * FROM attempts WHERE room_id = ? AND student_id = ?', [room.id, student.id]);
  res.json(mapStudentRoom(room, attempt));
});

// Bắt đầu (hoặc tiếp tục) bài thi sau khi đã chuẩn bị camera / toàn màn hình (SV03)
router.post('/rooms/:id/start', async (req, res) => {
  const student = await getStudent(req.user.id);
  const roomId = toId(req.params.id);
  const room = await checkRoomAccess(student, roomId);
  const baseline = sanitizeBaseline(req.body?.baseline);
  if (room.require_camera && !baseline) throw new HttpError(400, 'Phòng thi yêu cầu camera: hãy hoàn tất bước hiệu chỉnh tư thế');

  const attemptId = await withTransaction(async (conn) => {
    const [[existing]] = await conn.query(
      'SELECT * FROM attempts WHERE room_id = ? AND student_id = ? FOR UPDATE',
      [room.id, student.id]
    );
    if (existing) {
      if (existing.status === 'submitted') throw new HttpError(409, 'Bạn đã nộp bài thi này');
      // Tiếp tục bài đang làm (ví dụ tải lại trang): cập nhật lại tư thế gốc
      if (baseline) await conn.query('UPDATE attempts SET baseline = ? WHERE id = ?', [JSON.stringify(baseline), existing.id]);
      return existing.id;
    }
    const status = roomTimeStatus(room);
    if (status === 'upcoming') throw new HttpError(403, 'Bài thi chưa đến giờ mở');
    if (status === 'closed') throw new HttpError(403, 'Bài thi đã hết thời gian mở');

    const [[exam]] = await conn.query('SELECT * FROM exams WHERE id = ?', [room.exam_id]);
    const order = await buildQuestionOrder(conn, exam);
    if (!order.length) throw new HttpError(409, 'Đề thi chưa có câu hỏi');
    const now = new Date();
    const deadline = new Date(Math.min(now.getTime() + exam.duration_minutes * 60000, new Date(room.close_at).getTime()));
    const [r] = await conn.query(
      `INSERT INTO attempts (room_id, student_id, started_at, deadline_at, question_order, baseline, total_questions, last_heartbeat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [room.id, student.id, now, deadline, JSON.stringify(order), baseline ? JSON.stringify(baseline) : null, order.length, now]
    );
    return r.insertId;
  });
  res.json({ attemptId });
});

function sanitizeBaseline(b) {
  if (!b || typeof b !== 'object') return null;
  const yaw = Number(b.yaw);
  const pitch = Number(b.pitch);
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(yaw) > 90 || Math.abs(pitch) > 90) return null;
  return { yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10 };
}

// ---------------------------------------------------------------- SV04
// Nội dung đề theo thứ tự riêng của sinh viên — KHÔNG gửi đáp án đúng
router.get('/attempts/:id', async (req, res) => {
  const a = await getOwnAttempt(toId(req.params.id), req.user.id);
  if (a.status === 'in_progress') {
    try { await expireIfNeeded(a); } catch (e) { if (e.status !== 409) throw e; a.status = 'submitted'; }
  }
  if (a.status !== 'in_progress') {
    return res.json({ id: a.id, roomId: a.room_id, ...attemptState({ ...a, status: 'submitted' }) });
  }
  const order = parseJson(a.question_order);
  const qIds = order.map((o) => o.q);
  const [qs] = await pool.query('SELECT id, content FROM questions WHERE id IN (?)', [qIds]);
  const [opts] = await pool.query('SELECT id, question_id, content FROM question_options WHERE question_id IN (?)', [qIds]);
  const [ans] = await pool.query('SELECT question_id, option_id, flagged FROM answers WHERE attempt_id = ?', [a.id]);
  const qMap = new Map(qs.map((q) => [q.id, q]));
  const oMap = new Map(opts.map((o) => [o.id, o]));
  res.json({
    id: a.id,
    roomId: a.room_id,
    roomName: a.room_name,
    examTitle: a.exam_title,
    requireCamera: a.require_camera === 1,
    requireFullscreen: a.require_fullscreen === 1,
    baseline: parseJson(a.baseline),
    startedAt: a.started_at,
    ...attemptState(a),
    questions: order.map((o) => ({
      id: o.q,
      content: qMap.get(o.q)?.content || '',
      options: o.o.map((oid) => ({ id: oid, content: oMap.get(oid)?.content || '' })),
    })),
    answers: ans.map((x) => ({ questionId: x.question_id, optionId: x.option_id, flagged: x.flagged === 1 })),
  });
});

/** Lưu một loạt đáp án (tự động lưu). Bỏ qua câu / phương án không thuộc bài làm. */
async function saveAnswers(conn, a, list) {
  if (!Array.isArray(list) || !list.length) return 0;
  const order = parseJson(a.question_order);
  const valid = new Map(order.map((o) => [o.q, new Set(o.o)]));
  let saved = 0;
  for (const item of list.slice(0, 500)) {
    const qid = Number(item.questionId);
    if (!valid.has(qid)) continue;
    const oid = item.optionId == null ? null : Number(item.optionId);
    if (oid != null && !valid.get(qid).has(oid)) continue;
    await conn.query(
      `INSERT INTO answers (attempt_id, question_id, option_id, flagged) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), flagged = VALUES(flagged)`,
      [a.id, qid, oid, item.flagged ? 1 : 0]
    );
    saved++;
  }
  return saved;
}

router.put('/attempts/:id/answers', async (req, res) => {
  const id = toId(req.params.id);
  const result = await withTransaction(async (conn) => {
    const a = await getOwnAttempt(id, req.user.id, conn, true);
    if (a.status !== 'in_progress') throw new HttpError(409, 'Bài thi đã được nộp', { submitted: true });
    if (Date.now() > new Date(a.deadline_at).getTime() + GRACE_MS) return { expired: true };
    return { saved: await saveAnswers(conn, a, req.body?.answers) };
  });
  if (result.expired) {
    await finalizeAttempt(id, 'timeout');
    throw new HttpError(409, 'Đã hết thời gian làm bài. Bài thi đã được nộp tự động.', { submitted: true });
  }
  res.json({ ok: true, saved: result.saved, savedAt: new Date() });
});

// ---------------------------------------------------------------- AI04 + SV05: sự kiện giám sát
function saveSnapshot(attemptId, clientId, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_SNAPSHOT_BYTES) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const rel = path.join(`attempt_${attemptId}`, `${clientId}.${ext}`);
  const full = path.join(config.evidenceDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buf);
  return rel;
}

function cleanEvent(e) {
  const type = String(e?.type || '');
  const def = EVENT_TYPES[type];
  if (!def || def.source === 'server') return null;
  const clientId = String(e.clientId || '');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(clientId)) return null;
  let startedAt = new Date(e.startedAt);
  if (isNaN(startedAt)) startedAt = new Date();
  // Không tin hoàn toàn đồng hồ máy sinh viên: giới hạn trong khoảng hợp lý
  if (startedAt > new Date(Date.now() + 60000)) startedAt = new Date();
  const durationMs = Math.max(0, Math.min(Number(e.durationMs) || 0, 6 * 3600 * 1000));
  const conf = e.confidence == null ? null : Math.max(0, Math.min(1, Number(e.confidence) || 0));
  let details = null;
  if (e.details && typeof e.details === 'object') {
    const s = JSON.stringify(e.details);
    if (s.length <= 2000) details = s;
  }
  return { type, source: def.source, clientId, startedAt, durationMs, confidence: conf, details, snapshot: e.snapshot };
}

router.post('/attempts/:id/events', async (req, res) => {
  const id = toId(req.params.id);
  const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
  const a0 = await getOwnAttempt(id, req.user.id);
  const lateOk = a0.status === 'submitted' && a0.submitted_at && Date.now() - new Date(a0.submitted_at).getTime() < LATE_EVENT_MS;
  if (a0.status !== 'in_progress' && !lateOk) throw new HttpError(409, 'Bài thi đã được nộp', { submitted: true });

  const events = list.map(cleanEvent).filter(Boolean);
  const outcome = await withTransaction(async (conn) => {
    const a = await getOwnAttempt(id, req.user.id, conn, true);
    for (const e of events) {
      const snapshotPath = e.snapshot ? saveSnapshot(a.id, e.clientId, e.snapshot) : null;
      // Cùng clientId gửi lại = cập nhật thời lượng (sự kiện còn đang diễn ra)
      await conn.query(
        `INSERT INTO proctor_events (attempt_id, client_id, type, source, started_at, duration_ms, confidence, details, snapshot_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE duration_ms = GREATEST(duration_ms, VALUES(duration_ms)),
                                 confidence = COALESCE(VALUES(confidence), confidence),
                                 details = COALESCE(VALUES(details), details),
                                 snapshot_path = COALESCE(snapshot_path, VALUES(snapshot_path))`,
        [a.id, e.clientId, e.type, e.source, e.startedAt, e.durationMs, e.confidence, e.details, snapshotPath]
      );
    }
    const stats = await recomputeAttemptStats(conn, a.id);
    const overLimit = a.status === 'in_progress' && a.max_tab_violations > 0 && stats.tabViolations >= a.max_tab_violations;
    return { a, stats, autoSubmit: overLimit && a.violation_action === 'auto_submit', overLimit };
  });
  if (outcome.autoSubmit) await finalizeAttempt(id, 'violation_limit');
  const [[fresh]] = await pool.query(
    'SELECT a.*, r.max_tab_violations, r.violation_action FROM attempts a JOIN rooms r ON r.id = a.room_id WHERE a.id = ?',
    [id]
  );
  res.json({ ok: true, accepted: events.length, overLimit: outcome.overLimit, ...attemptState(fresh, outcome.stats) });
});

// Nhịp tim: phát hiện mất kết nối kéo dài (máy chủ tự ghi sự kiện)
router.post('/attempts/:id/heartbeat', async (req, res) => {
  const id = toId(req.params.id);
  const a = await getOwnAttempt(id, req.user.id);
  if (a.status !== 'in_progress') return res.json(attemptState(a));
  try { await expireIfNeeded(a); } catch (e) {
    if (e.status === 409) return res.json(attemptState({ ...a, status: 'submitted', submit_reason: 'timeout' }));
    throw e;
  }
  const now = new Date();
  const last = a.last_heartbeat ? new Date(a.last_heartbeat) : new Date(a.started_at);
  const gapMs = now - last;
  await withTransaction(async (conn) => {
    if (gapMs > config.heartbeatGapSeconds * 1000) {
      await conn.query(
        `INSERT IGNORE INTO proctor_events (attempt_id, client_id, type, source, started_at, duration_ms, details)
         VALUES (?, ?, 'CONNECTION_LOST', 'server', ?, ?, ?)`,
        [a.id, `srv-${crypto.randomBytes(8).toString('hex')}`, last, gapMs, JSON.stringify({ gapSeconds: Math.round(gapMs / 1000) })]
      );
      await recomputeAttemptStats(conn, a.id);
    }
    await conn.query('UPDATE attempts SET last_heartbeat = ? WHERE id = ?', [now, a.id]);
  });
  res.json(attemptState(a));
});

// ---------------------------------------------------------------- SV06
router.post('/attempts/:id/submit', async (req, res) => {
  const id = toId(req.params.id);
  const wanted = req.body?.reason === 'timeout' ? 'timeout' : 'manual';
  await withTransaction(async (conn) => {
    const a = await getOwnAttempt(id, req.user.id, conn, true);
    if (a.status !== 'in_progress') return;
    // Lưu đáp án cuối cùng trước khi chốt (chấp nhận nếu chưa quá giờ + ân hạn)
    if (Date.now() <= new Date(a.deadline_at).getTime() + GRACE_MS) await saveAnswers(conn, a, req.body?.answers);
  });
  const a = await getOwnAttempt(id, req.user.id);
  const reason = Date.now() > new Date(a.deadline_at).getTime() ? 'timeout' : wanted;
  await finalizeAttempt(id, reason);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- SV07
router.get('/results', async (req, res) => {
  await finalizeExpired('student_id = ?', [req.user.id]);
  const [rows] = await pool.query(
    `SELECT a.id, a.status, a.score, a.correct_count, a.total_questions, a.submitted_at, a.submit_reason,
            r.name AS room_name, r.show_answers, e.title AS exam_title
       FROM attempts a JOIN rooms r ON r.id = a.room_id JOIN exams e ON e.id = r.exam_id
      WHERE a.student_id = ? ORDER BY a.started_at DESC`,
    [req.user.id]
  );
  res.json(rows.map((r) => ({
    id: r.id, status: r.status, roomName: r.room_name, examTitle: r.exam_title,
    score: r.score != null ? Number(r.score) : null, correctCount: r.correct_count, totalQuestions: r.total_questions,
    submittedAt: r.submitted_at, submitReason: r.submit_reason, showAnswers: r.show_answers === 1,
  })));
});

router.get('/attempts/:id/result', async (req, res) => {
  const id = toId(req.params.id);
  await finalizeExpired('id = ?', [id]);
  const a = await getOwnAttempt(id, req.user.id);
  if (a.status !== 'submitted') throw new HttpError(409, 'Bài thi chưa nộp');
  const result = {
    id: a.id,
    roomName: a.room_name,
    examTitle: a.exam_title,
    score: a.score != null ? Number(a.score) : null,
    correctCount: a.correct_count,
    totalQuestions: a.total_questions,
    submittedAt: a.submitted_at,
    submitReason: a.submit_reason,
    showAnswers: a.show_answers === 1,
    questions: null,
  };
  if (result.showAnswers) {
    const order = parseJson(a.question_order);
    const qIds = order.map((o) => o.q);
    const [qs] = await pool.query('SELECT id, content FROM questions WHERE id IN (?)', [qIds]);
    const [opts] = await pool.query('SELECT * FROM question_options WHERE question_id IN (?)', [qIds]);
    const [ans] = await pool.query('SELECT question_id, option_id FROM answers WHERE attempt_id = ?', [a.id]);
    const qMap = new Map(qs.map((q) => [q.id, q]));
    const oMap = new Map(opts.map((o) => [o.id, o]));
    const aMap = new Map(ans.map((x) => [x.question_id, x.option_id]));
    result.questions = order.map((o, i) => ({
      index: i + 1,
      content: qMap.get(o.q)?.content || '',
      chosenOptionId: aMap.get(o.q) ?? null,
      options: o.o.map((oid) => ({ id: oid, content: oMap.get(oid)?.content || '', isCorrect: oMap.get(oid)?.is_correct === 1 })),
    }));
  }
  res.json(result);
});

module.exports = router;
