// GV07. Báo cáo giám sát và vi phạm, GV08. Xử lý và xác nhận vi phạm
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('../db/pool');
const config = require('../config');
const { HttpError, toId } = require('../utils/http');
const { finalizeExpired, recomputeAttemptStats, parseJson } = require('../utils/attempts');
const { EVENT_TYPES, riskLevel, eventPoints } = require('../utils/proctorRules');

const router = express.Router();

/** Bài làm thuộc phòng của giảng viên đang đăng nhập */
async function getOwnAttempt(attemptId, teacherId) {
  const [[a]] = await pool.query(
    `SELECT a.*, r.name AS room_name, r.teacher_id, r.id AS rid, e.title AS exam_title,
            u.full_name, u.student_code, u.class_name
       FROM attempts a JOIN rooms r ON r.id = a.room_id JOIN exams e ON e.id = r.exam_id JOIN users u ON u.id = a.student_id
      WHERE a.id = ?`,
    [attemptId]
  );
  if (!a || a.teacher_id !== teacherId) throw new HttpError(404, 'Không tìm thấy bài làm');
  return a;
}

router.get('/attempts/:id/report', async (req, res) => {
  const id = toId(req.params.id);
  await finalizeExpired('id = ?', [id]);
  const a = await getOwnAttempt(id, req.user.id);
  const [events] = await pool.query('SELECT * FROM proctor_events WHERE attempt_id = ? ORDER BY started_at', [id]);

  // Chi tiết bài làm: đáp án sinh viên chọn so với đáp án đúng
  const order = parseJson(a.question_order);
  const qIds = order.map((o) => o.q);
  let answers = [];
  if (qIds.length) {
    const [qs] = await pool.query('SELECT id, content FROM questions WHERE id IN (?)', [qIds]);
    const [opts] = await pool.query('SELECT * FROM question_options WHERE question_id IN (?)', [qIds]);
    const [ans] = await pool.query('SELECT * FROM answers WHERE attempt_id = ?', [id]);
    const qMap = new Map(qs.map((q) => [q.id, q]));
    const oMap = new Map(opts.map((o) => [o.id, o]));
    const aMap = new Map(ans.map((x) => [x.question_id, x]));
    answers = order.map((o, i) => {
      const chosen = aMap.get(o.q)?.option_id ?? null;
      return {
        index: i + 1,
        content: qMap.get(o.q)?.content,
        options: o.o.map((oid) => ({ id: oid, content: oMap.get(oid)?.content, isCorrect: oMap.get(oid)?.is_correct === 1 })),
        chosenOptionId: chosen,
        isCorrect: chosen != null && oMap.get(chosen)?.is_correct === 1,
      };
    });
  }

  const counts = {};
  for (const e of events) {
    if (e.status === 'dismissed') continue;
    counts[e.type] = (counts[e.type] || 0) + 1;
  }

  res.json({
    attempt: {
      id: a.id,
      roomId: a.rid,
      roomName: a.room_name,
      examTitle: a.exam_title,
      status: a.status,
      submitReason: a.submit_reason,
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
      deadlineAt: a.deadline_at,
      score: a.score != null ? Number(a.score) : null,
      correctCount: a.correct_count,
      totalQuestions: a.total_questions || order.length,
      tabViolations: a.tab_violations,
      fullscreenViolations: a.fullscreen_violations,
      riskScore: a.risk_score,
      riskLevel: riskLevel(a.risk_score),
      reviewStatus: a.review_status,
      reviewNote: a.review_note,
      baseline: parseJson(a.baseline),
    },
    student: { fullName: a.full_name, studentCode: a.student_code, className: a.class_name },
    counts,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      label: EVENT_TYPES[e.type]?.label || e.type,
      source: e.source,
      startedAt: e.started_at,
      durationMs: e.duration_ms,
      confidence: e.confidence != null ? Number(e.confidence) : null,
      details: parseJson(e.details),
      hasSnapshot: !!e.snapshot_path,
      status: e.status,
      points: Math.round(eventPoints(e.type, e.duration_ms)),
    })),
    answers,
  });
});

// Xác nhận / bỏ qua một cảnh báo
router.patch('/events/:id', async (req, res) => {
  const id = toId(req.params.id);
  const status = req.body?.status;
  if (!['pending', 'confirmed', 'dismissed'].includes(status)) throw new HttpError(400, 'Trạng thái không hợp lệ');
  const [[ev]] = await pool.query('SELECT attempt_id FROM proctor_events WHERE id = ?', [id]);
  if (!ev) throw new HttpError(404, 'Không tìm thấy sự kiện');
  await getOwnAttempt(ev.attempt_id, req.user.id);
  const stats = await withTransaction(async (conn) => {
    await conn.query('UPDATE proctor_events SET status = ? WHERE id = ?', [status, id]);
    return recomputeAttemptStats(conn, ev.attempt_id);
  });
  res.json({ ok: true, ...stats, riskLevel: riskLevel(stats.riskScore) });
});

// Đánh dấu cả bài thi hợp lệ / gian lận
router.patch('/attempts/:id/review', async (req, res) => {
  const id = toId(req.params.id);
  const { reviewStatus, note } = req.body || {};
  if (!['pending', 'valid', 'cheating'].includes(reviewStatus)) throw new HttpError(400, 'Trạng thái không hợp lệ');
  await getOwnAttempt(id, req.user.id);
  await pool.query('UPDATE attempts SET review_status = ?, review_note = ? WHERE id = ?', [reviewStatus, String(note || '').slice(0, 500), id]);
  res.json({ ok: true });
});

// Ảnh bằng chứng: chỉ giảng viên sở hữu phòng thi mới xem được (AI04)
router.get('/events/:id/snapshot', async (req, res) => {
  const id = toId(req.params.id);
  const [[ev]] = await pool.query('SELECT attempt_id, snapshot_path FROM proctor_events WHERE id = ?', [id]);
  if (!ev || !ev.snapshot_path) throw new HttpError(404, 'Không có ảnh bằng chứng');
  await getOwnAttempt(ev.attempt_id, req.user.id);
  const file = path.resolve(config.evidenceDir, ev.snapshot_path);
  if (!file.startsWith(config.evidenceDir + path.sep) || !fs.existsSync(file)) throw new HttpError(404, 'Không có ảnh bằng chứng');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
});

module.exports = router;
