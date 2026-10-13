// GV07. Báo cáo giám sát và vi phạm, GV08. Xử lý và xác nhận vi phạm
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Loading, useToast } from '../../components/ui';
import { EVENT_LABELS, fmtDateTime, fmtDuration, fmtTime, LETTERS, REVIEW, RISK, SUBMIT_REASONS } from '../../utils/format';

/** Ảnh bằng chứng tải qua API có token (ảnh không public) */
function Snapshot({ eventId, onOpen }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    api.get(`/teacher/events/${eventId}/snapshot`, { responseType: 'blob' })
      .then((r) => { url = URL.createObjectURL(r.data); setSrc(url); })
      .catch(() => setSrc(''));
    return () => url && URL.revokeObjectURL(url);
  }, [eventId]);
  if (src === null) return <div className="tl-thumb" style={{ height: 112 }} />;
  if (!src) return <span className="muted small">Không tải được ảnh</span>;
  return <img className="tl-thumb" src={src} alt="Ảnh bằng chứng" onClick={() => onOpen(src)} />;
}

function describe(e) {
  const d = e.details || {};
  const parts = [];
  if (e.durationMs) parts.push(`kéo dài ${fmtDuration(e.durationMs)}`);
  if (d.yawDelta != null) parts.push(`lệch ngang ${d.yawDelta}°`);
  if (d.pitchDelta != null) parts.push(`lệch dọc ${d.pitchDelta}°`);
  if (d.faces != null) parts.push(`${d.faces} khuôn mặt`);
  if (d.persons != null) parts.push(`${d.persons} người`);
  if (d.label) parts.push(`đối tượng "${d.label}"`);
  if (d.count != null && e.type === 'LOOK_AWAY_REPEATED') parts.push(`${d.count} lần trong ${d.windowSeconds} giây`);
  if (d.gapSeconds != null) parts.push(`không nhận tín hiệu ${d.gapSeconds} giây`);
  if (d.reason) parts.push(d.reason);
  if (e.confidence != null) parts.push(`độ tin cậy ${Math.round(e.confidence * 100)}%`);
  return parts.join(' · ');
}

export default function AttemptReport() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [note, setNote] = useState('');
  const [showAnswers, setShowAnswers] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/teacher/attempts/${id}/report`);
      setData(r.data);
      setNote(r.data.attempt.reviewNote || '');
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function setEventStatus(ev, status) {
    try {
      const r = await api.patch(`/teacher/events/${ev.id}`, { status });
      setData((d) => ({
        ...d,
        attempt: { ...d.attempt, riskScore: r.data.riskScore, riskLevel: r.data.riskLevel },
        events: d.events.map((x) => (x.id === ev.id ? { ...x, status } : x)),
      }));
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }

  async function review(reviewStatus) {
    try {
      await api.patch(`/teacher/attempts/${id}/review`, { reviewStatus, note });
      setData((d) => ({ ...d, attempt: { ...d.attempt, reviewStatus, reviewNote: note } }));
      toast(reviewStatus === 'cheating' ? 'Đã đánh dấu bài thi có gian lận' : reviewStatus === 'valid' ? 'Đã đánh dấu bài thi hợp lệ' : 'Đã chuyển về chưa xét', 'ok');
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <Loading />;
  const { attempt: a, student, events, answers } = data;
  const lv = RISK[a.riskLevel];
  const counts = {};
  for (const e of events) if (e.status !== 'dismissed') counts[e.type] = (counts[e.type] || 0) + 1;
  const shown = typeFilter ? events.filter((e) => e.type === typeFilter) : events;
  const pending = events.filter((e) => e.status === 'pending').length;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={`/teacher/rooms/${a.roomId}`} className="small">← {a.roomName}</Link>
          <h1>{student.fullName}</h1>
          <p>{student.studentCode} · Lớp {student.className} · {a.examTitle}</p>
        </div>
        <span className={REVIEW[a.reviewStatus].cls} style={{ fontSize: '0.95rem', padding: '6px 14px' }}>Kết luận: {REVIEW[a.reviewStatus].label}</span>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="muted small">Kết quả</div>
          <div className="stat-value">{a.score ?? '—'}<span className="muted" style={{ fontSize: '1rem' }}> / 10</span></div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {a.status === 'submitted' ? <>Đúng {a.correctCount}/{a.totalQuestions} câu · {SUBMIT_REASONS[a.submitReason]}</> : 'Sinh viên đang làm bài'}
            <br />Bắt đầu {fmtDateTime(a.startedAt)}{a.submittedAt && <> · nộp {fmtDateTime(a.submittedAt)}</>}
          </div>
        </div>
        <div className="card">
          <div className="muted small">Điểm mức độ rủi ro (gợi ý, không phải kết luận)</div>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <div className="stat-value" style={{ color: lv.color }}>{a.riskScore}</div>
            <span className={lv.cls}>{lv.label}</span>
          </div>
          <div className="risk-meter" style={{ marginTop: 10 }}><div style={{ width: `${a.riskScore}%`, background: lv.color }} /></div>
          <div className="small muted" style={{ marginTop: 6 }}>Cảnh báo bị bỏ qua không được tính.</div>
        </div>
        <div className="card">
          <div className="muted small" style={{ marginBottom: 6 }}>Số lần vi phạm</div>
          {Object.keys(counts).length === 0 && <div className="muted">Không có sự kiện nào.</div>}
          {Object.entries(counts).map(([t, n]) => (
            <div className="metric" key={t}><span>{EVENT_LABELS[t] || t}</span><b>{n}</b></div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>Dòng thời gian giám sát</h2>
            <p className="muted small">{events.length} sự kiện · {pending} chưa xử lý. Xác nhận nếu là vi phạm, bỏ qua nếu không đủ căn cứ.</p>
          </div>
          <select className="select" style={{ maxWidth: 260 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tất cả loại sự kiện</option>
            {[...new Set(events.map((e) => e.type))].map((t) => <option key={t} value={t}>{EVENT_LABELS[t] || t}</option>)}
          </select>
        </div>
        {shown.length === 0 ? <p className="muted">Không có sự kiện giám sát.</p> : (
          <div className="timeline">
            {shown.map((e) => (
              <div key={e.id} className={`tl-item${e.status === 'dismissed' ? ' dismissed' : ''}`}>
                <div className="tl-time">{fmtTime(e.startedAt)}<div className="small">{e.source === 'ai' ? 'Camera AI' : e.source === 'browser' ? 'Trình duyệt' : 'Máy chủ'}</div></div>
                <div>
                  <div className="row">
                    <strong>{e.label}</strong>
                    {e.status === 'confirmed' && <span className="badge badge-danger">Đã xác nhận vi phạm</span>}
                    {e.status === 'dismissed' && <span className="badge">Đã bỏ qua</span>}
                    <span className="muted small">+{e.points} điểm rủi ro</span>
                  </div>
                  <div className="muted small" style={{ margin: '4px 0 8px' }}>{describe(e)}</div>
                  {e.hasSnapshot && <Snapshot eventId={e.id} onOpen={setLightbox} />}
                </div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  {e.status !== 'confirmed' && <button className="btn btn-sm btn-danger" onClick={() => setEventStatus(e, 'confirmed')}>Xác nhận</button>}
                  {e.status !== 'dismissed' && <button className="btn btn-sm" onClick={() => setEventStatus(e, 'dismissed')}>Bỏ qua</button>}
                  {e.status !== 'pending' && <button className="btn btn-sm btn-ghost" onClick={() => setEventStatus(e, 'pending')}>Hoàn tác</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 6 }}>Kết luận bài thi</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>Trạng thái cuối cùng do giảng viên quyết định, AI chỉ cung cấp bằng chứng.</p>
        <label className="field"><span>Ghi chú</span><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do kết luận (không bắt buộc)" maxLength={500} /></label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => review('valid')}>Đánh dấu hợp lệ</button>
          <button className="btn btn-danger" onClick={() => review('cheating')}>Đánh dấu có gian lận</button>
          {a.reviewStatus !== 'pending' && <button className="btn btn-ghost" onClick={() => review('pending')}>Chuyển về chưa xét</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row-between">
          <h2>Bài làm chi tiết</h2>
          <button className="btn btn-sm" onClick={() => setShowAnswers((s) => !s)}>{showAnswers ? 'Ẩn' : 'Xem'} {answers.length} câu</button>
        </div>
        {showAnswers && (
          <div className="stack" style={{ marginTop: 14 }}>
            {answers.map((q) => (
              <div key={q.index} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div className="row"><strong>Câu {q.index}.</strong> {q.content}
                  <span className={`badge ${q.chosenOptionId == null ? '' : q.isCorrect ? 'badge-ok' : 'badge-danger'}`}>{q.chosenOptionId == null ? 'Bỏ trống' : q.isCorrect ? 'Đúng' : 'Sai'}</span></div>
                <div className="small" style={{ marginTop: 6 }}>
                  {q.options.map((o, i) => (
                    <div key={o.id} style={{ color: o.isCorrect ? 'var(--ok)' : o.id === q.chosenOptionId ? 'var(--danger)' : undefined, fontWeight: o.isCorrect || o.id === q.chosenOptionId ? 600 : 400 }}>
                      {LETTERS[i]}. {o.content} {o.id === q.chosenOptionId && '← sinh viên chọn'}{o.isCorrect && ' ✓'}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="Ảnh bằng chứng phóng to" /></div>}
    </>
  );
}
