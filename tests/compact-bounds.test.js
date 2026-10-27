import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { fitCompactBounds } = createRequire(import.meta.url)('../electron/compact-bounds.cjs');
const primary = { x: 0, y: 0, width: 1920, height: 1040 };
test('compact player preserves position and restores its fixed default size', () => {
  const saved = { x: 25, y: 895, width: 360, height: 120 };
  assert.deepEqual(fitCompactBounds(saved, [primary]), { ...saved, width: 340, height: 112 });
});
test('negative coordinates are preserved on a monitor to the left', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1080 };
  const saved = { x: -1800, y: 900, width: 360, height: 120 };
  assert.deepEqual(fitCompactBounds(saved, [primary, left]), { ...saved, width: 340, height: 112 });
});
test('a disconnected monitor cannot leave the player offscreen', () => {
  const rect = fitCompactBounds({ x: -1800, y: 1700, width: 360, height: 120 }, [primary]);
  assert(rect.x >= primary.x && rect.y >= primary.y);
  assert(rect.x + rect.width <= primary.width && rect.y + rect.height <= primary.height);
});
test('invalid or excessive saved sizes fall back to a usable visible rectangle', () => {
  assert.equal(fitCompactBounds({ x: NaN }, [primary]).width, 340);
  const rect = fitCompactBounds({ x: 1800, y: 1000, width: 9000, height: 3000 }, [primary]);
  assert.equal(rect.width, 340); assert.equal(rect.height, 112);
});
