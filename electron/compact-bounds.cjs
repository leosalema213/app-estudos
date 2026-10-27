// Keep the floating player visible when monitors or resolutions change.
function fitCompactBounds(saved, areas) {
  const fallback = areas[0] || { x: 0, y: 0, width: 1920, height: 1080 };
  const valid = saved && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved[key]));
  const bounds = valid ? saved : { x: fallback.x + 24, y: fallback.y + 24, width: 340, height: 112 };
  let area = fallback; let overlap = 0;
  for (const screen of areas) {
    const size = Math.max(0, Math.min(bounds.x + bounds.width, screen.x + screen.width) - Math.max(bounds.x, screen.x))
      * Math.max(0, Math.min(bounds.y + bounds.height, screen.y + screen.height) - Math.max(bounds.y, screen.y));
    if (size > overlap) { overlap = size; area = screen; }
  }
  const width = Math.min(Math.max(280, Math.round(bounds.width)), area.width);
  const height = Math.min(Math.max(100, Math.round(bounds.height)), area.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
    width, height,
  };
}
module.exports = { fitCompactBounds };
