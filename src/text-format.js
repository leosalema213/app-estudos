export function textColor(value) {
  if (typeof value !== 'string') return '';
  const color = value.trim().toLowerCase();
  if (/^#[a-f0-9]{6}$/.test(color)) return color;
  if (/^#[a-f0-9]{3}$/.test(color)) return '#' + [...color.slice(1)].map(c => c + c).join('');
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color);
  return rgb && rgb.slice(1).every(n => Number(n) <= 255) ? '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('') : '';
}

export const textColors = ['#c7a3df', '#a3bfe0', '#9ac7aa', '#e6bf86', '#df9c9c', '#dba6c7'];
