// Видео холбоосыг таних: YouTube эсвэл шууд файл (MP4/WebM) — клиент, сервер аль алинд ашиглана
export type VideoSource = { kind: 'youtube'; id: string } | { kind: 'direct'; url: string };

export function parseVideoUrl(raw: string | null | undefined): VideoSource | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname); if (m) id = m[2]; }
  }
  if (id !== null) return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? { kind: 'youtube', id } : null;
  return { kind: 'direct', url: u.toString() };
}
