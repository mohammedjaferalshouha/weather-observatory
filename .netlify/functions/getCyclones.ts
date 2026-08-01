const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH?eventlist=TC';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export const handler = async (event: any) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const host = event.headers?.host || '';
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const ownOrigin = host ? `${protocol}://${host}` : '';
  const allowed = new Set([
    ...allowedOrigins,
    ownOrigin,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ].filter(Boolean));
  const headers = {
    'Access-Control-Allow-Origin': origin || ownOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (origin && !allowed.has(origin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح به من هذا المصدر' }) };
  }

  try {
    const response = await fetch(GDACS_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'Weather Observatory/3.0' }
    });
    if (!response.ok) throw new Error(`GDACS_${response.status}`);
    const payload = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify(payload) };
  } catch (error) {
    console.error('Failed to fetch GDACS cyclones', error);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'تعذر الوصول إلى مصدر الأعاصير' }) };
  }
};
