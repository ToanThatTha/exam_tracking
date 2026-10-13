/**
 * Danh mục sự kiện giám sát và cách tính điểm rủi ro.
 *
 * Điểm rủi ro (0–100) chỉ là chỉ số GỢI Ý để giảng viên ưu tiên xem bài nào trước.
 * Kết luận cuối cùng (hợp lệ / gian lận) luôn do giảng viên quyết định (GV08).
 * Trọng số là giá trị khởi điểm, cần hiệu chỉnh lại sau khi kiểm thử thực tế.
 */
const EVENT_TYPES = {
  TAB_HIDDEN:         { source: 'browser', weight: 8,  label: 'Thoát tab / rời cửa sổ thi' },
  FULLSCREEN_EXIT:    { source: 'browser', weight: 5,  label: 'Thoát chế độ toàn màn hình' },
  NO_FACE:            { source: 'ai',      weight: 8,  label: 'Không phát hiện khuôn mặt' },
  MULTI_FACE:         { source: 'ai',      weight: 20, label: 'Nhiều khuôn mặt trong khung hình' },
  MULTI_PERSON:       { source: 'ai',      weight: 20, label: 'Nhiều người trong khung hình' },
  HEAD_TURN:          { source: 'ai',      weight: 6,  label: 'Quay đầu sang hướng khác' },
  HEAD_DOWN:          { source: 'ai',      weight: 6,  label: 'Cúi đầu bất thường' },
  LOOK_AWAY_REPEATED: { source: 'ai',      weight: 10, label: 'Quay / cúi đầu lặp lại nhiều lần' },
  PHONE:              { source: 'ai',      weight: 25, label: 'Phát hiện điện thoại' },
  CAMERA_OFF:         { source: 'browser', weight: 15, label: 'Camera bị tắt / mất tín hiệu' },
  CONNECTION_LOST:    { source: 'server',  weight: 10, label: 'Mất kết nối với máy chủ' },
};

/** Điểm của một sự kiện: trọng số, cộng thêm tối đa 100% nếu kéo dài (30 giây trở lên). */
function eventPoints(type, durationMs) {
  const def = EVENT_TYPES[type];
  if (!def) return 0;
  const longFactor = Math.min(1, Math.max(0, durationMs || 0) / 30000);
  return def.weight * (1 + longFactor);
}

/** Tính điểm rủi ro từ danh sách sự kiện (bỏ qua sự kiện giảng viên đã bác bỏ). */
function computeRisk(events) {
  let total = 0;
  for (const e of events) {
    if (e.status === 'dismissed') continue;
    total += eventPoints(e.type, e.duration_ms);
  }
  return Math.min(100, Math.round(total));
}

function riskLevel(score) {
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

module.exports = { EVENT_TYPES, computeRisk, riskLevel, eventPoints };
