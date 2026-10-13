/**
 * Ngưỡng của mô-đun AI giám sát (AI03).
 *
 * Đây là GIÁ TRỊ KHỞI ĐIỂM, cần kiểm thử và hiệu chỉnh trên camera thật
 * (ánh sáng, vị trí đặt laptop, khoảng cách ngồi). Ghi lại kết quả hiệu chỉnh vào báo cáo đồ án.
 * Mọi góc đều tính theo ĐỘ LỆCH so với tư thế nhìn thẳng đã hiệu chỉnh trước khi thi.
 */
export const AI_CONFIG = {
  // Tần suất xử lý
  faceIntervalMs: 100,        // ~10 khung hình/giây cho Face Landmarker
  objectIntervalMs: 700,      // phát hiện vật thể ~1.4 lần/giây (nặng hơn)
  updateEveryMs: 5000,        // sự kiện còn kéo dài: gửi cập nhật thời lượng mỗi 5 giây

  // AI01: khuôn mặt và hướng đầu
  noFaceMs: 3000,             // không thấy khuôn mặt liên tục ≥ 3 giây
  multiFaceMs: 1500,          // ≥ 2 khuôn mặt liên tục ≥ 1.5 giây
  headTurnDeg: 30,            // quay ngang lệch > 30°
  headTurnMs: 2500,           // ...kéo dài ≥ 2.5 giây
  headDownDeg: 22,            // cúi xuống lệch > 22°
  headDownMs: 3000,           // ...kéo dài ≥ 3 giây (nhìn bàn phím thoáng qua không tính)
  smoothing: 0.35,            // làm mượt góc (EMA): càng nhỏ càng mượt
  repeatedCount: 3,           // ≥ 3 lần quay/cúi đầu...
  repeatedWindowMs: 60000,    // ...trong 60 giây → LOOK_AWAY_REPEATED

  // AI02: phát hiện vật thể (COCO-SSD, tập nhãn COCO có "cell phone" và "person")
  phoneLabel: 'cell phone',
  personLabel: 'person',
  phoneMinScore: 0.5,
  personMinScore: 0.6,
  objectWindow: 3,            // xét 3 lần phát hiện gần nhất...
  objectHits: 2,              // ...phải xuất hiện ít nhất 2 lần (hạn chế báo nhầm 1 khung hình)

  // Hiệu chỉnh tư thế (SV03)
  calibrationMs: 3000,
  calibrationMaxSpreadDeg: 8, // độ dao động tối đa khi giữ đầu nhìn thẳng

  // Ảnh bằng chứng (AI04)
  snapshotWidth: 480,
  snapshotQuality: 0.7,
};

// Ưu tiên file đặt sẵn trong public/ (chạy không cần Internet), dự phòng tải từ CDN chính thức
export const MODEL_PATHS = {
  mediapipeWasm: ['/mediapipe-wasm', 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'],
  faceLandmarker: [
    '/models/face/face_landmarker.task',
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  ],
  cocoSsd: '/models/coco-ssd/model.json', // nếu không có sẽ dùng bản lite_mobilenet_v2 trên CDN của TensorFlow
};
