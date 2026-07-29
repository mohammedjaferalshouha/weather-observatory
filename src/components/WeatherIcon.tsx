import {
  WiCloud,
  WiCloudy,
  WiDayCloudy,
  WiDaySunny,
  WiFog,
  WiNightAltCloudy,
  WiNightClear,
  WiRain,
  WiRainMix,
  WiShowers,
  WiSnow,
  WiStormShowers
} from 'react-icons/wi';

interface Props {
  code: number;
  isDay?: boolean;
  className?: string;
  title?: string;
}

export default function WeatherIcon({ code, isDay = true, className = '', title }: Props) {
  const common = { className: `weather-icon ${className}`, title, 'aria-hidden': title ? undefined : true };
  if ([95, 96, 99].includes(code)) return <WiStormShowers {...common} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <WiSnow {...common} />;
  if ([66, 67].includes(code)) return <WiRainMix {...common} />;
  if ([61, 63, 65].includes(code)) return <WiRain {...common} />;
  if ([51, 53, 55, 56, 57, 80, 81, 82].includes(code)) return <WiShowers {...common} />;
  if ([45, 48].includes(code)) return <WiFog {...common} />;
  if (code === 3) return <WiCloudy {...common} />;
  if (code === 2) return isDay ? <WiDayCloudy {...common} /> : <WiNightAltCloudy {...common} />;
  if (code === 1) return isDay ? <WiDayCloudy {...common} /> : <WiNightAltCloudy {...common} />;
  if (code === 0) return isDay ? <WiDaySunny {...common} /> : <WiNightClear {...common} />;
  return <WiCloud {...common} />;
}
