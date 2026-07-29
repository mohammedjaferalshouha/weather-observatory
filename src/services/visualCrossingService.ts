import { Coordinates } from '../types';

const FUNCTIONS_BASE = (
  import.meta.env.VITE_WEATHER_FUNCTIONS_BASE ||
  '/.netlify/functions'
).replace(/\/$/, '');
const NETLIFY_FUNCTION_URL = `${FUNCTIONS_BASE}/getVisualCrossing`;

export interface VisualCrossingData {
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

function getWeatherCodeFromIcon(icon: string): number {
  const mapping: Record<string, number> = {
    'clear-day': 0,
    'clear-night': 0,
    'partly-cloudy-day': 2,
    'partly-cloudy-night': 2,
    'cloudy': 3,
    'fog': 45,
    'wind': 0,
    'rain': 61,
    'sleet': 66,
    'snow': 71,
    'hail': 77,
    'thunderstorm': 95,
  };
  return mapping[icon] || 0;
}

export async function fetchVisualCrossingData(coords: Coordinates): Promise<VisualCrossingData | null> {
  const { lat, lon } = coords;

  const url = new URL(NETLIFY_FUNCTION_URL, window.location.origin);
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error('Visual Crossing response not OK:', res.status);
      return null;
    }
    const data = await res.json();

    if (!data.currentConditions) {
      console.error('لا توجد بيانات حالية في الـ response', data);
      return null;
    }

    const currentData = data.currentConditions;
    const daily = data.days.map((day: any) => {
      const hourly = day.hours?.map((hour: any) => ({
        time: hour.datetime,
        temperature_2m: hour.temp,
        weathercode: getWeatherCodeFromIcon(hour.icon),
        windspeed_10m: hour.windspeed,
        relativehumidity_2m: hour.humidity,
        precipitation: hour.precip,
        rain: hour.precip,
        modelTemps: { ecmwf: null, gfs: null, icon: null, gem: null, jma: null },
      })) || [];

      return {
        date: day.datetime + 'T12:00:00Z',
        weathercode: getWeatherCodeFromIcon(day.icon),
        temperature_2m_max: day.tempmax,
        temperature_2m_min: day.tempmin,
        precipitation_sum: day.precip,
        hourly: hourly,
      };
    });

    return {
      current: {
        time: currentData.datetime,
        temperature_2m: currentData.temp,
        weathercode: getWeatherCodeFromIcon(currentData.icon),
        windspeed_10m: currentData.windspeed,
        relativehumidity_2m: currentData.humidity,
        precipitation: currentData.precip,
        rain: currentData.precip,
        feelslike: currentData.feelslike,
        condition: currentData.conditions,
      },
      daily,
    };
  } catch (err) {
    console.error('Visual Crossing fetch error:', err);
    return null;
  }
}
