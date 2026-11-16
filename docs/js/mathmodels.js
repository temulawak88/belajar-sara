// Gambar model soal cerita (SVG) untuk langkah "pilih model": bar | journey | tank | pie.
// Gambar bersifat umum (tanpa angka soal) — yang dilatih adalah memilih JENIS model yang cocok.

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export const MODEL_LABELS = {
  bar: { en: 'Bar model', id: 'balok' },
  journey: { en: 'Journey line', id: 'garis perjalanan' },
  tank: { en: 'Tank', id: 'tangki' },
  pie: { en: 'Pie chart', id: 'diagram lingkaran' },
};

const DRAW = {
  // Dua balok: yang atas terbagi 3 bagian, yang bawah 2 bagian, dengan kurung "?" di kanan.
  bar: () => [
    svg('rect', { x: 14, y: 26, width: 108, height: 22, class: 'mm-fill-a mm-line' }),
    svg('line', { x1: 50, y1: 26, x2: 50, y2: 48, class: 'mm-line' }),
    svg('line', { x1: 86, y1: 26, x2: 86, y2: 48, class: 'mm-line' }),
    svg('rect', { x: 14, y: 60, width: 72, height: 22, class: 'mm-fill-b mm-line' }),
    svg('line', { x1: 50, y1: 60, x2: 50, y2: 82, class: 'mm-line' }),
    svg('path', { d: 'M 130 26 q 8 0 8 8 v 12 q 0 8 6 8 q -6 0 -6 8 v 12 q 0 8 -8 8', class: 'mm-line mm-none' }),
    svg('text', { x: 150, y: 59, class: 'mm-text' }, '?'),
  ],
  // Garis dari A ke B dengan panah arah dan label kecepatan/waktu.
  journey: () => [
    svg('line', { x1: 18, y1: 62, x2: 142, y2: 62, class: 'mm-line' }),
    svg('circle', { cx: 18, cy: 62, r: 6, class: 'mm-dot' }),
    svg('circle', { cx: 142, cy: 62, r: 6, class: 'mm-dot' }),
    svg('text', { x: 18, y: 88, class: 'mm-text mm-small', 'text-anchor': 'middle' }, 'A'),
    svg('text', { x: 142, y: 88, class: 'mm-text mm-small', 'text-anchor': 'middle' }, 'B'),
    svg('path', { d: 'M 46 40 H 108 M 98 32 L 110 40 L 98 48', class: 'mm-line mm-none mm-accent' }),
    svg('text', { x: 80, y: 28, class: 'mm-text mm-small', 'text-anchor': 'middle' }, 'km/h'),
  ],
  // Tangki balok (tampak miring) dengan air sebagian.
  tank: () => [
    svg('path', { d: 'M 30 58 H 110 V 92 H 30 Z', class: 'mm-fill-a mm-none-stroke' }),
    svg('path', { d: 'M 110 58 L 134 44 V 78 L 110 92 Z', class: 'mm-fill-a mm-none-stroke' }),
    svg('path', { d: 'M 30 30 H 110 V 92 H 30 Z', class: 'mm-line mm-none' }),
    svg('path', { d: 'M 30 30 L 54 16 H 134 L 110 30 M 134 16 V 78 L 110 92', class: 'mm-line mm-none' }),
    svg('path', { d: 'M 30 58 H 110 L 134 44', class: 'mm-line mm-none mm-accent' }),
  ],
  // Lingkaran dengan tiga sektor.
  pie: () => [
    svg('path', { d: 'M 80 56 L 80 14 A 42 42 0 0 1 122 56 Z', class: 'mm-fill-a mm-line' }),
    svg('path', { d: 'M 80 56 L 122 56 A 42 42 0 0 1 50.3 85.7 Z', class: 'mm-fill-b mm-line' }),
    svg('path', { d: 'M 80 56 L 50.3 85.7 A 42 42 0 0 1 80 14 Z', class: 'mm-fill-c mm-line' }),
  ],
};

/** Elemen <svg> untuk satu jenis model. */
export function modelSVG(type) {
  const label = MODEL_LABELS[type];
  return svg('svg', { viewBox: '0 0 160 104', class: 'model-svg', role: 'img', 'aria-label': label.en }, ...DRAW[type]());
}
