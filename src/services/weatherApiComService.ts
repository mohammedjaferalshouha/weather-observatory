import { Coordinates } from '../types';

const FUNCTIONS_BASE = (
  import.meta.env.VITE_WEATHER_FUNCTIONS_BASE ||
  '/.netlify/functions'
).replace(/\/$/, '');
const NETLIFY_FUNCTION_URL = `${FUNCTIONS_BASE}/getWeatherAPI`;

export interface WeatherApiComData {
  current: {
    time: string;
    temperature_2m: number;
    weathercode: number;
    windspeed_10m: number;
    relativehumidity_2m: number;
    precipitation: number;
    rain: number;
    feelslike: number;
    condition: string;
  };
  daily: {
    date: string;
    weathercode: number;
    temperature_2m_max: number;
    temperature_2m_min: number;
    precipitation_sum: number;
    hourly?: any[];
  }[];
}

export async function fetchWeatherApiComData(coords: Coordinates): Promise<WeatherApiComData | null> {
  const { lat, lon } = coords;

  const url = new URL(NETLIFY_FUNCTION_URL);
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error('WeatherAPI.com response not OK:', res.status);
      return null;
    }
    const data = await res.json();

    // التحقق من وجود البيانات بالهيكل الصحيح
    if (!data.current?.current) {
      console.error('WeatherAPI.com: لا توجد بيانات حالية', data);
      return null;
    }

    const currentData = data.current.current;
    const forecastday = data.forecast?.forecast?.forecastday;
    if (!forecastday || !Array.isArray(forecastday)) {
      console.error('WeatherAPI.com: لا توجد بيانات توقعات', data);
      return null;
    }

    // تجهيز التوقعات اليومية مع التحقق من وجود بيانات الساعات
    const daily = forecastday.map((day: any) => {
      const hourly = day.hour?.map((hour: any) => {
        return {
          time: hour.time,
          temperature_2m: hour.temp_c,
          weathercode: hour.condition?.code || 0,
          windspeed_10m: hour.wind_kph,
          relativehumidity_2m: hour.humidity || 0,
          precipitation: hour.precip_mm || 0,
          rain: hour.precip_mm || 0,
          modelTemps: { ecmwf: null, gfs: null, icon: null, gem: null, jma: null },
        };
      }) || [];

      return {
        date: day.date + 'T12:00:00Z',
        weathercode: day.day?.condition?.code || 0,
        temperature_2m_max: day.day?.maxtemp_c || 0,
        temperature_2m_min: day.day?.mintemp_c || 0,
        precipitation_sum: day.day?.totalprecip_mm || 0,
        hourly: hourly,
      };
    });

    return {
      current: {
        time: currentData.last_updated,
        temperature_2m: currentData.temp_c,
        weathercode: currentData.condition?.code || 0,
        windspeed_10m: currentData.wind_kph,
        relativehumidity_2m: currentData.humidity || 0,
        precipitation: currentData.precip_mm || 0,
        rain: currentData.precip_mm || 0,
        feelslike: currentData.feelslike_c || 0,
        condition: currentData.condition?.text || 'غير معروف',
      },
      daily,
    };
  } catch (err) {
    console.error('WeatherAPI.com fetch error:', err);
    return null;
  }
}
