// GV04. Tạo và quản lý phòng thi, GV05. Cấu hình giám sát
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Loading, useToast } from '../../components/ui';
import { toLocalInput } from '../../utils/format';

export default function RoomEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [exams, setExams] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentQ, setStudentQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return {
      name: '', examId: '',
      openAt: toLocalInput(now), closeAt: toLocalInput(new Date(now.getTime() + 2 * 3600 * 1000)),
      allowedClasses: [], studentIds: [],
      requireCamera: true, requireFullscreen: true, maxTabViolations: 3, violationAction: 'auto_submit', showAnswers: false,
    };
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [e, c, s] = await Promise.all([api.get('/teacher/exams'), api.get('/teacher/students/classes'), api.get('/teacher/students')]);
        setExams(e.data);
        setClasses(c.data);
        setStudents(s.data);
        if (id) {
          const r = (await api.get(`/teacher/rooms/${id}`)).data;
          setForm({
            name: r.name, examId: r.examId,
            openAt: toLocalInput(r.openAt), closeAt: toLocalInput(r.closeAt),
            allowedClasses: r.allowedClasses ? r.allowedClasses.split(',') : [], studentIds: r.studentIds,
            requireCamera: r.requireCamera, requireFullscreen: r.requireFullscreen, maxTabViolations: r.maxTabViolations,
            violationAction: r.violationAction, showAnswers: r.showAnswers,
          });
        } else if (e.data[0]) {
          setForm((f) => ({ ...f, examId: e.data[0].id }));
        }
      } catch (err) {
        setError(errMsg(err));
      }
    })();
  }, [id]);

  const filteredStudents = useMemo(() => {
    const q = studentQ.toLowerCase();
    return students.filter((s) => !q || `${s.fullName} ${s.studentCode} ${s.className}`.toLowerCase().includes(q)).slice(0, 50);
  }, [students, studentQ]);

  const toggleIn = (k, v) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);

  async function save() {
    setError('');
    setBusy(true);
    try {
      const body = {
        ...form,
        examId: Number(form.examId),
        maxTabViolations: Number(form.maxTabViolations),
        openAt: new Date(form.openAt).toISOString(),
        closeAt: new Date(form.closeAt).toISOString(),
        allowedClasses: form.allowedClasses.join(','),
      };
      if (id) await api.put(`/teacher/rooms/${id}`, body);
      else {
        const r = await api.post('/teacher/rooms', body);
        toast('Đã tạo phòng thi', 'ok');
        return nav(`/teacher/rooms/${r.data.id}`);
      }
      toast('Đã lưu phòng thi', 'ok');
      nav(`/teacher/rooms/${id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!exams) return error ? <div className="alert alert-danger">{error}</div> : <Loading />;
  const exam = exams.find((e) => e.id === Number(form.examId));
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/teacher/rooms" className="small">← Danh sách phòng thi</Link>
          <h1>{id ? 'Sửa phòng thi' : 'Tạo phòng thi'}</h1>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Lưu phòng thi</button>
      </div>
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
      {exams.length === 0 && <div className="alert alert-warn" style={{ marginBottom: 16 }}>Bạn cần <Link to="/teacher/exams/new">tạo đề thi</Link> trước.</div>}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Thông tin phòng</h2>
          <div className="form-grid">
            <label className="field full"><span>Tên phòng thi</span><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ví dụ: Giữa kỳ CSDL - lớp 22IT1" /></label>
            <label className="field full">
              <span>Đề thi</span>
              <select className="select" value={form.examId} onChange={(e) => set('examId', e.target.value)}>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.questionCount} câu, {e.durationMinutes} phút)</option>)}
              </select>
            </label>
            <label className="field"><span>Mở phòng lúc</span><input className="input" type="datetime-local" value={form.openAt} onChange={(e) => set('openAt', e.target.value)} /></label>
            <label className="field"><span>Đóng phòng lúc</span><input className="input" type="datetime-local" value={form.closeAt} onChange={(e) => set('closeAt', e.target.value)} /></label>
            {exam && <div className="full muted small">Mỗi sinh viên có {exam.durationMinutes} phút kể từ lúc bắt đầu, nhưng bài luôn được chốt muộn nhất lúc đóng phòng.</div>}
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Cấu hình giám sát</h2>
          <p className="muted small" style={{ marginBottom: 14 }}>Sinh viên được thông báo các quy tắc này trước khi bắt đầu.</p>
          <div className="stack">
            <label className="check"><input type="checkbox" checked={form.requireCamera} onChange={(e) => set('requireCamera', e.target.checked)} />
              <span><b>Bật camera AI</b><br /><span className="muted small">Phát hiện không có mặt, nhiều người, quay/cúi đầu, điện thoại; chụp ảnh bằng chứng.</span></span></label>
            <label className="check"><input type="checkbox" checked={form.requireFullscreen} onChange={(e) => set('requireFullscreen', e.target.checked)} />
              <span><b>Bắt buộc toàn màn hình</b><br /><span className="muted small">Thoát toàn màn hình sẽ che đề và ghi nhận vi phạm.</span></span></label>
            <label className="field">
              <span>Giới hạn số lần thoát tab <span className="hint">— 0 là không giới hạn</span></span>
              <input className="input" type="number" min="0" max="100" value={form.maxTabViolations} onChange={(e) => set('maxTabViolations', e.target.value)} style={{ maxWidth: 140 }} />
            </label>
            <label className="field">
              <span>Khi vượt giới hạn</span>
              <select className="select" value={form.violationAction} onChange={(e) => set('violationAction', e.target.value)}>
                <option value="auto_submit">Khóa bài: tự động nộp bài</option>
                <option value="warn">Chỉ cảnh báo và ghi nhận</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={form.showAnswers} onChange={(e) => set('showAnswers', e.target.checked)} />
              <span><b>Công khai đáp án</b><br /><span className="muted small">Sinh viên xem được đáp án đúng sau khi nộp.</span></span></label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 6 }}>Giao bài cho sinh viên</h2>
        <p className="muted small" style={{ marginBottom: 14 }}>Chọn cả lớp và/hoặc thêm từng sinh viên. Sinh viên được giao sẽ thấy bài trong danh sách và bấm vào thi khi đến giờ mở.</p>
        <div className="row" style={{ marginBottom: 16 }}>
          {classes.length === 0 && <span className="muted small">Chưa có sinh viên nào trong hệ thống.</span>}
          {classes.map((c) => (
            <label key={c.name} className="check" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
              <input type="checkbox" checked={form.allowedClasses.includes(c.name)} onChange={() => toggleIn('allowedClasses', c.name)} />
              Lớp {c.name} <span className="muted">({c.total})</span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Tìm sinh viên để thêm riêng" value={studentQ} onChange={(e) => setStudentQ(e.target.value)} />
          <span className="muted small">Đã chọn riêng {form.studentIds.length} sinh viên</span>
        </div>
        <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
          {filteredStudents.map((s) => {
            const viaClass = form.allowedClasses.includes(s.className);
            return (
              <label key={s.id} className="check" style={{ padding: '7px 10px', borderBottom: '1px solid var(--line)' }}>
                <input type="checkbox" checked={viaClass || form.studentIds.includes(s.id)} disabled={viaClass} onChange={() => toggleIn('studentIds', s.id)} />
                <span>{s.fullName} <span className="muted small">· {s.studentCode} · {s.className}{viaClass ? ' (theo lớp)' : ''}</span></span>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
