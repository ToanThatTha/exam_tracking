// GV04. Tạo và quản lý phòng thi, GV05. Cấu hình giám sát, GV06. Kết quả và thống kê
const express = require('express');
const { pool, withTransaction } = require('../db/pool');
const { HttpError, toId } = require('../utils/http');
const { parseClasses, isStudentAllowed, roomTimeStatus, mapRoomConfig } = require('../utils/rooms');
const { finalizeExpired, parseJson } = require('../utils/attempts');
const { riskLevel } = require('../utils/proctorRules');

const router = express.Router();

function validateRoom(body) {
  const name = String(body.name || '').trim();
  const examId = Number(body.examId);
  const openAt = new Date(body.openAt);
  const closeAt = new Date(body.closeAt);
  const maxTab = Number(body.maxTabViolations ?? 3);
  if (!name) return { error: 'Thiếu tên phòng thi' };
  if (!Number.isInteger(examId) || examId <= 0) return { error: 'Chưa chọn đề thi' };
  if (isNaN(openAt) || isNaN(closeAt)) return { error: 'Thời gian mở / đóng phòng không hợp lệ' };
  if (closeAt <= openAt) return { error: 'Thời gian đóng phòng phải sau thời gian mở' };
  if (!Number.isInteger(maxTab) || maxTab < 0 || maxTab > 100) return { error: 'Giới hạn thoát tab phải từ 0 đến 100 (0 = không giới hạn)' };
  const action = body.violationAction === 'warn' ? 'warn' : 'auto_submit';
  const studentIds = [...new Set((body.studentIds || []).map(Number).filter((n) => n > 0))];
  if (!parseClasses(body.allowedClasses ?? '').length && !studentIds.length) return { error: 'Hãy giao bài cho ít nhất một lớp hoặc một sinh viên' };
  return {
    value: {
      name, examId, openAt, closeAt, maxTab, action, studentIds,
      allowedClasses: parseClasses(body.allowedClasses ?? '').join(','),
      requireCamera: body.requireCamera !== false,
      requireFullscreen: body.requireFullscreen !== false,
      showAnswers: !!body.showAnswers,
    },
  };
}

async function getOwnRoom(id, teacherId) {
  const [[room]] = await pool.query(
    `SELECT r.*, e.title AS exam_title, e.duration_minutes
       FROM rooms r JOIN exams e ON e.id = r.exam_id WHERE r.id = ? AND r.teacher_id = ?`,
    [id, teacherId]
  );
  if (!room) throw new HttpError(404, 'Không tìm thấy phòng thi');
  return room;
}

function mapRoom(r) {
  return {
    id: r.id,
    name: r.name,
    examId: r.exam_id,
    examTitle: r.exam_title,
    durationMinutes: r.duration_minutes,
    openAt: r.open_at,
    closeAt: r.close_at,
    allowedClasses: r.allowed_classes,
    status: roomTimeStatus(r),
    ...mapRoomConfig(r),
    attemptCount: r.attempt_count != null ? Number(r.attempt_count) : undefined,
    submittedCount: r.submitted_count != null ? Number(r.submitted_count) : undefined,
    flaggedCount: r.flagged_count != null ? Number(r.flagged_count) : undefined,
  };
}

async function saveRoomStudents(conn, roomId, ids) {
  await conn.query('DELETE FROM room_students WHERE room_id = ?', [roomId]);
  if (!ids.length) return;
  const [valid] = await conn.query("SELECT id FROM users WHERE role = 'student' AND id IN (?)", [ids]);
  for (const { id } of valid) await conn.query('INSERT INTO room_students (room_id, student_id) VALUES (?, ?)', [roomId, id]);
}

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, e.title AS exam_title, e.duration_minutes,
            (SELECT COUNT(*) FROM attempts a WHERE a.room_id = r.id) AS attempt_count,
            (SELECT COUNT(*) FROM attempts a WHERE a.room_id = r.id AND a.status = 'submitted') AS submitted_count,
            (SELECT COUNT(*) FROM attempts a WHERE a.room_id = r.id AND a.risk_score >= 50) AS flagged_count
       FROM rooms r JOIN exams e ON e.id = r.exam_id
      WHERE r.teacher_id = ? ORDER BY r.open_at DESC`,
    [req.user.id]
  );
  res.json(rows.map(mapRoom));
});

router.get('/:id', async (req, res) => {
  const room = await getOwnRoom(toId(req.params.id), req.user.id);
  const [students] = await pool.query('SELECT student_id FROM room_students WHERE room_id = ?', [room.id]);
  res.json({ ...mapRoom(room), studentIds: students.map((s) => s.student_id) });
});

router.post('/', async (req, res) => {
  const v = validateRoom(req.body || {});
  if (v.error) throw new HttpError(400, v.error);
  const id = await withTransaction(async (conn) => {
    const [[exam]] = await conn.query('SELECT id FROM exams WHERE id = ? AND teacher_id = ?', [v.value.examId, req.user.id]);
    if (!exam) throw new HttpError(400, 'Đề thi không tồn tại');
    const [r] = await conn.query(
      `INSERT INTO rooms (teacher_id, exam_id, name, open_at, close_at, allowed_classes,
                          require_camera, require_fullscreen, max_tab_violations, violation_action, show_answers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, v.value.examId, v.value.name, v.value.openAt, v.value.closeAt, v.value.allowedClasses,
        v.value.requireCamera ? 1 : 0, v.value.requireFullscreen ? 1 : 0, v.value.maxTab, v.value.action, v.value.showAnswers ? 1 : 0]
    );
    await saveRoomStudents(conn, r.insertId, v.value.studentIds);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id);
  const v = validateRoom(req.body || {});
  if (v.error) throw new HttpError(400, v.error);
  await getOwnRoom(id, req.user.id);
  await withTransaction(async (conn) => {
    const [[started]] = await conn.query('SELECT COUNT(*) AS n FROM attempts WHERE room_id = ?', [id]);
    const [[cur]] = await conn.query('SELECT exam_id FROM rooms WHERE id = ?', [id]);
    if (started.n > 0 && cur.exam_id !== v.value.examId) {
      throw new HttpError(409, 'Phòng đã có sinh viên vào thi, không thể đổi đề thi');
    }
    const [[exam]] = await conn.query('SELECT id FROM exams WHERE id = ? AND teacher_id = ?', [v.value.examId, req.user.id]);
    if (!exam) throw new HttpError(400, 'Đề thi không tồn tại');
    await conn.query(
      `UPDATE rooms SET exam_id = ?, name = ?, open_at = ?, close_at = ?, allowed_classes = ?, require_camera = ?,
              require_fullscreen = ?, max_tab_violations = ?, violation_action = ?, show_answers = ? WHERE id = ?`,
      [v.value.examId, v.value.name, v.value.openAt, v.value.closeAt, v.value.allowedClasses, v.value.requireCamera ? 1 : 0,
        v.value.requireFullscreen ? 1 : 0, v.value.maxTab, v.value.action, v.value.showAnswers ? 1 : 0, id]
    );
    await saveRoomStudents(conn, id, v.value.studentIds);
  });
  res.json({ id });
});

router.delete('/:id', async (req, res) => {
  const id = toId(req.params.id);
  await getOwnRoom(id, req.user.id);
  await pool.query('DELETE FROM rooms WHERE id = ?', [id]);
  res.json({ ok: true });
});

// GV06 + GV07: Danh sách kết quả của từng sinh viên trong phòng (kể cả chưa thi)
router.get('/:id/results', async (req, res) => {
  const room = await getOwnRoom(toId(req.params.id), req.user.id);
  await finalizeExpired('room_id = ?', [room.id]);

  const [explicit] = await pool.query('SELECT student_id FROM room_students WHERE room_id = ?', [room.id]);
  const explicitIds = explicit.map((r) => r.student_id);
  const [attempts] = await pool.query(
    `SELECT a.*, u.full_name, u.student_code, u.class_name, u.username
       FROM attempts a JOIN users u ON u.id = a.student_id WHERE a.room_id = ?`,
    [room.id]
  );
  const [eventCounts] = await pool.query(
    `SELECT pe.attempt_id, pe.type, COUNT(*) AS n
       FROM proctor_events pe JOIN attempts a ON a.id = pe.attempt_id
      WHERE a.room_id = ? AND pe.status <> 'dismissed' GROUP BY pe.attempt_id, pe.type`,
    [room.id]
  );
  const countsBy = {};
  for (const r of eventCounts) {
    countsBy[r.attempt_id] = countsBy[r.attempt_id] || {};
    countsBy[r.attempt_id][r.type] = Number(r.n);
  }

  // Sinh viên được giao bài (kể cả chưa vào thi)
  const classes = parseClasses(room.allowed_classes);
  const [rows] = await pool.query(
    `SELECT id, full_name, student_code, class_name, username FROM users
      WHERE role = 'student' AND (class_name IN (?) OR id IN (?))`,
    [classes.length ? classes : [''], explicitIds.length ? explicitIds : [0]]
  );
  const eligible = rows.filter((s) => isStudentAllowed(room, s, explicitIds));
  const attemptedIds = new Set(attempts.map((a) => a.student_id));

  const results = attempts.map((a) => ({
    attemptId: a.id,
    student: { id: a.student_id, fullName: a.full_name, studentCode: a.student_code, className: a.class_name },
    status: a.status,
    submitReason: a.submit_reason,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    score: a.score != null ? Number(a.score) : null,
    correctCount: a.correct_count,
    totalQuestions: a.total_questions || parseJson(a.question_order).length,
    tabViolations: a.tab_violations,
    fullscreenViolations: a.fullscreen_violations,
    riskScore: a.risk_score,
    riskLevel: riskLevel(a.risk_score),
    reviewStatus: a.review_status,
    eventCounts: countsBy[a.id] || {},
  }));
  for (const s of eligible) {
    if (attemptedIds.has(s.id)) continue;
    results.push({
      attemptId: null,
      student: { id: s.id, fullName: s.full_name, studentCode: s.student_code, className: s.class_name },
      status: 'not_started',
    });
  }
  results.sort((x, y) => (x.student.studentCode || '').localeCompare(y.student.studentCode || ''));

  const scores = results.filter((r) => r.status === 'submitted').map((r) => r.score);
  const summary = {
    eligible: eligible.length,
    started: attempts.length,
    submitted: scores.length,
    average: scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 100) / 100 : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
    // Phổ điểm theo khoảng [0,1), [1,2) ... [9,10]
    distribution: Array.from({ length: 10 }, (_, i) => scores.filter((s) => (i === 9 ? s >= 9 : s >= i && s < i + 1)).length),
    highRisk: results.filter((r) => r.riskLevel === 'high').length,
  };
  res.json({ room: mapRoom(room), summary, results });
});

// GV06: Tỷ lệ trả lời đúng / sai theo từng câu hỏi
router.get('/:id/question-stats', async (req, res) => {
  const room = await getOwnRoom(toId(req.params.id), req.user.id);
  await finalizeExpired('room_id = ?', [room.id]);
  const [qrows] = await pool.query(
    `SELECT q.id, q.content, q.chapter FROM exam_questions eq JOIN questions q ON q.id = eq.question_id
      WHERE eq.exam_id = ? ORDER BY eq.position`,
    [room.exam_id]
  );
  const qIds = qrows.map((q) => q.id);
  if (!qIds.length) return res.json({ submitted: 0, questions: [] });
  const [opts] = await pool.query('SELECT * FROM question_options WHERE question_id IN (?) ORDER BY position', [qIds]);
  const [[{ n: submitted }]] = await pool.query("SELECT COUNT(*) AS n FROM attempts WHERE room_id = ? AND status = 'submitted'", [room.id]);
  const [picks] = await pool.query(
    `SELECT ans.question_id, ans.option_id, COUNT(*) AS n
       FROM answers ans JOIN attempts a ON a.id = ans.attempt_id
      WHERE a.room_id = ? AND a.status = 'submitted' AND ans.option_id IS NOT NULL
      GROUP BY ans.question_id, ans.option_id`,
    [room.id]
  );
  const pickMap = new Map(picks.map((p) => [`${p.question_id}:${p.option_id}`, Number(p.n)]));
  const questions = qrows.map((q, idx) => {
    const options = opts.filter((o) => o.question_id === q.id).map((o) => ({
      id: o.id, content: o.content, isCorrect: o.is_correct === 1, picked: pickMap.get(`${q.id}:${o.id}`) || 0,
    }));
    const correct = options.filter((o) => o.isCorrect).reduce((s, o) => s + o.picked, 0);
    const answered = options.reduce((s, o) => s + o.picked, 0);
    return {
      index: idx + 1, id: q.id, content: q.content, chapter: q.chapter, options,
      correct, wrong: answered - correct, blank: Number(submitted) - answered,
      correctRate: Number(submitted) ? Math.round((correct / Number(submitted)) * 1000) / 10 : null,
    };
  });
  res.json({ submitted: Number(submitted), questions });
});

module.exports = router;
