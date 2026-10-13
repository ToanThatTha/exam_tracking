/**
 * Giám sát trình duyệt (không dùng AI): thoát tab / rời cửa sổ, thoát toàn màn hình.
 * Mỗi lần rời đi là một "đợt": mở sự kiện khi rời, đóng (kèm thời lượng) khi quay lại.
 */
import { newClientId } from './ProctorEngine';

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export class BrowserMonitor {
  constructor({ requireFullscreen, onEvent, onState }) {
    this.requireFullscreen = requireFullscreen;
    this.onEvent = onEvent;
    this.onState = onState || (() => {});
    this.tab = null; // { event, t0 }
    this.fs = null;
    this.handlers = [];
  }

  start() {
    const on = (target, name, fn, opts) => {
      target.addEventListener(name, fn, opts);
      this.handlers.push(() => target.removeEventListener(name, fn, opts));
    };
    const check = () => this.check();
    on(document, 'visibilitychange', check);
    on(window, 'blur', check);
    on(window, 'focus', check);
    on(document, 'fullscreenchange', check);
    on(document, 'webkitfullscreenchange', check);
    // Hạn chế thao tác sao chép đề / chuột phải trong lúc thi
    const block = (e) => e.preventDefault();
    on(document, 'contextmenu', block);
    on(document, 'copy', block);
    on(document, 'cut', block);
    on(document, 'paste', block);
    this.poll = setInterval(check, 1000); // phòng khi trình duyệt không phát sự kiện focus
    this.check();
  }

  stop() {
    clearInterval(this.poll);
    this.handlers.forEach((off) => off());
    this.handlers = [];
    const now = Date.now();
    if (this.tab) this.finish('tab', now);
    if (this.fs) this.finish('fs', now);
  }

  check() {
    const now = Date.now();
    const away = document.visibilityState === 'hidden' || !document.hasFocus();
    if (away && !this.tab) this.begin('tab', 'TAB_HIDDEN', now, { reason: document.visibilityState === 'hidden' ? 'chuyển tab / thu nhỏ cửa sổ' : 'chuyển sang ứng dụng hoặc cửa sổ khác' });
    if (!away && this.tab) this.finish('tab', now);

    const fsOut = this.requireFullscreen && !isFullscreen();
    if (fsOut && !this.fs) this.begin('fs', 'FULLSCREEN_EXIT', now, {});
    if (!fsOut && this.fs) this.finish('fs', now);

    this.onState({ away, fsOut });
  }

  begin(key, type, now, details) {
    const event = { clientId: newClientId(type), type, startedAt: new Date(now).toISOString(), durationMs: 0, confidence: null, details, snapshot: null };
    this[key] = { event, t0: now };
    this.onEvent('start', { ...event });
  }

  finish(key, now) {
    const { event, t0 } = this[key];
    this[key] = null;
    this.onEvent('end', { ...event, durationMs: now - t0 });
  }
}
