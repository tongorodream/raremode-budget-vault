'use strict';
const assert = require('assert');
const { smoothSegments, smoothLinePath, smoothAreaPath } = require('../src/smooth-trend');
const fixtures = [
  [[0, 100], [1, 0], [2, 70], [3, 0], [4, 0], [5, 20]],
  [[0, 0], [1, 1000], [3, 1001], [7, 1002], [8, 9000]],
  [[0, -200], [2, 300], [3, -100], [10, 0]],
  [[0, 5], [1, 5], [2, 5]],
  [[0, 0], [1, 1]],
];
let sampled = 0;
const bezier = (a, b, c, d, t) => (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d;
for (const points of fixtures) {
  const original = JSON.stringify(points), segments = smoothSegments(points);
  assert.strictEqual(segments.length, points.length - 1);
  assert(smoothLinePath(points).includes(' C '));
  assert(smoothAreaPath(points, 0).endsWith(' Z'));
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i], low = Math.min(s.start[1], s.end[1]), high = Math.max(s.start[1], s.end[1]);
    assert.deepStrictEqual(s.start, points[i]); assert.deepStrictEqual(s.end, points[i+1]);
    for (let j = 0; j <= 100; j++) {
      const t = j/100, y = bezier(s.start[1], s.c1[1], s.c2[1], s.end[1], t);
      assert(y >= low - 1e-8 && y <= high + 1e-8, 'a smooth curve must not invent a negative expense or a higher peak');
      sampled++;
    }
    if (i + 1 < segments.length) {
      const next = segments[i+1];
      const left = (s.end[1]-s.c2[1])/(s.end[0]-s.c2[0]);
      const right = (next.c1[1]-next.start[1])/(next.c1[0]-next.start[0]);
      assert(Math.abs(left-right) < 1e-7, 'the slope must stay continuous at each recorded day');
    }
  }
  assert.strictEqual(JSON.stringify(points), original, 'smoothing does not average/change recorded points');
}
const peak = smoothSegments([[0,0],[1,10],[2,0]]);
assert.strictEqual(peak[0].c2[1],10); assert.strictEqual(peak[1].c1[1],10);
const flat = smoothSegments([[0,0],[1,0]])[0];
assert.strictEqual(flat.c1[1],0); assert.strictEqual(flat.c2[1],0);
assert.strictEqual(smoothLinePath([]),'');
assert.strictEqual(smoothLinePath([[5,7]]).trim(),'M 5 7');
assert.throws(()=>smoothSegments([[0,0],[0,10]]));
assert.throws(()=>smoothSegments([[0,0],[1,Infinity]]));
console.log(`PASS smooth trend — ${sampled} samples stay within real daily endpoints; no negative overshoot, no averaged peaks, continuous slopes and exact flat days`);
