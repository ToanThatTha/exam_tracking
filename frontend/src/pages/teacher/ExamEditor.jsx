// GV03. Tạo và quản lý đề thi
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Loading, useToast } from '../../components/ui';
import { LETTERS } from '../../utils/format';

export default function ExamEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', subject: '', durationMinutes: 30, shuffleQuestions: true, shuffleOptions: true });
  const [selected, setSelected] = useState([]); // id theo thứ tự trong đề
  const [bank, setBank] = useState(null);
  const [meta, setMeta] = useState([]);
  const [filter, setFilter] = useState({ subject: '', chapter: '', q: '' });
  const [random, setRandom] = useState({ count: 10 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [b, m] = await Promise.all([api.get('/teacher/questions'), api.get('/teacher/questions/meta')]);
        setBank(b.data);
        setMeta(m.data);
        if (id) {
          const e = (await api.get(`/teacher/exams/${id}`)).data;
          setForm({ title: e.title, subject: e.subject, durationMinutes: e.durationMinutes, shuffleQuestions: e.shuffleQuestions, shuffleOptions: e.shuffleOptions });
          setSelected(e.questionIds);
          setFilter((f) => ({ ...f, subject: e.subject && m.data.some((x) => x.name === e.subject) ? e.subject : '' }));
          setLocked(e.roomCount > 0);
        }
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  }, [id]);

  const byId = useMemo(() => new Map((bank || []).map((q) => [q.id, q])), [bank]);
  const visible = useMemo(() => (bank || []).filter((q) =>
    (!filter.subject || q.subject === filter.subject) &&
    (!filter.chapter || q.chapter === filter.chapter) &&
    (!filter.q || q.content.toLowerCase().includes(filter.q.toLowerCase()))), [bank, filter]);
  const selSet = new Set(selected);

  const toggle = (qid) => setSelected((s) => (s.includes(qid) ? s.filter((x) => x !== qid) : [...s, qid]));
  const move = (i, d) => setSelected((s) => {
    const a = [...s];
    const j = i + d;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  });

  async function pickRandom() {
    try {
      const r = await api.get('/teacher/questions/random', { params: { count: random.count, subject: filter.subject, chapter: filter.chapter, exclude: selected.join(',') } });
      if (!r.data.ids.length) return toast('Không còn câu hỏi phù hợp để lấy thêm', 'warn');
      setSelected((s) => [...s, ...r.data.ids]);
      toast(`Đã thêm ngẫu nhiên ${r.data.ids.length} câu`, 'ok');
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }

  async function save() {
    setError('');
    setBusy(true);
    try {
      const body = { ...form, durationMinutes: Number(form.durationMinutes), questionIds: selected };
      if (id) await api.put(`/teacher/exams/${id}`, body);
      else await api.post('/teacher/exams', body);
      toast('Đã lưu đề thi', 'ok');
      nav('/teacher/exams');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!bank) return error ? <div className="alert alert-danger">{error}</div> : <Loading />;
  const chapters = meta.find((m) => m.name === filter.subject)?.chapters || [];
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/teacher/exams" className="small">← Danh sách đề thi</Link>
          <h1>{id ? 'Sửa đề thi' : 'Tạo đề thi'}</h1>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Lưu đề thi ({selected.length} câu)</button>
      </div>
      {locked && <div className="alert alert-info" style={{ marginBottom: 16 }}>Đề này đang gắn với phòng thi. Nếu đã có sinh viên làm bài, hệ thống sẽ không cho sửa để giữ đúng kết quả cũ.</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card">
        <div className="form-grid">
          <label className="field"><span>Tên đề thi</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ví dụ: Kiểm tra giữa kỳ" /></label>
          <label className="field"><span>Môn học</span><input className="input" list="exam-subjects" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <datalist id="exam-subjects">{meta.map((m) => <option key={m.name} value={m.name} />)}</datalist></label>
          <label className="field"><span>Thời gian làm bài (phút)</span><input className="input" type="number" min="1" max="600" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></label>
          <div className="field">
            <span>Trộn đề</span>
            <label className="check"><input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} /> Trộn thứ tự câu hỏi cho từng sinh viên</label>
            <label className="check"><input type="checkbox" checked={form.shuffleOptions} onChange={(e) => setForm({ ...form, shuffleOptions: e.target.checked })} /> Trộn thứ tự phương án trả lời</label>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h2>Ngân hàng câu hỏi</h2><span className="muted small">{visible.length} câu</span></div>
          <div className="row" style={{ marginBottom: 12 }}>
            <select className="select" style={{ flex: 1 }} value={filter.subject} onChange={(e) => setFilter({ ...filter, subject: e.target.value, chapter: '' })}>
              <option value="">Tất cả môn</option>
              {meta.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <select className="select" style={{ flex: 1 }} value={filter.chapter} onChange={(e) => setFilter({ ...filter, chapter: e.target.value })} disabled={!filter.subject}>
              <option value="">Tất cả chương</option>
              {chapters.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <input className="input" placeholder="Tìm câu hỏi" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <div className="row" style={{ margin: '12px 0', padding: 10, background: '#f6f8f7', borderRadius: 6 }}>
            <span className="small">Lấy ngẫu nhiên</span>
            <input className="input" type="number" min="1" max="200" style={{ width: 80 }} value={random.count} onChange={(e) => setRandom({ count: e.target.value })} />
            <span className="small">câu theo bộ lọc</span>
            <button className="btn btn-sm" onClick={pickRandom}>Thêm vào đề</button>
          </div>
          <div style={{ maxHeight: 460, overflow: 'auto' }}>
            {visible.map((q) => (
              <label key={q.id} className="check" style={{ padding: '8px 4px', borderBottom: '1px solid var(--line)' }}>
                <input type="checkbox" checked={selSet.has(q.id)} onChange={() => toggle(q.id)} />
                <span>
                  {q.content}
                  <span className="muted small" style={{ display: 'block' }}>{q.subject} · {q.chapter}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Câu hỏi trong đề</h2>
            {selected.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>Bỏ hết</button>}
          </div>
          {selected.length === 0 ? <p className="muted">Chọn câu hỏi bên trái hoặc lấy ngẫu nhiên.</p> : (
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {selected.map((qid, i) => {
                const q = byId.get(qid);
                return (
                  <li key={qid} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <strong className="mono" style={{ width: 26 }}>{i + 1}.</strong>
                    <div style={{ flex: 1 }}>
                      {q?.content || `Câu hỏi #${qid}`}
                      {q && <div className="muted small">Đáp án: {LETTERS[q.options.findIndex((o) => o.isCorrect)]}</div>}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} aria-label="Lên">↑</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} aria-label="Xuống">↓</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(qid)} aria-label="Bỏ khỏi đề">✕</button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
