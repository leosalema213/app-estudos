export const notebookIcons = ['book', 'diary', 'home', 'thoughts', 'ideas', 'coffee', 'star', 'moon', 'sun', 'music', 'code', 'globe', 'camera', 'flower', 'leaf', 'mountain', 'palette', 'plane', 'brain', 'game', 'study', 'wallet', 'calendar', 'archive', 'none'];
export const isNotebookColor = color => ['violet', 'blue', 'orange', 'green', 'pink'].includes(color) || (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
export function customCoverStyle(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return undefined;
  const values = [1, 3, 5].map(offset => { const value = parseInt(color.slice(offset, offset + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  const luminance = values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  return { '--cover-bg': color, '--cover-ink': luminance > .179 ? '#000000' : '#ffffff', backgroundColor: color };
}
