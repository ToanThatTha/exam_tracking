// Quản lý tài khoản sinh viên (Họ tên, Mã SV, Lớp — SV01)
import { useCallback, useEffect, useState } from 'react';
import api, { downloadFile, errMsg } from '../../api';
import { Empty, Loading, Modal, useToast } from '../../components/ui';

function StudentForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial
    ? { fullName: initial.fullName, studentCode: initial.studentCode, className: initial.className, username: initial.username, password: '' }
    : { fullName: '', studentCode: '', className: '', username: '', password: '123456' });
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() {
    setError('');
    try {
      if (initial) await api.put(`/teacher/students/${initial.id}`, form);
      else await api.post('/teacher/students', form);
      toast('Đã lưu sinh viên', 'ok');
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <Modal title={initial ? 'Sửa sinh viên' : 'Thêm sinh viên'} onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={save}>Lưu</button></>}>
      <div className="form-grid">
        <label className="field full"><span>Họ và tên</span><input className="input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></label>
        <label className="field"><span>Mã sinh viên</span><input className="input" value={form.studentCode} onChange={(e) => set('studentCode', e.target.value)} /></label>
        <label className="field"><span>Lớp</span><input className="input" value={form.className} onChange={(e) => set('className', e.target.value)} /></label>
        <label className="field"><span>Tên đăng nhập <span className="hint">— trống = mã SV</span></span><input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} /></label>
        <label className="field"><span>{initial ? 'Mật khẩu mới (bỏ trống nếu giữ)' : 'Mật khẩu'}</span><input className="input" value={form.password} onChange={(e) => set('password', e.target.value)} /></label>
      </div>
      {error && <div className="alert alert-danger" style={{ marginTop: 14 }}>{error}</div>}
    </Modal>
  );
}

function ImportStudents({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  async function upload() {
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/teacher/students/import', fd);
      setResult(r.data);
      onDone();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <Modal title="Nhập sinh viên từ Excel" onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={!file} onClick={upload}>Nhập</button></>}>
      <div className="stack">
        <p>Cột: <b>Họ và tên, Mã sinh viên, Lớp, Tên đăng nhập, Mật khẩu</b>. Bỏ trống tên đăng nhập thì dùng mã SV, bỏ trống mật khẩu thì là 123456.</p>
        <div><button className="btn btn-sm" onClick={() => downloadFile('/teacher/students/template', 'mau-nhap-sinh-vien.xlsx')}>Tải file mẫu</button></div>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files[0] || null)} />
        {error && <div className="alert alert-danger">{error}</div>}
        {result && (
          <div className={`alert ${result.errors.length ? 'alert-warn' : 'alert-ok'}`}>
            Đã nhập {result.imported} sinh viên.
            {result.errors.map((e) => <div key={e.row}>Dòng {e.row}: {e.message}</div>)}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Students() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [filter, setFilter] = useState({ className: '', q: '' });
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.get('/teacher/students', { params: filter }), api.get('/teacher/students/classes')]);
      setList(s.data);
      setClasses(c.data);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }, [filter, toast]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function remove(s) {
    if (!window.confirm(`Xóa tài khoản ${s.fullName}?`)) return;
    try {
      await api.delete(`/teacher/students/${s.id}`);
      toast('Đã xóa sinh viên', 'ok');
      load();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Sinh viên</h1><p>Tài khoản đăng nhập gồm họ tên, mã sinh viên và lớp.</p></div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>Nhập từ Excel</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>Thêm sinh viên</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <select className="select" style={{ maxWidth: 200 }} value={filter.className} onChange={(e) => setFilter({ ...filter, className: e.target.value })}>
            <option value="">Tất cả lớp</option>
            {classes.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.total})</option>)}
          </select>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Tìm theo tên, mã SV" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        </div>
      </div>
      {!list ? <Loading /> : list.length === 0 ? <div className="card"><Empty>Không có sinh viên.</Empty></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Họ và tên</th><th>Mã sinh viên</th><th>Lớp</th><th>Tên đăng nhập</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.fullName}</strong></td><td>{s.studentCode}</td><td>{s.className}</td><td className="muted">{s.username}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => setEditing(s)}>Sửa</button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <StudentForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {importing && <ImportStudents onClose={() => setImporting(false)} onDone={load} />}
    </>
  );
}
