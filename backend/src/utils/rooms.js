function parseClasses(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Sinh viên được thi nếu thuộc một lớp được giao bài, hoặc được giảng viên thêm riêng vào phòng. */
function isStudentAllowed(room, student, explicitIds) {
  const classes = parseClasses(room.allowed_classes).map((c) => c.toUpperCase());
  if (classes.includes(String(student.class_name || '').toUpperCase())) return true;
  return explicitIds.includes(student.id);
}

/** Trạng thái phòng theo thời gian */
function roomTimeStatus(room, now = new Date()) {
  if (now < new Date(room.open_at)) return 'upcoming';
  if (now > new Date(room.close_at)) return 'closed';
  return 'open';
}

function mapRoomConfig(r) {
  return {
    requireCamera: r.require_camera === 1,
    requireFullscreen: r.require_fullscreen === 1,
    maxTabViolations: r.max_tab_violations,
    violationAction: r.violation_action,
    showAnswers: r.show_answers === 1,
  };
}

module.exports = { parseClasses, isStudentAllowed, roomTimeStatus, mapRoomConfig };
