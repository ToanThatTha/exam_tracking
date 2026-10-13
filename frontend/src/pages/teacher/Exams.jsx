import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Empty, Loading, useToast } from '../../components/ui';
import { fmtDateTime } from '../../utils/format';

export default function Exams() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.get('/teacher/exams').then((r) => setList(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  async function remove(e) {
    if (!window.confirm(`Xóa đề "${e.title}"?`)) return;
    try {
      await api.delete(`/teacher/exams/${e.id}`);
      toast('Đã xóa đề thi', 'ok');
      load();
    } catch (err) {
      toast(errMsg(err), 'danger');
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Đề thi</h1><p>Mỗi đề có thể dùng cho nhiều phòng thi.</p></div>
        <Link className="btn btn-primary" to="/teacher/exams/new">Tạo đề thi</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!list ? <Loading /> : list.length === 0 ? (
        <div className="card"><Empty>Chưa có đề thi. Tạo đề đầu tiên từ ngân hàng câu hỏi.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tên đề</th><th>Môn</th><th className="num">Số câu</th><th className="num">Thời gian</th><th>Trộn</th><th>Phòng thi</th><th>Tạo lúc</th><th /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/teacher/exams/${e.id}`}><strong>{e.title}</strong></Link></td>
                  <td>{e.subject || '—'}</td>
                  <td className="num">{e.questionCount}</td>
                  <td className="num">{e.durationMinutes} phút</td>
                  <td className="small">{[e.shuffleQuestions && 'câu hỏi', e.shuffleOptions && 'phương án'].filter(Boolean).join(', ') || 'không'}</td>
                  <td>{e.roomCount ? `${e.roomCount} phòng` : '—'}</td>
                  <td className="small muted">{fmtDateTime(e.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="btn btn-sm" to={`/teacher/exams/${e.id}`}>Sửa</Link>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => remove(e)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
