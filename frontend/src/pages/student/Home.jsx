// SV02. Xem bài thi được giao và vào thi
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Empty, Loading } from '../../components/ui';
import { fmtDateTime, ROOM_STATUS } from '../../utils/format';

export default function StudentHome() {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api.get('/student/rooms').then((r) => setRooms(r.data)).catch((e) => setError(errMsg(e)));
    load();
    const t = setInterval(load, 30000); // bài thi đến giờ mở thì nút "Vào thi" tự hiện
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!rooms) return <Loading />;

  // Bài đang mở lên đầu, rồi sắp mở, cuối cùng là đã đóng / đã nộp
  const rank = (r) => (r.attempt?.status === 'in_progress' ? 0 : r.attempt ? 3 : r.status === 'open' ? 1 : r.status === 'upcoming' ? 2 : 4);
  const sorted = [...rooms].sort((a, b) => rank(a) - rank(b));

  return (
    <>
      <div className="page-head">
        <div><h1>Bài thi của bạn</h1><p>Các bài thi giảng viên đã giao cho bạn hoặc cho lớp của bạn.</p></div>
      </div>
      {sorted.length === 0 ? (
        <div className="card"><Empty>Bạn chưa được giao bài thi nào.</Empty></div>
      ) : (
        <div className="grid grid-2">
          {sorted.map((r) => {
            const st = ROOM_STATUS[r.status];
            const done = r.attempt?.status === 'submitted';
            const doing = r.attempt?.status === 'in_progress';
            return (
              <div className="card" key={r.id}>
                <div className="row-between">
                  <h3>{r.examTitle}</h3>
                  {done ? <span className="badge badge-ok">Đã nộp</span> : doing ? <span className="badge badge-primary badge-dot">Đang làm</span> : <span className={st.cls}>{st.label}</span>}
                </div>
                <p className="muted small" style={{ marginTop: 4 }}>{r.name}{r.subject ? ` · ${r.subject}` : ''}</p>
                <div className="small" style={{ margin: '12px 0' }}>
                  <div className="metric"><span>Số câu / thời gian</span><b>{r.questionCount} câu · {r.durationMinutes} phút</b></div>
                  <div className="metric"><span>Mở lúc</span><b>{fmtDateTime(r.openAt)}</b></div>
                  <div className="metric"><span>Đóng lúc</span><b>{fmtDateTime(r.closeAt)}</b></div>
                  <div className="metric"><span>Giám sát</span><b>{[r.requireCamera && 'Camera AI', r.requireFullscreen && 'Toàn màn hình'].filter(Boolean).join(' · ') || 'Không'}</b></div>
                </div>
                {done && <Link className="btn" to={`/student/attempts/${r.attempt.id}/result`}>Xem kết quả{r.attempt.score != null ? ` · ${r.attempt.score} điểm` : ''}</Link>}
                {doing && <Link className="btn btn-primary" to={`/student/rooms/${r.id}/prepare`}>Tiếp tục làm bài</Link>}
                {!r.attempt && r.status === 'open' && <Link className="btn btn-primary" to={`/student/rooms/${r.id}/prepare`}>Vào thi</Link>}
                {!r.attempt && r.status === 'upcoming' && <span className="muted small">Chưa đến giờ thi.</span>}
                {!r.attempt && r.status === 'closed' && <span className="muted small">Bài thi đã đóng, bạn chưa làm bài.</span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
