import { useMemo } from 'react';
import { FiDroplet, FiWind } from 'react-icons/fi';
import { HourlyForecast, Language, TemperatureUnit, TimeFormat, WindUnit } from '../types';
import WeatherIcon from './WeatherIcon';

interface Props {
  data: HourlyForecast[];
  language: Language;
  temperatureUnit: TemperatureUnit;
  windUnit: WindUnit;
  timeFormat: TimeFormat;
  onSelect: (hour: HourlyForecast) => void;
}

const temp = (value: number, unit: TemperatureUnit) =>
  unit === 'f' ? Math.round((value * 9) / 5 + 32) : Math.round(value);

const wind = (value: number, unit: WindUnit) =>
  unit === 'mph' ? Math.round(value * 0.621371) : Math.round(value);

export default function HourlyChart({
  data,
  language,
  temperatureUnit,
  windUnit,
  timeFormat,
  onSelect
}: Props) {
  const nextHours = useMemo(() => {
    const now = Date.now() - 60 * 60 * 1000;
    return data.filter((hour) => new Date(hour.time).getTime() >= now).slice(0, 24);
  }, [data]);

  return (
    <div className="hourly-strip">
      {nextHours.map((hour, index) => (
        <button type="button" className="hour-card" key={hour.time} onClick={() => onSelect(hour)}>
          <time>
            {index === 0
              ? language === 'ar' ? 'الآن' : 'Now'
              : new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', {
                  hour: 'numeric',
                  hour12: timeFormat === '12'
                }).format(new Date(hour.time))}
          </time>
          <WeatherIcon code={hour.weathercode} isDay={new Date(hour.time).getHours() > 6 && new Date(hour.time).getHours() < 19} />
          <strong>{temp(hour.temperature_2m, temperatureUnit)}°</strong>
          <span className="rain-probability"><FiDroplet /> {Math.round(hour.precipitation_probability)}٪</span>
          <span className="hour-wind"><FiWind /> {wind(hour.windspeed_10m, windUnit)}</span>
        </button>
      ))}
    </div>
  );
}
