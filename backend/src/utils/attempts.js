const crypto = require('crypto');
const { pool, withTransaction } = require('../db/pool');
const { computeRisk } = require('./proctorRules');

/** Fisher–Yates dùng crypto để sinh viên không đoán được thứ tự */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sinh thứ tự câu hỏi và phương án riêng cho một sinh viên (GV03: trộn câu, trộn phương án) */
async function buildQuestionOrder(conn, exam) {
  const [qs] = await conn.query(
    'SELECT question_id FROM exam_questions WHERE exam_id = ? ORDER BY position',
    [exam.id]
  );
  const ids = qs.map((r) => r.question_id);
  if (!ids.length) return [];
  const [opts] = await conn.query(
    'SELECT id, question_id FROM question_options WHERE question_id IN (?) ORDER BY question_id, position',
    [ids]
  );
  const byQ = new Map(ids.map((id) => [id, []]));
  for (const o of opts) byQ.get(o.question_id).push(o.id);

  const ordered = exam.shuffle_questions ? shuffle(ids) : ids;
  return ordered.map((q) => ({ q, o: exam.shuffle_options ? shuffle(byQ.get(q)) : byQ.get(q) }));
}

function parseJson(v) {
  if (v == null) return v;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

/**
 * Chấm và chốt bài làm. An toàn khi gọi nhiều lần: chỉ chốt nếu bài còn 'in_progress'.
 * @returns true nếu lần gọi này đã chốt bài
 */
async function finalizeAttempt(attemptId, reason) {
  return withTransaction(async (conn) => {
    const [[att]] = await conn.query('SELECT * FROM attempts WHERE id = ? FOR UPDATE', [attemptId]);
    if (!att || att.status !== 'in_progress') return false;

    const order = parseJson(att.question_order);
    const [rows] = await conn.query(
      `SELECT a.question_id, o.is_correct
         FROM answers a LEFT JOIN question_options o ON o.id = a.option_id AND o.question_id = a.question_id
        WHERE a.attempt_id = ?`,
      [attemptId]
    );
    const correctSet = new Set(rows.filter((r) => r.is_correct === 1).map((r) => r.question_id));
    const total = order.length;
    const correct = order.filter((x) => correctSet.has(x.q)).length;
    const score = total ? Math.round((correct / total) * 10 * 100) / 100 : 0;

    await conn.query(
      `UPDATE attempts SET status = 'submitted', submit_reason = ?, submitted_at = ?,
              correct_count = ?, total_questions = ?, score = ? WHERE id = ?`,
      [reason, new Date(), correct, total, score, attemptId]
    );
    return true;
  });
}

/** Chốt các bài đã quá hạn nhưng chưa nộp (ví dụ sinh viên tắt máy giữa chừng). */
async function finalizeExpired(whereSql = '1=1', params = []) {
  const graceMs = 15 * 1000; // cho phép trễ mạng
  const [rows] = await pool.query(
    `SELECT id FROM attempts WHERE status = 'in_progress' AND deadline_at < ? AND ${whereSql}`,
    [new Date(Date.now() - graceMs), ...params]
  );
  for (const r of rows) await finalizeAttempt(r.id, 'timeout');
}

/** Tính lại số lần vi phạm và điểm rủi ro của một bài làm từ bảng proctor_events */
async function recomputeAttemptStats(conn, attemptId) {
  const [events] = await conn.query(
    'SELECT type, duration_ms, status FROM proctor_events WHERE attempt_id = ?',
    [attemptId]
  );
  const tab = events.filter((e) => e.type === 'TAB_HIDDEN').length;
  const fs = events.filter((e) => e.type === 'FULLSCREEN_EXIT').length;
  const risk = computeRisk(events);
  await conn.query(
    'UPDATE attempts SET tab_violations = ?, fullscreen_violations = ?, risk_score = ? WHERE id = ?',
    [tab, fs, risk, attemptId]
  );
  return { tabViolations: tab, fullscreenViolations: fs, riskScore: risk };
}

module.exports = { shuffle, buildQuestionOrder, finalizeAttempt, finalizeExpired, recomputeAttemptStats, parseJson };
