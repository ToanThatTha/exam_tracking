// SV03. Chuẩn bị trước khi thi: quy tắc giám sát → camera → hiệu chỉnh tư thế → toàn màn hình → bắt đầu
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Loading, Spinner } from '../../components/ui';
import { session, openCamera, getEngine, closeSession } from '../../ai/cameraSession';
import { calibrate } from '../../ai/ProctorEngine';
import { enterFullscreen } from '../../ai/browserMonitor';
import { AI_CONFIG } from '../../ai/config';
import { fmtDateTime } from '../../utils/format';

function FaceStatus({ status }) {
  if (!status) return null;
  const f = status.faces;
  return (
    <div className="cam-status">
      {f === 0 && <span className="badge badge-danger">Không thấy khuôn mặt</span>}
      {f === 1 && <span className="badge badge-ok">Đã nhận diện khuôn mặt</span>}
      {f > 1 && <span className="badge badge-danger">{f} khuôn mặt</span>}
      {status.yaw != null && f === 1 && <span className="badge">ngang {Math.round(status.yawDelta)}° · dọc {Math.round(status.pitchDelta)}°</span>}
      {status.phone && <span className="badge badge-warn">Có điện thoại</span>}
    </div>
  );
}

export default function Prepare() {
  const { id } = useParams();
  const nav = useNavigate();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [camState, setCamState] = useState('idle'); // idle | loading | ready
  const [loadingText, setLoadingText] = useState('');
  const [status, setStatus] = useState(null);
  const [calib, setCalib] = useState({ state: 'idle', progress: 0, baseline: null, error: '' });
  const [agree, setAgree] = useState(false);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    api.get(`/student/rooms/${id}`)
      .then((r) => {
        if (r.data.attempt?.status === 'submitted') return nav(`/student/attempts/${r.data.attempt.id}/result`, { replace: true });
        setRoom(r.data);
      })
      .catch((e) => setError(errMsg(e)));
  }, [id, nav]);

  // Rời trang chuẩn bị mà không vào thi → tắt camera
  const keepCamera = useRef(false);
  useEffect(() => () => { if (!keepCamera.current) closeSession(); }, []);

  async function startCamera() {
    setError('');
    setCamState('loading');
    try {
      setLoadingText('Đang xin quyền sử dụng camera...');
      const stream = await openCamera();
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      const engine = getEngine();
      engine.onStatus = setStatus;
      engine.onEvent = () => {};
      if (!engine.face) await engine.load(setLoadingText);
      engine.attach(v, overlayRef.current);
      engine.start(false); // chỉ đo, chưa ghi vi phạm
      session.roomId = Number(id);
      setCamState('ready');
    } catch (e) {
      setCamState('idle');
      setError(e.message || errMsg(e));
    }
  }

  async function runCalibration() {
    setCalib({ state: 'running', progress: 0, baseline: null, error: '' });
    try {
      const engine = getEngine();
      engine.setBaseline({ yaw: 0, pitch: 0 });
      const b = await calibrate(engine, { onProgress: (p) => setCalib((c) => ({ ...c, progress: p })) });
      engine.setBaseline(b);
      session.baseline = { yaw: b.yaw, pitch: b.pitch };
      setCalib({ state: 'done', progress: 1, baseline: b, error: '' });
    } catch (e) {
      setCalib({ state: 'idle', progress: 0, baseline: null, error: e.message });
    }
  }

  async function begin() {
    setError('');
    setStarting(true);
    // Phải gọi toàn màn hình ngay trong thao tác bấm nút (quy định của trình duyệt)
    if (room.requireFullscreen) {
      const ok = await enterFullscreen();
      if (!ok) {
        setStarting(false);
        return setError('Trình duyệt không cho bật toàn màn hình. Hãy thử lại hoặc dùng Chrome / Edge.');
      }
    }
    try {
      const r = await api.post(`/student/rooms/${id}/start`, { baseline: room.requireCamera ? session.baseline : null });
      keepCamera.current = room.requireCamera;
      if (!room.requireCamera) closeSession();
      nav(`/student/attempts/${r.data.attemptId}`, { replace: true });
    } catch (e) {
      setError(errMsg(e));
      setStarting(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }

  if (!room) return error ? <div className="alert alert-danger">{error} <Link to="/student">Quay lại</Link></div> : <Loading />;

  const resuming = room.attempt?.status === 'in_progress';
  const camOk = !room.requireCamera || calib.state === 'done';
  const step = (n, done, active) => `step${done ? ' done' : active ? ' active' : ''}`;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/student" className="small">← Bài thi của bạn</Link>
          <h1>{room.examTitle}</h1>
          <p>{room.name} · {room.questionCount} câu · {room.durationMinutes} phút · đóng lúc {fmtDateTime(room.closeAt)}</p>
        </div>
      </div>
      {resuming && <div className="alert alert-info" style={{ marginBottom: 16 }}>Bạn đang có bài làm dở. Đáp án đã chọn vẫn được giữ, thời gian vẫn tiếp tục tính. Hãy chuẩn bị lại để tiếp tục.</div>}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Quy tắc phòng thi</h2>
          <ul className="rules">
            {room.requireCamera ? (
              <li><b>Bật camera suốt bài thi.</b> AI ghi nhận khi không thấy khuôn mặt (≥ {AI_CONFIG.noFaceMs / 1000} giây), có nhiều người, quay đầu lệch quá {AI_CONFIG.headTurnDeg}° (≥ {AI_CONFIG.headTurnMs / 1000} giây), cúi đầu lâu, hoặc có điện thoại. Mỗi sự kiện được chụp một ảnh làm bằng chứng.</li>
            ) : <li>Phòng thi không yêu cầu camera.</li>}
            {room.requireFullscreen && <li><b>Làm bài ở chế độ toàn màn hình.</b> Thoát toàn màn hình sẽ che đề và ghi nhận vi phạm.</li>}
            <li>
              <b>Không rời khỏi trang thi.</b> Chuyển tab hoặc sang ứng dụng khác đều bị ghi nhận.
              {room.maxTabViolations > 0 && (room.violationAction === 'auto_submit'
                ? <> Đến lần thứ <b>{room.maxTabViolations}</b>, bài thi <b>tự động được nộp</b>.</>
                : <> Quá {room.maxTabViolations} lần sẽ bị đánh dấu để giảng viên xem xét.</>)}
            </li>
            <li>Đáp án được lưu tự động. Hết giờ hệ thống tự nộp bài.</li>
            <li>Giảng viên xem lại các sự kiện và ảnh bằng chứng trước khi kết luận. Video không được gửi lên máy chủ.</li>
          </ul>
        </div>

        <div className="card">
          <div className="steps">
            {room.requireCamera && (
              <>
                <div className={step(1, camState === 'ready', camState !== 'ready')}>
                  <div className="step-num">1</div>
                  <div className="stack">
                    <h3>Kiểm tra camera và nhận diện khuôn mặt</h3>
                    <div className="cam-box" style={{ display: camState === 'idle' ? 'none' : 'block' }}>
                      <video ref={videoRef} playsInline muted />
                      <canvas ref={overlayRef} className="overlay" />
                      {camState === 'loading' && <div className="cam-status"><span className="badge"><Spinner /> {loadingText}</span></div>}
                      {camState === 'ready' && <FaceStatus status={status} />}
                    </div>
                    {camState === 'idle' && <button className="btn btn-primary" onClick={startCamera}>Bật camera</button>}
                    {camState === 'loading' && <p className="muted small">Lần đầu nạp mô hình AI có thể mất 10–30 giây.</p>}
                  </div>
                </div>
                <div className={step(2, calib.state === 'done', camState === 'ready' && calib.state !== 'done')}>
                  <div className="step-num">2</div>
                  <div className="stack">
                    <h3>Hiệu chỉnh tư thế nhìn thẳng</h3>
                    <p className="muted small">Ngồi như khi làm bài, nhìn thẳng vào giữa màn hình và giữ yên {AI_CONFIG.calibrationMs / 1000} giây.</p>
                    {calib.state === 'running' && <div className="progress"><div style={{ width: `${calib.progress * 100}%` }} /></div>}
                    {calib.state === 'done' && <div className="alert alert-ok">Đã hiệu chỉnh ({calib.baseline.samples} khung hình). Tư thế gốc: ngang {calib.baseline.yaw}°, dọc {calib.baseline.pitch}°.</div>}
                    {calib.error && <div className="alert alert-warn">{calib.error}</div>}
                    {camState === 'ready' && calib.state !== 'running' && (
                      <div><button className="btn" onClick={runCalibration} disabled={status?.faces !== 1}>{calib.state === 'done' ? 'Hiệu chỉnh lại' : 'Bắt đầu hiệu chỉnh'}</button>
                        {status?.faces !== 1 && <span className="muted small"> Cần đúng 1 khuôn mặt trong khung hình</span>}</div>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className={step(3, false, camOk)}>
              <div className="step-num">{room.requireCamera ? 3 : 1}</div>
              <div className="stack">
                <h3>Xác nhận và bắt đầu</h3>
                <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Tôi đã đọc và đồng ý với quy tắc phòng thi.</label>
                {error && <div className="alert alert-danger">{error}</div>}
                <button className="btn btn-primary btn-lg" onClick={begin} disabled={!camOk || !agree || starting}>
                  {starting ? 'Đang vào phòng...' : resuming ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}{room.requireFullscreen ? ' (toàn màn hình)' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
