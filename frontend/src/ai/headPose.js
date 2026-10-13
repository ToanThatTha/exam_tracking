/**
 * Ước lượng hướng đầu từ điểm mốc 3D của MediaPipe Face Landmarker (AI01).
 *
 * MediaPipe trả x, y chuẩn hóa theo chiều rộng / cao ảnh, z là độ sâu tương đối
 * (cùng thang đo với x; z càng nhỏ càng gần camera). Đổi về pixel rồi tính góc:
 *  - yaw (quay ngang): góc của đoạn nối hai bên má (điểm 234 → 454) so với mặt phẳng ảnh
 *  - pitch (ngẩng / cúi): góc của đoạn nối trán → cằm (điểm 10 → 152);
 *    pitch dương = cằm lùi ra xa, trán tiến lại gần camera = đang CÚI xuống.
 * Vì luôn so với tư thế nhìn thẳng đã hiệu chỉnh nên sai số hệ thống của từng người được triệt tiêu.
 */
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const FOREHEAD = 10;
const CHIN = 152;

const DEG = 180 / Math.PI;

export function headPose(landmarks, width, height) {
  if (!landmarks || landmarks.length < 455) return null;
  const p = (i) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height, z: landmarks[i].z * width });
  const l = p(LEFT_CHEEK);
  const r = p(RIGHT_CHEEK);
  const t = p(FOREHEAD);
  const c = p(CHIN);
  const yaw = Math.atan2(r.z - l.z, r.x - l.x) * DEG;
  const pitch = Math.atan2(c.z - t.z, c.y - t.y) * DEG;
  return { yaw, pitch };
}

/** Khung bao khuôn mặt (pixel) để vẽ lên ảnh xem trước / ảnh bằng chứng */
export function faceBox(landmarks, width, height) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return [minX * width, minY * height, (maxX - minX) * width, (maxY - minY) * height];
}

export function median(values) {
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
