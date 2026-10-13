import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Empty, Loading, useToast } from '../../components/ui';
import { fmtDateTime, ROOM_STATUS } from '../../utils/format';

export default function Rooms() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.get('/teacher/rooms').then((r) => setList(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  async function remove(r) {
    if (!window.confirm(`Xóa phòng "${r.name}"? Toàn bộ bài làm và nhật ký giám sát của phòng cũng bị xóa.`)) return;
    try {
      await api.delete(`/teacher/rooms/${r.id}`);
      toast('Đã xóa phòng thi', 'ok');
      load();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Phòng thi &amp; kết quả</h1><p>Mỗi phòng thi gắn một đề với các lớp / sinh viên được giao. Sinh viên thấy bài trong danh sách và vào thi khi đến giờ mở.</p></div>
        <Link className="btn btn-primary" to="/teacher/rooms/new">Tạo phòng thi</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!list ? <Loading /> : list.length === 0 ? (
        <div className="card"><Empty>Chưa có phòng thi.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Phòng thi</th><th>Thời gian</th><th>Giám sát</th><th className="num">Đã nộp</th><th className="num">Rủi ro cao</th><th /></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/teacher/rooms/${r.id}`}><strong>{r.name}</strong></Link>
                    <div className="muted small">{r.examTitle} · {r.allowedClasses ? `Lớp ${r.allowedClasses}` : 'Danh sách sinh viên riêng'}</div>
                  </td>
                  <td className="small">
                    <span className={ROOM_STATUS[r.status].cls}>{ROOM_STATUS[r.status].label}</span>
                    <div className="muted">{fmtDateTime(r.openAt)}<br />→ {fmtDateTime(r.closeAt)}</div>
                  </td>
                  <td className="small">
                    {r.requireCamera ? 'Camera AI' : 'Không camera'}<br />
                    {r.requireFullscreen ? 'Toàn màn hình' : '—'}<br />
                    {r.maxTabViolations ? `Thoát tab tối đa ${r.maxTabViolations}` : 'Không giới hạn tab'}
                  </td>
                  <td className="num">{r.submittedCount}/{r.attemptCount}</td>
                  <td className="num">{r.flaggedCount ? <span className="badge badge-danger">{r.flaggedCount}</span> : 0}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="btn btn-sm btn-primary" to={`/teacher/rooms/${r.id}`}>Kết quả</Link>{' '}
                    <Link className="btn btn-sm" to={`/teacher/rooms/${r.id}/edit`}>Sửa</Link>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>Xóa</button>
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
