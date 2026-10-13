// GV02. Quản lý ngân hàng câu hỏi
import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errMsg, downloadFile } from '../../api';
import { Bubble, Empty, Loading, Modal, useToast } from '../../components/ui';
import { LETTERS } from '../../utils/format';

const blankOptions = () => [0, 1, 2, 3].map((i) => ({ content: '', isCorrect: i === 0 }));

function QuestionForm({ initial, meta, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => initial
    ? { subject: initial.subject, chapter: initial.chapter, content: initial.content, options: initial.options.map((o) => ({ content: o.content, isCorrect: o.isCorrect })) }
    : { subject: meta[0]?.name || '', chapter: '', content: '', options: blankOptions() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setOpt = (i, patch) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? { ...o, ...patch } : patch.isCorrect ? { ...o, isCorrect: false } : o)) }));

  async function save() {
    setError('');
    setBusy(true);
    try {
      if (initial) await api.put(`/teacher/questions/${initial.id}`, form);
      else await api.post('/teacher/questions', form);
      toast(initial ? 'Đã lưu câu hỏi' : 'Đã thêm câu hỏi', 'ok');
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const chapters = meta.find((m) => m.name === form.subject)?.chapters || [];
  return (
    <Modal
      title={initial ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={save} disabled={busy}>Lưu câu hỏi</button></>}
    >
      <div className="form-grid">
        <label className="field">
          <span>Môn học</span>
          <input className="input" list="subjects" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
          <datalist id="subjects">{meta.map((m) => <option key={m.name} value={m.name} />)}</datalist>
        </label>
        <label className="field">
          <span>Chương</span>
          <input className="input" list="chapters" value={form.chapter} onChange={(e) => set('chapter', e.target.value)} placeholder="Ví dụ: Chương 1" />
          <datalist id="chapters">{chapters.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        </label>
        <label className="field full">
          <span>Nội dung câu hỏi</span>
          <textarea className="textarea" value={form.content} onChange={(e) => set('content', e.target.value)} />
        </label>
        <div className="field full">
          <span>Phương án trả lời <span className="hint">— bấm vào ô tròn để chọn đáp án đúng</span></span>
          {form.options.map((o, i) => (
            <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 2, color: o.isCorrect ? 'var(--ok)' : 'var(--muted)' }}
                onClick={() => setOpt(i, { isCorrect: true })} aria-label={`Chọn ${LETTERS[i]} là đáp án đúng`}>
                <Bubble index={i} filled={o.isCorrect} />
              </button>
              <input className="input" value={o.content} onChange={(e) => setOpt(i, { content: e.target.value })} placeholder={`Phương án ${LETTERS[i]}`} />
              {form.options.length > 2 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('options', form.options.filter((_, j) => j !== i).map((x, j, arr) => (arr.some((y) => y.isCorrect) ? x : { ...x, isCorrect: j === 0 })))} aria-label="Xóa phương án">✕</button>
              )}
            </div>
          ))}
          {form.options.length < 6 && (
            <div><button type="button" className="btn btn-sm" onClick={() => set('options', [...form.options, { content: '', isCorrect: false }])}>Thêm phương án</button></div>
          )}
        </div>
      </div>
      {error && <div className="alert alert-danger" style={{ marginTop: 14 }}>{error}</div>}
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/teacher/questions/import', fd);
      setResult(r.data);
      if (r.data.imported) onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Nhập câu hỏi từ Excel" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={!file || busy} onClick={upload}>{busy ? 'Đang nhập...' : 'Nhập câu hỏi'}</button></>}>
      <div className="stack">
        <p>File .xlsx gồm các cột: <b>Môn học, Chương, Nội dung câu hỏi, Đáp án đúng (A–F), Phương án A … F</b>. Dòng đầu là tiêu đề.</p>
        <div><button className="btn btn-sm" onClick={() => downloadFile('/teacher/questions/template', 'mau-nhap-cau-hoi.xlsx')}>Tải file mẫu</button></div>
        <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files[0] || null); setResult(null); }} />
        {error && <div className="alert alert-danger">{error}</div>}
        {result && (
          <div className={`alert ${result.errors.length ? 'alert-warn' : 'alert-ok'}`}>
            Đã nhập {result.imported} câu hỏi.
            {result.errors.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {result.errors.slice(0, 20).map((e) => <li key={e.row}>Dòng {e.row}: {e.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Questions() {
  const toast = useToast();
  const [meta, setMeta] = useState([]);
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState({ subject: '', chapter: '', q: '' });
  const [editing, setEditing] = useState(null); // null | 'new' | question
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef();

  const load = useCallback(async (f) => {
    try {
      const [m, l] = await Promise.all([
        api.get('/teacher/questions/meta'),
        api.get('/teacher/questions', { params: f }),
      ]);
      setMeta(m.data);
      setList(l.data);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(filter), 250);
  }, [filter, load]);

  async function remove(q) {
    if (!window.confirm('Xóa câu hỏi này?')) return;
    try {
      await api.delete(`/teacher/questions/${q.id}`);
      toast('Đã xóa câu hỏi', 'ok');
      load(filter);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }

  const chapters = meta.find((m) => m.name === filter.subject)?.chapters || [];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ngân hàng câu hỏi</h1>
          <p>{meta.reduce((s, m) => s + m.total, 0)} câu hỏi · {meta.length} môn học</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>Nhập từ Excel</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>Thêm câu hỏi</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <select className="select" style={{ maxWidth: 220 }} value={filter.subject} onChange={(e) => setFilter({ ...filter, subject: e.target.value, chapter: '' })}>
            <option value="">Tất cả môn học</option>
            {meta.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.total})</option>)}
          </select>
          <select className="select" style={{ maxWidth: 200 }} value={filter.chapter} onChange={(e) => setFilter({ ...filter, chapter: e.target.value })} disabled={!filter.subject}>
            <option value="">Tất cả chương</option>
            {chapters.map((c) => <option key={c.name} value={c.name}>{c.name || '(không chương)'} ({c.total})</option>)}
          </select>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Tìm theo nội dung câu hỏi" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!list ? <Loading /> : list.length === 0 ? (
        <div className="card"><Empty>Chưa có câu hỏi phù hợp. Thêm câu hỏi mới hoặc nhập từ Excel.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ width: '48%' }}>Câu hỏi</th><th>Môn / chương</th><th>Đáp án đúng</th><th>Dùng trong đề</th><th /></tr></thead>
            <tbody>
              {list.map((q) => {
                const ci = q.options.findIndex((o) => o.isCorrect);
                return (
                  <tr key={q.id}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{q.content}</div>
                      <div className="muted small">{q.options.map((o, i) => `${LETTERS[i]}. ${o.content}`).join('   ')}</div>
                    </td>
                    <td>{q.subject}<div className="muted small">{q.chapter}</div></td>
                    <td><span className="badge badge-ok">{LETTERS[ci]}</span></td>
                    <td>{q.usedInExams ? `${q.usedInExams} đề` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => setEditing(q)}>Sửa</button>{' '}
                      <button className="btn btn-sm btn-danger" onClick={() => remove(q)}>Xóa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <QuestionForm initial={editing === 'new' ? null : editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(filter); }} />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => load(filter)} />}
    </>
  );
}
