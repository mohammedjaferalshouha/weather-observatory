export const handler = async (event: any, context: any) => {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = event.headers.origin || event.headers.Origin || '';
  const forwardedProtocol = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers.host || '';
  const ownOrigin = host ? `${forwardedProtocol}://${host}` : '';
  const allowedOrigins = [
    ...configuredOrigins,
    ownOrigin,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ].filter(Boolean);
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin || ownOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (origin && !allowedOrigins.includes(origin)) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'غير مصرح به من هذا المصدر' }),
    };
  }

  const { lat, lon } = event.queryStringParameters || {};
  if (!lat || !lon) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'خط العرض وخط الطول مطلوبان' }),
    };
  }

  const API_KEY = process.env.VISUALCROSSING_KEY;
  if (!API_KEY) {
    return {
      statusCode: 503,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'مصدر الطقس غير مهيأ بعد' }),
    };
  }

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lon}?unitGroup=metric&include=days,hours,current&key=${API_KEY}&lang=ar`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('فشل الاتصال بـ Visual Crossing');
    }
    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('خطأ في دالة Netlify:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'فشل جلب البيانات من Visual Crossing' }),
    };
  }
};
