/**
 * Hàng đợi gửi sự kiện giám sát về máy chủ ngay trong lúc thi (không đợi nộp bài).
 * Cùng clientId gửi nhiều lần chỉ cập nhật thời lượng. Gửi lỗi thì giữ lại và thử lần sau.
 */
import api from '../api';

export class EventQueue {
  constructor(attemptId, onResponse) {
    this.attemptId = attemptId;
    this.onResponse = onResponse || (() => {});
    this.pending = new Map(); // clientId → event
    this.sending = false;
    this.stopped = false;
    this.timer = setInterval(() => this.flush(), 3000);
  }

  push(event, urgent = false) {
    const prev = this.pending.get(event.clientId);
    this.pending.set(event.clientId, {
      ...prev,
      ...event,
      snapshot: event.snapshot || prev?.snapshot || null,
      durationMs: Math.max(prev?.durationMs || 0, event.durationMs || 0),
    });
    if (urgent) this.flush();
  }

  async flush() {
    if (this.sending || !this.pending.size) return;
    this.sending = true;
    const batch = [...this.pending.values()].slice(0, 20);
    try {
      const r = await api.post(`/student/attempts/${this.attemptId}/events`, { events: batch });
      for (const e of batch) {
        // Chỉ xóa nếu chưa có bản mới hơn được đẩy vào trong lúc gửi
        const cur = this.pending.get(e.clientId);
        if (cur && cur.durationMs <= e.durationMs) this.pending.delete(e.clientId);
        else if (cur) cur.snapshot = null; // ảnh đã gửi rồi
      }
      this.onResponse(r.data);
    } catch (err) {
      if (err.response?.status === 409) {
        this.pending.clear();
        this.onResponse({ status: 'submitted', ...(err.response.data || {}) });
      }
      // lỗi mạng: giữ lại, lần sau gửi tiếp
    } finally {
      this.sending = false;
    }
    if (this.pending.size && !this.stopped) setTimeout(() => this.flush(), 300);
  }

  /** Gửi nốt sự kiện còn lại (trước khi nộp bài) */
  async drain(timeoutMs = 4000) {
    const t0 = Date.now();
    while (this.pending.size && Date.now() - t0 < timeoutMs) {
      if (!this.sending) await this.flush();
      else await new Promise((r) => setTimeout(r, 150));
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
  }
}
