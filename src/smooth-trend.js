'use strict';
/* Shape-preserving cubic Hermite interpolation: exact points, smooth extrema,
   and no values invented above/below either end of an interval. */
function smoothSegments(points) {
  if (!points.length) return [];
  for (let i = 0; i < points.length; i++) {
    if (!points[i].every(Number.isFinite) || (i && points[i][0] <= points[i - 1][0])) throw new Error('Invalid smooth chart points');
  }
  if (points.length < 2) return [];
  const h = [], slopes = [];
  for (let i = 0; i < points.length - 1; i++) {
    h.push(points[i + 1][0] - points[i][0]);
    slopes.push((points[i + 1][1] - points[i][1]) / h[i]);
  }
  const tangents = [slopes[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = slopes[i - 1], b = slopes[i];
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    tangents.push(a * b <= 0 ? 0 : (w1 + w2) / (w1 / a + w2 / b));
  }
  tangents.push(slopes[slopes.length - 1]);
  for (let i = 0; i < slopes.length; i++) {
    if (slopes[i] === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
    const norm = Math.hypot(tangents[i] / slopes[i], tangents[i + 1] / slopes[i]);
    if (norm > 3) { tangents[i] *= 3 / norm; tangents[i + 1] *= 3 / norm; }
  }
  return slopes.map((slope, i) => {
    const start = points[i], end = points[i + 1];
    const c1 = [start[0] + h[i] / 3, start[1] + tangents[i] * h[i] / 3];
    const c2 = [end[0] - h[i] / 3, end[1] - tangents[i + 1] * h[i] / 3];
    const curve = `C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${end[0]} ${end[1]}`;
    return { start, end, c1, c2, curve, path: `M ${start[0]} ${start[1]} ${curve}` };
  });
}

function smoothLinePath(points) {
  if (!points.length) return '';
  return `M ${points[0][0]} ${points[0][1]} ` + smoothSegments(points).map(s => s.curve).join(' ');
}

function smoothAreaPath(points, baseline) {
  if (points.length < 2) return '';
  return `${smoothLinePath(points)} L ${points[points.length - 1][0]} ${baseline} L ${points[0][0]} ${baseline} Z`;
}

module.exports = { smoothSegments, smoothLinePath, smoothAreaPath };
