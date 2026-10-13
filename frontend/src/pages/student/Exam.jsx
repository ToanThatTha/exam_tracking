// SV04 Làm bài · SV05 Cảnh báo khi thi · SV06 Nộp bài — gắn với giám sát trình duyệt và AI camera
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Bubble, Loading, Modal, useToast } from '../../components/ui';
import { session, getEngine, closeSession } from '../../ai/cameraSession';
import { BrowserMonitor, enterFullscreen } from '../../ai/browserMonitor';
import { EventQueue } from '../../ai/eventQueue';
import { EVENT_LABELS, fmtClock, SUBMIT_REASONS } from '../../utils/format';

const AI_WARNINGS = {
  PHONE: 'Phát hiện điện thoại trong khung hình. Hãy cất điện thoại đi.',
  MULTI_FACE: 'Phát hiện nhiều khuôn mặt trong khung hình.',
  MULTI_PERSON: 'Phát hiện nhiều người trong khung hình.',
  NO_FACE: 'Không thấy khuôn mặt của bạn. Hãy ngồi trước camera.',
  HEAD_TURN: 'Bạn đang quay đầu khỏi màn hình.',
  HEAD_DOWN: 'Bạn đang cúi đầu quá lâu.',
  CAMERA_OFF: 'Mất tín hiệu camera. Kiểm tra lại camera.',
  LOOK_AWAY_REPEATED: 'Bạn quay hoặc cúi đầu nhiều lần. Hành vi đã được ghi nhận.',
};

function backupKey(id) { return `exam_backup_${id}`; }
function readBackup(id) {
  try { return JSON.parse(localStorage.getItem(backupKey(id)) || '{}'); } catch { return {}; }
}
function writeBackup(id, data) {
  try { localStorage.setItem(backupKey(id), JSON.stringify(data)); } catch { /* bỏ qua */ }
}

export default function ExamPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({}); // questionId → { optionId, flagged }
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState('saved');
  const [now, setNow] = useState(Date.now());
  const [shield, setShield] = useState({ away: false, fsOut: false });
  const [viol, setViol] = useState({ tab: 0, fs: 0 });
  const [aiStatus, setAiStatus] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finished, setFinished] = useState(null); // { reason }
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef({});
  const dirty = useRef(new Set());
  const saveTimer = useRef(null);
  const offset = useRef(0);
  const queue = useRef(null);
  const monitor = useRef(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const doneRef = useRef(false);

  // ---------------- dừng mọi giám sát
  const teardown = useCallback(() => {
    monitor.current?.stop();
    queue.current?.stop();
    session.engine?.stop();
    clearTimeout(saveTimer.current);
  }, []);

  const finish = useCallback(async (reason) => {
    if (doneRef.current) return;
    doneRef.current = true;
    teardown();
    await queue.current?.drain(2500);
    closeSession();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try { localStorage.removeItem(backupKey(id)); } catch { /* bỏ qua */ }
    setFinished({ reason });
  }, [id, teardown]);

  // ---------------- tải đề
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/student/attempts/${id}`);
        if (cancelled) return;
        const d = r.data;
        if (d.status !== 'in_progress') return nav(`/student/attempts/${id}/result`, { replace: true });
        const camLive = session.stream?.getVideoTracks().some((t) => t.readyState === 'live') && session.engine?.face;
        if (d.requireCamera && !camLive) {
          // Tải lại trang → mất camera: quay về bước chuẩn bị (bài làm vẫn được giữ)
          return nav(`/student/rooms/${d.roomId}/prepare`, { replace: true });
        }
        offset.current = new Date(d.serverTime).getTime() - Date.now();
        const map = {};
        for (const a of d.answers) map[a.questionId] = { optionId: a.optionId, flagged: a.flagged };
        // Đáp án chưa kịp lưu lên máy chủ (mất mạng) được khôi phục từ bản sao trên máy
        const backup = readBackup(id);
        for (const [qid, a] of Object.entries(backup)) {
          if (d.questions.some((q) => String(q.id) === qid)) { map[qid] = a; dirty.current.add(Number(qid)); }
        }
        answersRef.current = map;
        setAnswers(map);
        setViol({ tab: d.tabViolations, fs: d.fullscreenViolations });
        setExam(d);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      }
    })();
    return () => { cancelled = true; };
  }, [id, nav]);

  // ---------------- lưu đáp án tự động
  const flushAnswers = useCallback(async () => {
    if (!dirty.current.size || doneRef.current) return;
    const ids = [...dirty.current];
    const sent = new Map(ids.map((qid) => [qid, answersRef.current[qid]]));
    const list = ids.map((qid) => ({ questionId: qid, ...sent.get(qid) }));
    setSaveState('saving');
    try {
      await api.put(`/student/attempts/${id}/answers`, { answers: list });
      // Chỉ bỏ khỏi danh sách chờ nếu sinh viên chưa đổi đáp án trong lúc đang gửi
      ids.forEach((q) => { if (answersRef.current[q] === sent.get(q)) dirty.current.delete(q); });
      const remaining = {};
      for (const q of dirty.current) remaining[q] = answersRef.current[q];
      writeBackup(id, remaining);
      setSaveState(dirty.current.size ? 'saving' : 'saved');
      if (dirty.current.size) saveTimer.current = setTimeout(flushAnswers, 400);
    } catch (e) {
      if (e.response?.data?.submitted) return finish(e.response.data.submitReason || 'timeout');
      setSaveState('error');
      saveTimer.current = setTimeout(flushAnswers, 3000);
    }
  }, [id, finish]);

  function updateAnswer(qid, patch) {
    if (doneRef.current) return;
    const next = { ...answersRef.current, [qid]: { optionId: null, flagged: false, ...answersRef.current[qid], ...patch } };
    answersRef.current = next;
    setAnswers(next);
    dirty.current.add(qid);
    const pending = {};
    for (const q of dirty.current) pending[q] = next[q];
    writeBackup(id, pending);
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushAnswers, 500);
  }

  // ---------------- khởi động giám sát khi đã có đề
  useEffect(() => {
    if (!exam) return undefined;
    doneRef.current = false;
    const onServer = (data) => {
      if (data.tabViolations != null) setViol({ tab: data.tabViolations, fs: data.fullscreenViolations });
      if (data.status === 'submitted') finish(data.submitReason || 'violation_limit');
    };
    queue.current = new EventQueue(id, onServer);

    monitor.current = new BrowserMonitor({
      requireFullscreen: exam.requireFullscreen,
      onEvent: (phase, ev) => {
        queue.current.push(ev, phase === 'start');
        if (phase === 'end' && ev.type === 'TAB_HIDDEN') toast('Hệ thống đã ghi nhận bạn rời khỏi trang thi.', 'warn', 5000);
      },
      onState: setShield,
    });
    monitor.current.start();

    if (exam.requireCamera) {
      const engine = getEngine();
      const v = videoRef.current;
      v.srcObject = session.stream;
      v.play().catch(() => {});
      engine.attach(v, overlayRef.current);
      engine.setBaseline(exam.baseline || session.baseline);
      engine.onStatus = setAiStatus;
      engine.onEvent = (phase, ev) => {
        queue.current.push(ev, phase === 'start');
        if (phase === 'start' && AI_WARNINGS[ev.type]) toast(AI_WARNINGS[ev.type], ev.type === 'PHONE' || ev.type.startsWith('MULTI') ? 'danger' : 'warn', 5000);
      };
      engine.start(true);
    }

    // Nhịp tim: máy chủ biết sinh viên còn kết nối, và báo nếu bài đã bị chốt
    const hb = setInterval(async () => {
      try {
        const r = await api.post(`/student/attempts/${id}/heartbeat`);
        onServer(r.data);
      } catch { /* mất mạng tạm thời */ }
    }, 15000);

    const warnLeave = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warnLeave);
    return () => {
      clearInterval(hb);
      window.removeEventListener('beforeunload', warnLeave);
      teardown();
    };
  }, [exam, id, finish, teardown, toast]);

  // ---------------- đồng hồ
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const remaining = exam ? new Date(exam.deadlineAt).getTime() - (now + offset.current) : 0;

  const submit = useCallback(async (reason = 'manual') => {
    if (doneRef.current || submitting) return;
    setSubmitting(true);
    setConfirmOpen(false);
    clearTimeout(saveTimer.current);
    const all = Object.entries(answersRef.current).map(([qid, a]) => ({ questionId: Number(qid), ...a }));
    try {
      await queue.current?.drain(2500);
      await api.post(`/student/attempts/${id}/submit`, { answers: all, reason });
      await finish(reason);
    } catch (e) {
      setSubmitting(false);
      toast(`Chưa nộp được bài: ${errMsg(e)}. Hệ thống sẽ thử lại.`, 'danger', 6000);
      if (reason === 'timeout') setTimeout(() => submit('timeout'), 3000);
    }
  }, [id, finish, submitting, toast]);

  useEffect(() => {
    if (exam && remaining <= 0 && !doneRef.current) submit('timeout');
  }, [exam, remaining, submit]);

  const questions = exam?.questions || [];
  const answeredCount = useMemo(() => questions.filter((q) => answers[q.id]?.optionId != null).length, [questions, answers]);
  const flaggedCount = useMemo(() => questions.filter((q) => answers[q.id]?.flagged).length, [questions, answers]);

  if (finished) {
    return (
      <div className="shield">
        <div className="shield-box">
          <h2>Bài thi đã được nộp</h2>
          <p>{SUBMIT_REASONS[finished.reason] || 'Bài thi đã được ghi nhận.'}{finished.reason === 'violation_limit' && ' Bạn đã rời khỏi trang thi quá số lần cho phép.'}</p>
          <button className="btn btn-primary btn-lg" onClick={() => nav(`/student/attempts/${id}/result`, { replace: true })}>Xem kết quả</button>
        </div>
      </div>
    );
  }
  if (error) return <div className="student-main"><div className="alert alert-danger">{error}</div></div>;
  if (!exam) return <Loading text="Đang tải đề thi..." />;

  const q = questions[current];
  const a = answers[q.id] || {};
  const low = remaining < 5 * 60 * 1000;
  const covered = shield.fsOut || shield.away;
  const maxTab = exam.maxTabViolations;

  return (
    <div className="exam-screen">
      <header className="exam-bar">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="title">{exam.examTitle}</div>
          <div className="sub">{exam.roomName} · đã làm {answeredCount}/{questions.length} câu</div>
        </div>
        <div className="sub" aria-live="polite">
          {saveState === 'saved' && 'Đã lưu'}
          {saveState === 'saving' && 'Đang lưu...'}
          {saveState === 'error' && <span style={{ color: '#ffb4a8' }}>Mất kết nối — đáp án được giữ trên máy</span>}
        </div>
        <div className={`timer${low ? ' low' : ''}`} aria-label="Thời gian còn lại">{fmtClock(remaining)}</div>
        <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={submitting}>Nộp bài</button>
      </header>

      <div className="exam-body">
        <aside className="card exam-side" style={{ padding: 12 }}>
          <div className="row-between" style={{ padding: '0 6px 8px' }}>
            <strong>Phiếu trả lời</strong>
            <span className="muted small">{flaggedCount ? `${flaggedCount} cần xem lại` : ''}</span>
          </div>
          <div className="sheet" style={{ maxHeight: 'calc(100vh - 170px)', overflow: 'auto' }}>
            {questions.map((qq, i) => {
              const sel = answers[qq.id];
              const idx = qq.options.findIndex((o) => o.id === sel?.optionId);
              return (
                <button key={qq.id} className={`sheet-row${i === current ? ' current' : ''}`} onClick={() => setCurrent(i)} aria-label={`Câu ${i + 1}`}>
                  <span className="sheet-num">{i + 1}</span>
                  {qq.options.map((o, k) => <Bubble key={o.id} index={k} filled={k === idx} />)}
                  <span className="sheet-flag">{sel?.flagged ? '⚑' : ''}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section>
          <div className="card question-card">
            <div className="row-between">
              <div className="question-meta">Câu {current + 1} / {questions.length}</div>
              <button className={`btn btn-sm${a.flagged ? ' btn-danger' : ''}`} onClick={() => updateAnswer(q.id, { flagged: !a.flagged })}>
                {a.flagged ? '⚑ Bỏ đánh dấu' : '⚐ Đánh dấu xem lại'}
              </button>
            </div>
            <div className="question-text">{q.content}</div>
            <div className="options" role="radiogroup">
              {q.options.map((o, k) => (
                <button key={o.id} role="radio" aria-checked={a.optionId === o.id} className={`option${a.optionId === o.id ? ' selected' : ''}`}
                  onClick={() => updateAnswer(q.id, { optionId: a.optionId === o.id ? null : o.id })}>
                  <Bubble index={k} filled={a.optionId === o.id} />
                  <span>{o.content}</span>
                </button>
              ))}
            </div>
            <div className="row-between" style={{ marginTop: 24 }}>
              <button className="btn" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>← Câu trước</button>
              {current < questions.length - 1
                ? <button className="btn btn-primary" onClick={() => setCurrent((c) => c + 1)}>Câu sau →</button>
                : <button className="btn btn-primary" onClick={() => setConfirmOpen(true)}>Nộp bài</button>}
            </div>
          </div>
        </section>

        <aside className="exam-side exam-right stack">
          {exam.requireCamera && (
            <div className="card" style={{ padding: 10 }}>
              <div className="cam-box">
                <video ref={videoRef} playsInline muted />
                <canvas ref={overlayRef} className="overlay" />
                <div className="cam-status">
                  {aiStatus?.faces === 0 && <span className="badge badge-danger">Không thấy mặt</span>}
                  {aiStatus?.faces === 1 && <span className="badge badge-ok">AI đang giám sát</span>}
                  {aiStatus?.faces > 1 && <span className="badge badge-danger">{aiStatus.faces} khuôn mặt</span>}
                  {aiStatus?.phone && <span className="badge badge-danger">Điện thoại</span>}
                </div>
              </div>
              {aiStatus?.active?.length > 0 && (
                <div className="alert alert-warn small" style={{ marginTop: 8 }}>
                  Đang ghi nhận: {aiStatus.active.map((t) => EVENT_LABELS[t]).join(', ')}
                </div>
              )}
            </div>
          )}
          <div className="card" style={{ padding: 14 }}>
            <div className="metric"><span>Thoát tab</span><b style={{ color: maxTab && viol.tab >= maxTab - 1 ? 'var(--danger)' : undefined }}>{viol.tab}{maxTab ? ` / ${maxTab}` : ''}</b></div>
            {exam.requireFullscreen && <div className="metric"><span>Thoát toàn màn hình</span><b>{viol.fs}</b></div>}
            {maxTab > 0 && exam.violationAction === 'auto_submit' && <p className="muted small" style={{ marginTop: 6 }}>Đến lần thứ {maxTab} bài sẽ tự nộp.</p>}
          </div>
        </aside>
      </div>

      {covered && !submitting && (
        <div className="shield" onClick={() => window.focus()}>
          <div className="shield-box">
            <h2>{shield.fsOut ? 'Bạn đã thoát chế độ toàn màn hình' : 'Bạn đang ở ngoài trang thi'}</h2>
            <p>Đề thi được che lại và sự kiện đã được ghi nhận gửi giảng viên. {shield.fsOut ? 'Bấm nút bên dưới để quay lại làm bài.' : 'Bấm vào đây để quay lại làm bài.'}</p>
            {shield.fsOut && <button className="btn btn-primary btn-lg" onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}>Quay lại toàn màn hình</button>}
          </div>
        </div>
      )}

      {confirmOpen && (
        <Modal title="Nộp bài thi?" onClose={() => setConfirmOpen(false)} width={460}
          footer={<><button className="btn" onClick={() => setConfirmOpen(false)}>Làm tiếp</button><button className="btn btn-primary" onClick={() => submit('manual')} disabled={submitting}>Nộp bài</button></>}>
          <p>Bạn đã trả lời <b>{answeredCount}/{questions.length}</b> câu.</p>
          {answeredCount < questions.length && <p className="error-text" style={{ marginTop: 8 }}>Còn {questions.length - answeredCount} câu chưa trả lời.</p>}
          {flaggedCount > 0 && <p className="muted" style={{ marginTop: 8 }}>{flaggedCount} câu đang được đánh dấu xem lại.</p>}
          <p className="muted small" style={{ marginTop: 12 }}>Sau khi nộp bạn không thể sửa bài.</p>
        </Modal>
      )}
      {submitting && <div className="shield"><div className="shield-box"><h2>Đang nộp bài...</h2><p>Vui lòng không đóng trang.</p></div></div>}
    </div>
  );
}
