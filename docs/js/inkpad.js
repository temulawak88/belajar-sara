// Canvas tinta untuk latihan menulis (aturan "Input sentuh & Pencil" di CLAUDE.md).
//
// - Hanya Pointer Events; canvas `touch-action: none` + setPointerCapture + pointercancel.
// - Palm rejection: selama Pencil dipakai (dan PEN_GRACE_MS sesudahnya) input jari diabaikan;
//   jika telapak tangan menyentuh duluan lalu Pencil turun, goresan telapak dibatalkan.
// - Tekanan Pencil -> tebal garis (dibatasi min–maks). Jari/mouse: tebal tetap.
// - Gambar di requestAnimationFrame, pakai getCoalescedEvents() jika ada, skala devicePixelRatio,
//   ukur ulang saat rotasi/resize (ResizeObserver).
// - Hover Pencil (opsional): titik bantu posisi ujung pena.
//
// Goresan diserahkan utuh lewat onStroke(points) saat jari/pena diangkat. Goresan yang
// dibatalkan (pointercancel, telapak tangan) tidak pernah diserahkan.

const PEN_GRACE_MS = 3000;
const FINGER_PRESSURE = 0.5;
const FADE_MS = 220;

/**
 * @param {HTMLElement} pad  elemen pembungkus (position: relative)
 * @param {{ onStroke?: (points: {clientX:number, clientY:number, x:number, y:number, pressure:number}[], pointerType: string) => void,
 *           onResize?: (size: {width:number, height:number}) => void }} handlers
 */
export function createInkPad(pad, handlers = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ink';
  canvas.setAttribute('aria-hidden', 'true');
  const hoverDot = document.createElement('div');
  hoverDot.className = 'hover-dot';
  hoverDot.hidden = true;
  pad.append(canvas, hoverDot);
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let enabled = true;
  let lastPenAt = -Infinity;
  let active = null; // { id, type, points: [], drawn: number }
  let rafId = 0;
  let fadeTimer = 0;

  const lineRange = () => {
    // Tebal relatif terhadap ukuran kotak: ±1.5%–4% dari sisi.
    const s = Math.min(width, height) || 300;
    return [s * 0.015, s * 0.04];
  };

  function resize() {
    const r = pad.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const changed = Math.abs(r.width - width) > 0.5 || Math.abs(r.height - height) > 0.5;
    width = r.width;
    height = r.height;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cancelStroke(); // goresan setengah jadi tidak berlaku lagi setelah ukuran berubah
    if (changed) handlers.onResize?.({ width, height });
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(pad);
  window.addEventListener('orientationchange', resize);

  function clearInk() {
    clearTimeout(fadeTimer);
    canvas.classList.remove('fade');
    ctx.clearRect(0, 0, width, height);
  }

  function fadeInk() {
    canvas.classList.add('fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(clearInk, FADE_MS);
  }

  function toPoint(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? e.pressure || FINGER_PRESSURE : FINGER_PRESSURE;
    return { clientX: e.clientX, clientY: e.clientY, x: e.clientX - r.left, y: e.clientY - r.top, pressure: p };
  }

  function draw() {
    rafId = 0;
    if (!active) return;
    const pts = active.points;
    const [minW, maxW] = lineRange();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(pad).getPropertyValue('--ink').trim() || '#1d2433';
    for (let i = Math.max(1, active.drawn); i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      // Tekanan dihaluskan supaya tebal garis tidak "bergerigi".
      active.smooth = active.smooth == null ? b.pressure : active.smooth * 0.7 + b.pressure * 0.3;
      ctx.lineWidth = minW + (maxW - minW) * Math.min(1, Math.max(0, active.smooth));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (pts.length === 1 && active.drawn === 0) {
      // Titik tunggal (tap) tetap terlihat.
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (minW + maxW) / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    active.drawn = pts.length;
  }

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(draw);
  };

  function cancelStroke() {
    if (!active) return;
    try {
      canvas.releasePointerCapture(active.id);
    } catch {
      /* sudah dilepas */
    }
    active = null;
    clearInk();
  }

  function onDown(e) {
    if (!enabled) return;
    e.preventDefault();
    const now = performance.now();
    if (e.pointerType === 'pen') {
      lastPenAt = now;
      // Telapak tangan menyentuh duluan, lalu Pencil turun: buang goresan telapak.
      if (active && active.type === 'touch') cancelStroke();
    } else if (e.pointerType === 'touch' && now - lastPenAt < PEN_GRACE_MS) {
      return; // palm rejection
    }
    if (active) return; // satu goresan sekaligus
    clearInk();
    hoverDot.hidden = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* event sintetis di tes tidak punya pointer aktif */
    }
    active = { id: e.pointerId, type: e.pointerType, points: [toPoint(e)], drawn: 0, smooth: null };
    schedule();
  }

  function onMove(e) {
    if (e.pointerType === 'pen') lastPenAt = performance.now();
    if (!active || e.pointerId !== active.id) {
      // Hover Pencil: titik bantu di ujung pena (tidak wajib untuk fitur apa pun).
      if (e.pointerType === 'pen' && e.buttons === 0 && enabled) {
        const p = toPoint(e);
        hoverDot.hidden = false;
        hoverDot.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      return;
    }
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) active.points.push(toPoint(ev));
    schedule();
  }

  function onUp(e) {
    if (!active || e.pointerId !== active.id) return;
    if (e.pointerType === 'pen') lastPenAt = performance.now();
    const stroke = active;
    active = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      active = stroke;
      draw(); // pastikan sisa titik tergambar sebelum memudar
      active = null;
    }
    fadeInk();
    handlers.onStroke?.(stroke.points, stroke.type);
  }

  function onCancel(e) {
    if (active && e.pointerId === active.id) cancelStroke();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'pen') hoverDot.hidden = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  resize();

  return {
    get size() {
      return { width, height };
    },
    setEnabled(on) {
      enabled = on;
      if (!on) cancelStroke();
      canvas.classList.toggle('disabled', !on);
      hoverDot.hidden = true;
    },
    clear: clearInk,
    resize,
    destroy() {
      ro.disconnect();
      window.removeEventListener('orientationchange', resize);
      canvas.remove();
      hoverDot.remove();
    },
  };
}
