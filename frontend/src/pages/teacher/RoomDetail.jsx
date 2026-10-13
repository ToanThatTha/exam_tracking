// GV06. Xem kết quả và thống kê + tổng hợp vi phạm (GV07)
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Empty, Loading, Stat } from '../../components/ui';
import { fmtDateTime, LETTERS, REVIEW, RISK, ROOM_STATUS, SUBMIT_REASONS } from '../../utils/format';

const AI_TYPES = ['NO_FACE', 'MULTI_FACE', 'MULTI_PERSON', 'HEAD_TURN', 'HEAD_DOWN', 'LOOK_AWAY_REPEATED', 'PHONE', 'CAMERA_OFF'];

function ResultsTab({ data }) {
  const { summary, results } = data;
  const maxDist = Math.max(1, ...summary.distribution);
  return (
    <>
      <div className="grid grid-4">
        <Stat value={`${summary.submitted}/${summary.eligible ?? summary.started}`} label="Đã nộp / được giao bài" />
        <Stat value={summary.average ?? '—'} label="Điểm trung bình" />
        <Stat value={summary.submitted ? `${summary.highest} / ${summary.lowest}` : '—'} label="Cao nhất / thấp nhất" />
        <Stat value={summary.highRisk} label="Bài rủi ro cao" tone={summary.highRisk ? 'var(--danger)' : undefined} />
      </div>
      {summary.submitted > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Phổ điểm</h3>
          <div className="dist">
            {summary.distribution.map((n, i) => (
              <div className="dist-col" key={i} title={`${n} sinh viên`}>
                <span>{n || ''}</span>
                <div style={{ height: `${(n / maxDist) * 85}%` }} />
                <span>{i === 9 ? '9–10' : `${i}–${i + 1}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Sinh viên</th><th>Trạng thái</th><th className="num">Điểm</th><th className="num">Đúng</th>
              <th className="num">Thoát tab</th><th className="num">Thoát TMH</th><th className="num">Cảnh báo AI</th>
              <th>Rủi ro</th><th>Kết luận</th><th />
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && <tr><td colSpan="10"><Empty>Chưa có sinh viên nào.</Empty></td></tr>}
            {results.map((r) => {
              const ai = r.eventCounts ? AI_TYPES.reduce((s, t) => s + (r.eventCounts[t] || 0), 0) : null;
              const lv = r.riskLevel ? RISK[r.riskLevel] : null;
              return (
                <tr key={r.student.id}>
                  <td><strong>{r.student.fullName}</strong><div className="muted small">{r.student.studentCode} · {r.student.className}</div></td>
                  <td className="small">
                    {r.status === 'not_started' && <span className="badge">Chưa thi</span>}
                    {r.status === 'in_progress' && <span className="badge badge-primary badge-dot">Đang thi</span>}
                    {r.status === 'submitted' && <><span className="badge badge-ok">Đã nộp</span><div className="muted">{SUBMIT_REASONS[r.submitReason]}<br />{fmtDateTime(r.submittedAt)}</div></>}
                  </td>
                  <td className="num"><strong>{r.score ?? '—'}</strong></td>
                  <td className="num">{r.status === 'submitted' ? `${r.correctCount}/${r.totalQuestions}` : '—'}</td>
                  <td className="num">{r.tabViolations ?? '—'}</td>
                  <td className="num">{r.fullscreenViolations ?? '—'}</td>
                  <td className="num">{ai ?? '—'}</td>
                  <td>{lv ? <span className={lv.cls}>{r.riskScore} · {lv.label}</span> : '—'}</td>
                  <td>{r.reviewStatus ? <span className={REVIEW[r.reviewStatus].cls}>{REVIEW[r.reviewStatus].label}</span> : '—'}</td>
                  <td>{r.attemptId && <Link className="btn btn-sm" to={`/teacher/attempts/${r.attemptId}`}>Báo cáo</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QuestionStatsTab({ roomId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/teacher/rooms/${roomId}/question-stats`).then((r) => setData(r.data)).catch((e) => setError(errMsg(e))); }, [roomId]);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <Loading />;
  if (!data.submitted) return <div className="card"><Empty>Chưa có bài nộp để thống kê.</Empty></div>;
  const sorted = [...data.questions].sort((a, b) => (a.correctRate ?? 0) - (b.correctRate ?? 0));
  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>Dựa trên {data.submitted} bài đã nộp, sắp xếp từ câu có tỷ lệ đúng thấp nhất (câu nhiều sinh viên sai nhất).</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Câu hỏi</th><th>Tỷ lệ đúng</th><th className="num">Đúng</th><th className="num">Sai</th><th className="num">Bỏ trống</th><th title="A, B, C... theo thứ tự gốc trong ngân hàng câu hỏi (trước khi trộn)">Số lượt chọn (thứ tự gốc)</th></tr></thead>
          <tbody>
            {sorted.map((q) => (
              <tr key={q.id}>
                <td style={{ maxWidth: 380 }}>{q.content}<div className="muted small">{q.chapter}</div></td>
                <td>
                  <div className="bar-cell">
                    <div className="bar"><div style={{ width: `${q.correctRate || 0}%`, background: q.correctRate < 50 ? 'var(--danger)' : 'var(--primary)' }} /></div>
                    <b className="mono">{q.correctRate ?? 0}%</b>
                  </div>
                </td>
                <td className="num">{q.correct}</td>
                <td className="num">{q.wrong}</td>
                <td className="num">{q.blank}</td>
                <td className="small">
                  {q.options.map((o, i) => (
                    <span key={o.id} style={{ marginRight: 10, color: o.isCorrect ? 'var(--ok)' : undefined, fontWeight: o.isCorrect ? 700 : 400 }} title={o.content}>
                      {LETTERS[i]}: {o.picked}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function RoomDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('results');

  const load = useCallback(() => api.get(`/teacher/rooms/${id}/results`).then((r) => setData(r.data)).catch((e) => setError(errMsg(e))), [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // cập nhật khi sinh viên đang thi
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <Loading />;
  const r = data.room;
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/teacher/rooms" className="small">← Danh sách phòng thi</Link>
          <h1>{r.name}</h1>
          <p>
            {r.examTitle} · {r.allowedClasses ? `lớp ${r.allowedClasses}` : 'danh sách riêng'} · <span className={ROOM_STATUS[r.status].cls}>{ROOM_STATUS[r.status].label}</span>
            <br />{fmtDateTime(r.openAt)} → {fmtDateTime(r.closeAt)}
          </p>
        </div>
        <Link className="btn" to={`/teacher/rooms/${id}/edit`}>Sửa phòng thi</Link>
      </div>
      <div className="tabs">
        <button className={`tab${tab === 'results' ? ' active' : ''}`} onClick={() => setTab('results')}>Kết quả &amp; giám sát</button>
        <button className={`tab${tab === 'questions' ? ' active' : ''}`} onClick={() => setTab('questions')}>Thống kê theo câu hỏi</button>
      </div>
      {tab === 'results' ? <ResultsTab data={data} /> : <QuestionStatsTab roomId={id} />}
    </>
  );
}
