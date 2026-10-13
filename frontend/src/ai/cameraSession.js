/**
 * Giữ luồng camera và bộ máy AI giữa trang "Chuẩn bị" và trang "Làm bài"
 * (chuyển trang trong ứng dụng không làm mất camera). Tải lại trang thì phải chuẩn bị lại.
 */
import { ProctorEngine } from './ProctorEngine';

export const session = {
  roomId: null,
  stream: null,
  engine: null,
  baseline: null,
};

export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Trình duyệt không hỗ trợ camera. Hãy dùng Chrome / Edge bản mới và mở trang bằng http://localhost hoặc https.');
  }
  if (session.stream && session.stream.getVideoTracks().some((t) => t.readyState === 'live')) return session.stream;
  try {
    session.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    return session.stream;
  } catch (err) {
    if (err.name === 'NotAllowedError') throw new Error('Bạn đã từ chối quyền camera. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ, cho phép Camera rồi thử lại.');
    if (err.name === 'NotFoundError') throw new Error('Không tìm thấy camera trên máy.');
    if (err.name === 'NotReadableError') throw new Error('Camera đang được ứng dụng khác sử dụng (Zoom, Meet...). Hãy tắt ứng dụng đó rồi thử lại.');
    throw new Error('Không mở được camera: ' + err.message);
  }
}

export function getEngine() {
  if (!session.engine) session.engine = new ProctorEngine();
  return session.engine;
}

export function closeSession() {
  session.engine?.stop();
  session.stream?.getTracks().forEach((t) => t.stop());
  session.stream = null;
  session.baseline = null;
  session.roomId = null;
}
