const pad = (n) => String(n).padStart(2, '0');

export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Giá trị cho <input type="datetime-local"> theo giờ máy */
export function toLocalInput(v) {
  const d = new Date(v);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  return `${m} phút ${s % 60} giây`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const EVENT_LABELS = {
  TAB_HIDDEN: 'Thoát tab / rời cửa sổ thi',
  FULLSCREEN_EXIT: 'Thoát chế độ toàn màn hình',
  NO_FACE: 'Không phát hiện khuôn mặt',
  MULTI_FACE: 'Nhiều khuôn mặt trong khung hình',
  MULTI_PERSON: 'Nhiều người trong khung hình',
  HEAD_TURN: 'Quay đầu sang hướng khác',
  HEAD_DOWN: 'Cúi đầu bất thường',
  LOOK_AWAY_REPEATED: 'Quay / cúi đầu lặp lại nhiều lần',
  PHONE: 'Phát hiện điện thoại',
  CAMERA_OFF: 'Camera bị tắt / mất tín hiệu',
  CONNECTION_LOST: 'Mất kết nối với máy chủ',
};

export const SUBMIT_REASONS = {
  manual: 'Sinh viên tự nộp',
  timeout: 'Tự nộp khi hết giờ',
  violation_limit: 'Tự nộp do vượt giới hạn vi phạm',
};

export const ROOM_STATUS = {
  upcoming: { label: 'Chưa mở', cls: 'badge' },
  open: { label: 'Đang mở', cls: 'badge badge-ok badge-dot' },
  closed: { label: 'Đã đóng', cls: 'badge' },
};

export const RISK = {
  low: { label: 'Thấp', cls: 'badge badge-ok', color: '#1d7533' },
  medium: { label: 'Trung bình', cls: 'badge badge-warn', color: '#c27a0e' },
  high: { label: 'Cao', cls: 'badge badge-danger', color: '#b42318' },
};

export const REVIEW = {
  pending: { label: 'Chưa xét', cls: 'badge' },
  valid: { label: 'Hợp lệ', cls: 'badge badge-ok' },
  cheating: { label: 'Gian lận', cls: 'badge badge-danger' },
};

export function riskLevel(score) {
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}
