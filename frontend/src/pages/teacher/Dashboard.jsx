import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Loading, Stat, Empty } from '../../components/ui';
import { fmtDateTime, RISK, riskLevel } from '../../utils/format';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/teacher/dashboard').then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <Loading />;
  const c = data.counts;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tổng quan</h1>
          <p>Các bài thi có điểm rủi ro cao đang chờ bạn xem xét.</p>
        </div>
        <div className="row">
          <Link className="btn" to="/teacher/exams/new">Tạo đề thi</Link>
          <Link className="btn btn-primary" to="/teacher/rooms/new">Tạo phòng thi</Link>
        </div>
      </div>
      <div className="grid grid-4">
        <Stat value={c.questions} label="Câu hỏi trong ngân hàng" />
        <Stat value={c.exams} label="Đề thi" />
        <Stat value={`${c.openRooms}/${c.rooms}`} label="Phòng thi đang mở" />
        <Stat value={c.toReview} label="Bài thi cần xem xét" tone={c.toReview ? 'var(--danger)' : undefined} />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Cần xem xét</h2><span className="muted small">Điểm rủi ro từ 20 trở lên, chưa kết luận</span></div>
        {data.toReview.length === 0 ? (
          <Empty>Chưa có bài thi nào cần xem xét.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Sinh viên</th><th>Phòng thi</th><th>Nộp lúc</th><th className="num">Điểm</th><th>Rủi ro</th><th /></tr></thead>
              <tbody>
                {data.toReview.map((r) => {
                  const lv = RISK[riskLevel(r.riskScore)];
                  return (
                    <tr key={r.attemptId}>
                      <td><strong>{r.fullName}</strong><div className="muted small">{r.studentCode}</div></td>
                      <td>{r.roomName}</td>
                      <td>{r.status === 'submitted' ? fmtDateTime(r.submittedAt) : <span className="badge badge-primary">Đang thi</span>}</td>
                      <td className="num">{r.score ?? '—'}</td>
                      <td><span className={lv.cls}>{r.riskScore} · {lv.label}</span></td>
                      <td><Link className="btn btn-sm" to={`/teacher/attempts/${r.attemptId}`}>Xem báo cáo</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
