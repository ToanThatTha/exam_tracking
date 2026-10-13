/**
 * Mô-đun AI giám sát chạy ngay trên trình duyệt của sinh viên.
 *  AI01  MediaPipe Face Landmarker → số khuôn mặt, góc quay / cúi đầu
 *  AI02  COCO-SSD → điện thoại ("cell phone"), nhiều người ("person")
 *  AI03  Kết hợp điều kiện + thời gian duy trì → sự kiện đáng ngờ
 *  AI04  Chụp ảnh bằng chứng đúng lúc sự kiện được ghi nhận
 * Video KHÔNG được gửi lên máy chủ; chỉ gửi sự kiện và một ảnh JPEG nhỏ cho mỗi sự kiện.
 */
import { AI_CONFIG as C } from './config';
import { headPose, faceBox } from './headPose';
import { loadFaceLandmarker, loadObjectDetector, faceInfo, objectInfo } from './models';

const LABEL_VI = {
  NO_FACE: 'Không thấy khuôn mặt',
  MULTI_FACE: 'Nhiều khuôn mặt',
  MULTI_PERSON: 'Nhiều người',
  HEAD_TURN: 'Quay đầu',
  HEAD_DOWN: 'Cúi đầu',
  PHONE: 'Điện thoại',
  CAMERA_OFF: 'Mất camera',
  LOOK_AWAY_REPEATED: 'Quay/cúi đầu nhiều lần',
};

export function newClientId(prefix) {
  const rand = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
  return `${prefix.toLowerCase().replace(/_/g, '')}-${rand.slice(0, 20)}`;
}

/** Theo dõi một điều kiện phải duy trì đủ lâu mới thành sự kiện */
class Sustained {
  constructor(type, minMs) {
    this.type = type;
    this.minMs = minMs;
    this.since = null;   // thời điểm điều kiện bắt đầu đúng
    this.event = null;   // sự kiện đang mở
    this.lastSent = 0;
  }
}

export class ProctorEngine {
  /**
   * @param {object} opts
   * @param {(phase:'start'|'update'|'end', event:object)=>void} opts.onEvent
   * @param {(status:object)=>void} [opts.onStatus]
   */
  constructor({ onEvent, onStatus } = {}) {
    this.onEvent = onEvent || (() => {});
    this.onStatus = onStatus || (() => {});
    this.baseline = { yaw: 0, pitch: 0 };
    this.video = null;
    this.overlay = null;
    this.running = false;
    this.detecting = false; // chỉ đo (hiệu chỉnh), chưa ghi sự kiện
    this.face = null;
    this.objects = null;
    this.lastFaceRun = 0;
    this.lastObjectRun = 0;
    this.objectBusy = false;
    this.ema = null;
    this.objectHistory = []; // [{phone, persons, phoneScore, boxes}]
    this.lastObjects = [];
    this.lastLandmarks = [];
    this.lookAwayStarts = [];
    this.lastRepeatedAt = -Infinity;
    this.status = { faces: null, yaw: null, pitch: null, yawDelta: null, pitchDelta: null, phone: false, persons: 0, fps: 0, objectModel: false, active: [] };
    this.rules = {
      NO_FACE: new Sustained('NO_FACE', C.noFaceMs),
      MULTI_FACE: new Sustained('MULTI_FACE', C.multiFaceMs),
      HEAD_TURN: new Sustained('HEAD_TURN', C.headTurnMs),
      HEAD_DOWN: new Sustained('HEAD_DOWN', C.headDownMs),
      PHONE: new Sustained('PHONE', 0),
      MULTI_PERSON: new Sustained('MULTI_PERSON', 0),
      CAMERA_OFF: new Sustained('CAMERA_OFF', 1500),
    };
    this.frameTimes = [];
    this.lastPitchDelta = 0;
    this.faceIntervalMs = C.faceIntervalMs;
    this.objectIntervalMs = C.objectIntervalMs;
  }

  /** Nạp mô hình. Lỗi phát hiện vật thể không chặn phần khuôn mặt. */
  async load(onProgress) {
    onProgress?.('Đang nạp MediaPipe Face Landmarker...');
    this.face = await loadFaceLandmarker();
    onProgress?.('Đang nạp mô hình phát hiện vật thể COCO-SSD...');
    try {
      this.objects = await loadObjectDetector();
      this.status.objectModel = true;
    } catch (err) {
      console.error('[AI] Không nạp được COCO-SSD:', err);
      this.objects = null;
      this.status.objectModel = false;
      onProgress?.('Không nạp được mô hình phát hiện vật thể — chỉ giám sát khuôn mặt');
    }
    // Máy yếu: giãn nhịp xử lý để giao diện làm bài không bị giật
    if (faceInfo.msPerFrame) this.faceIntervalMs = Math.max(C.faceIntervalMs, Math.round(faceInfo.msPerFrame * 2));
    if (objectInfo.msPerFrame) this.objectIntervalMs = Math.max(C.objectIntervalMs, Math.round(objectInfo.msPerFrame * 3));
    this.status.performance = { face: { ...faceInfo }, object: { ...objectInfo } };
  }

  attach(video, overlayCanvas = null) {
    this.video = video;
    this.overlay = overlayCanvas;
  }

  setBaseline(b) {
    if (b) this.baseline = { yaw: b.yaw, pitch: b.pitch };
  }

  /** start(true): đo và ghi sự kiện; start(false): chỉ đo (bước kiểm tra camera / hiệu chỉnh) */
  start(detect = true) {
    this.detecting = detect;
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  setDetecting(on) {
    this.detecting = on;
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    // Đóng các sự kiện còn mở
    const now = performance.now();
    for (const rule of Object.values(this.rules)) this.close(rule, now);
  }

  loop() {
    if (!this.running) return;
    try {
      this.tick();
    } catch (err) {
      console.error('[AI] lỗi xử lý khung hình', err);
    }
    // setTimeout thay vì requestAnimationFrame: vẫn chạy khi cửa sổ mất focus nhưng còn hiển thị
    this.timer = setTimeout(() => this.loop(), 33);
  }

  tick() {
    const v = this.video;
    const now = performance.now();
    if (!v) return;
    const track = v.srcObject?.getVideoTracks?.()[0];
    const cameraDead = !track || track.readyState === 'ended' || track.muted || v.readyState < 2;
    if (this.detecting) this.evaluate(this.rules.CAMERA_OFF, cameraDead, now, () => ({ confidence: null, details: { reason: track ? (track.readyState === 'ended' ? 'camera bị ngắt' : 'không nhận được hình ảnh') : 'không có luồng camera' } }), false);
    if (cameraDead) return;

    if (this.face && now - this.lastFaceRun >= this.faceIntervalMs) {
      this.lastFaceRun = now;
      this.lastTs = Math.max(now, (this.lastTs || 0) + 1); // timestamp phải tăng dần
      const res = this.face.detectForVideo(v, this.lastTs);
      this.processFaces(res.faceLandmarks || [], now);
      this.frameTimes.push(now);
      while (this.frameTimes.length && now - this.frameTimes[0] > 2000) this.frameTimes.shift();
      this.status.fps = Math.round(this.frameTimes.length / 2);
    }
    if (this.objects && !this.objectBusy && now - this.lastObjectRun >= this.objectIntervalMs) {
      this.lastObjectRun = now;
      this.objectBusy = true;
      this.objects.detect(v, 10, 0.35)
        .then((preds) => this.processObjects(preds, performance.now()))
        .catch((err) => console.warn('[AI] COCO-SSD lỗi', err))
        .finally(() => { this.objectBusy = false; });
    }
    this.draw();
  }

  processFaces(faces, now) {
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    this.lastLandmarks = faces;
    const s = this.status;
    s.faces = faces.length;
    if (faces.length >= 1) {
      // Khuôn mặt lớn nhất = sinh viên ngồi trước máy
      const main = faces.length === 1 ? faces[0] : faces.reduce((best, f) => (faceBox(f, w, h)[2] > faceBox(best, w, h)[2] ? f : best));
      const pose = headPose(main, w, h);
      if (pose) {
        const a = C.smoothing;
        this.ema = this.ema ? { yaw: this.ema.yaw + a * (pose.yaw - this.ema.yaw), pitch: this.ema.pitch + a * (pose.pitch - this.ema.pitch) } : pose;
        s.yaw = this.ema.yaw;
        s.pitch = this.ema.pitch;
        s.yawDelta = this.ema.yaw - this.baseline.yaw;
        s.pitchDelta = this.ema.pitch - this.baseline.pitch;
        this.lastPitchDelta = s.pitchDelta;
      }
    } else {
      this.ema = null;
      s.yawDelta = null;
      s.pitchDelta = null;
    }

    if (this.detecting) {
      const one = faces.length === 1;
      this.evaluate(this.rules.NO_FACE, faces.length === 0, now, () => ({
        confidence: null,
        details: this.lastPitchDelta > C.headDownDeg * 0.6 ? { reason: 'mất khuôn mặt ngay sau khi cúi đầu' } : {},
      }));
      this.evaluate(this.rules.MULTI_FACE, faces.length >= 2, now, () => ({ confidence: null, details: { faces: faces.length } }));
      const yawOver = one && s.yawDelta != null && Math.abs(s.yawDelta) > C.headTurnDeg;
      const downOver = one && s.pitchDelta != null && s.pitchDelta > C.headDownDeg;
      this.evaluate(this.rules.HEAD_TURN, yawOver, now, () => ({
        confidence: clamp01(0.5 + (Math.abs(s.yawDelta) - C.headTurnDeg) / 60),
        details: { yawDelta: round(s.yawDelta), thresholdDeg: C.headTurnDeg },
      }), true, true);
      this.evaluate(this.rules.HEAD_DOWN, downOver && !yawOver, now, () => ({
        confidence: clamp01(0.5 + (s.pitchDelta - C.headDownDeg) / 60),
        details: { pitchDelta: round(s.pitchDelta), thresholdDeg: C.headDownDeg },
      }), true, true);
    }
    this.status.active = Object.values(this.rules).filter((r) => r.event).map((r) => r.type);
    this.onStatus({ ...this.status });
  }

  processObjects(preds, now) {
    if (!this.running) return;
    const phones = preds.filter((p) => p.class === C.phoneLabel && p.score >= C.phoneMinScore);
    const persons = preds.filter((p) => p.class === C.personLabel && p.score >= C.personMinScore);
    this.lastObjects = [...phones, ...persons];
    this.objectHistory.push({ phone: phones.length > 0, phoneScore: Math.max(0, ...phones.map((p) => p.score)), persons: persons.length });
    if (this.objectHistory.length > C.objectWindow) this.objectHistory.shift();
    const hist = this.objectHistory;
    const phoneHits = hist.filter((x) => x.phone).length;
    const multiHits = hist.filter((x) => x.persons >= 2).length;
    this.status.phone = phones.length > 0;
    this.status.persons = persons.length;
    if (this.detecting) {
      this.evaluate(this.rules.PHONE, phoneHits >= C.objectHits, now, () => ({
        confidence: Math.max(...hist.map((x) => x.phoneScore)),
        details: { label: C.phoneLabel, hits: `${phoneHits}/${hist.length}`, model: 'COCO-SSD' },
      }));
      this.evaluate(this.rules.MULTI_PERSON, multiHits >= C.objectHits, now, () => ({
        confidence: null,
        details: { persons: Math.max(...hist.map((x) => x.persons)), model: 'COCO-SSD' },
      }));
    }
  }

  /**
   * AI03: điều kiện phải đúng liên tục ≥ minMs mới mở sự kiện; khi điều kiện hết thì đóng sự kiện.
   * @param withSnapshot chụp ảnh bằng chứng khi mở sự kiện
   * @param countsAsLookAway dùng để phát hiện quay/cúi đầu lặp lại
   */
  evaluate(rule, cond, now, describe, withSnapshot = true, countsAsLookAway = false) {
    if (cond) {
      if (rule.since == null) rule.since = now;
      const elapsed = now - rule.since;
      if (!rule.event && elapsed >= rule.minMs) {
        const info = describe();
        rule.event = {
          clientId: newClientId(rule.type),
          type: rule.type,
          startedAt: new Date(Date.now() - elapsed).toISOString(),
          durationMs: Math.round(elapsed),
          confidence: info.confidence != null ? Math.round(info.confidence * 1000) / 1000 : null,
          details: info.details || {},
          snapshot: withSnapshot ? this.snapshot(rule.type) : null,
        };
        rule.lastSent = now;
        this.onEvent('start', { ...rule.event });
        if (countsAsLookAway) this.trackLookAway(now);
      } else if (rule.event && now - rule.lastSent >= C.updateEveryMs) {
        rule.event.durationMs = Math.round(elapsed);
        rule.lastSent = now;
        this.onEvent('update', { ...rule.event, snapshot: null });
      }
    } else if (rule.since != null) {
      this.close(rule, now);
    }
  }

  close(rule, now) {
    if (rule.event) {
      rule.event.durationMs = Math.round(now - rule.since);
      this.onEvent('end', { ...rule.event, snapshot: null });
    }
    rule.event = null;
    rule.since = null;
  }

  trackLookAway(now) {
    this.lookAwayStarts = this.lookAwayStarts.filter((t) => now - t < C.repeatedWindowMs);
    this.lookAwayStarts.push(now);
    if (this.lookAwayStarts.length >= C.repeatedCount && now - this.lastRepeatedAt > C.repeatedWindowMs) {
      this.lastRepeatedAt = now;
      this.onEvent('start', {
        clientId: newClientId('LOOK_AWAY_REPEATED'),
        type: 'LOOK_AWAY_REPEATED',
        startedAt: new Date().toISOString(),
        durationMs: 0,
        confidence: null,
        details: { count: this.lookAwayStarts.length, windowSeconds: C.repeatedWindowMs / 1000 },
        snapshot: this.snapshot('LOOK_AWAY_REPEATED'),
      });
    }
  }

  /** AI04: ảnh JPEG nhỏ của khung hình hiện tại, kèm khung đánh dấu và nhãn sự kiện */
  snapshot(type) {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    const scale = C.snapshotWidth / v.videoWidth;
    const w = C.snapshotWidth;
    const h = Math.round(v.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(v, 0, 0, w, h);
    } catch {
      return null;
    }
    ctx.lineWidth = 2;
    ctx.font = '600 13px system-ui, sans-serif';
    for (const lm of this.lastLandmarks) {
      const [x, y, bw, bh] = faceBox(lm, w, h);
      ctx.strokeStyle = '#38d39f';
      ctx.strokeRect(x, y, bw, bh);
    }
    for (const o of this.lastObjects) {
      const [x, y, bw, bh] = o.bbox.map((n) => n * scale);
      ctx.strokeStyle = o.class === C.phoneLabel ? '#ff4d4f' : '#ffb020';
      ctx.strokeRect(x, y, bw, bh);
      const t = `${o.class === C.phoneLabel ? 'điện thoại' : 'người'} ${Math.round(o.score * 100)}%`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(x, Math.max(0, y - 18), ctx.measureText(t).width + 8, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(t, x + 4, Math.max(13, y - 5));
    }
    const label = `${LABEL_VI[type] || type} · ${new Date().toLocaleTimeString('vi-VN')}`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h - 24, w, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 8, h - 7);
    try {
      return canvas.toDataURL('image/jpeg', C.snapshotQuality);
    } catch {
      return null;
    }
  }

  /** Vẽ khung khuôn mặt / vật thể lên canvas xem trước (ảnh xem trước lật gương bằng CSS) */
  draw() {
    const cv = this.overlay;
    const v = this.video;
    if (!cv || !v?.videoWidth) return;
    if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineWidth = 3;
    for (const lm of this.lastLandmarks) {
      const [x, y, w, h] = faceBox(lm, cv.width, cv.height);
      ctx.strokeStyle = this.lastLandmarks.length > 1 ? '#ff4d4f' : '#38d39f';
      ctx.strokeRect(x, y, w, h);
    }
    for (const o of this.lastObjects) {
      ctx.strokeStyle = o.class === C.phoneLabel ? '#ff4d4f' : '#ffb020';
      ctx.strokeRect(...o.bbox);
    }
  }
}

/** Thu thập tư thế nhìn thẳng trong vài giây (SV03) */
export function calibrate(engine, { durationMs = C.calibrationMs, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const samples = [];
    let total = 0;
    const t0 = performance.now();
    const prev = engine.onStatus;
    engine.onStatus = (s) => {
      prev(s);
      total++;
      if (s.faces === 1 && s.yaw != null) samples.push({ yaw: s.yaw, pitch: s.pitch });
      const p = Math.min(1, (performance.now() - t0) / durationMs);
      onProgress?.(p);
      if (p >= 1) {
        engine.onStatus = prev;
        if (total === 0 || samples.length < total * 0.7) {
          return reject(new Error('Không nhận diện ổn định khuôn mặt. Hãy ngồi chính giữa khung hình, đủ ánh sáng và thử lại.'));
        }
        const yaws = samples.map((x) => x.yaw);
        const pitches = samples.map((x) => x.pitch);
        const spread = Math.max(Math.max(...yaws) - Math.min(...yaws), Math.max(...pitches) - Math.min(...pitches));
        if (spread > C.calibrationMaxSpreadDeg * 2) {
          return reject(new Error('Đầu di chuyển trong lúc hiệu chỉnh. Hãy giữ yên, nhìn thẳng vào màn hình và thử lại.'));
        }
        const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
        resolve({ yaw: round(avg(yaws)), pitch: round(avg(pitches)), samples: samples.length });
      }
    };
  });
}

function round(n) {
  return Math.round(n * 10) / 10;
}
function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
