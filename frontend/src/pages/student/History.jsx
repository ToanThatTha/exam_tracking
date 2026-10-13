import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Empty, Loading } from '../../components/ui';
import { fmtDateTime, SUBMIT_REASONS } from '../../utils/format';

export default function History() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/student/results').then((r) => setList(r.data)).catch((e) => setError(errMsg(e))); }, []);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!list) return <Loading />;
  return (
    <>
      <div className="page-head"><div><h1>Kết quả của tôi</h1></div></div>
      {list.length === 0 ? <div className="card"><Empty>Bạn chưa làm bài thi nào.</Empty></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Bài thi</th><th>Nộp lúc</th><th>Hình thức nộp</th><th className="num">Đúng</th><th className="num">Điểm</th><th /></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.examTitle}</strong><div className="muted small">{r.roomName}</div></td>
                  <td>{r.status === 'submitted' ? fmtDateTime(r.submittedAt) : <span className="badge badge-primary">Đang làm</span>}</td>
                  <td className="small">{SUBMIT_REASONS[r.submitReason] || '—'}</td>
                  <td className="num">{r.status === 'submitted' ? `${r.correctCount}/${r.totalQuestions}` : '—'}</td>
                  <td className="num"><strong>{r.score ?? '—'}</strong></td>
                  <td>{r.status === 'submitted' && <Link className="btn btn-sm" to={`/student/attempts/${r.id}/result`}>Chi tiết</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
