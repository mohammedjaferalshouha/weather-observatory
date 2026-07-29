import { WeatherTheme } from '../types';

interface Props {
  theme: WeatherTheme;
  reducedMotion: boolean;
}

export default function WeatherScene({ theme, reducedMotion }: Props) {
  return (
    <div
      className={`weather-scene scene-${theme}${reducedMotion ? ' scene-still' : ''}`}
      aria-hidden="true"
    >
      <div className="scene-glow" />
      <div className="scene-orb" />
      <div className="scene-cloud cloud-one" />
      <div className="scene-cloud cloud-two" />
      <div className="scene-cloud cloud-three" />
      <div className="scene-mist mist-one" />
      <div className="scene-mist mist-two" />
      <div className="rain-layer">
        {Array.from({ length: 44 }, (_, index) => (
          <i key={index} style={{ '--i': index } as React.CSSProperties} />
        ))}
      </div>
      <div className="snow-layer">
        {Array.from({ length: 30 }, (_, index) => (
          <i key={index} style={{ '--i': index } as React.CSSProperties} />
        ))}
      </div>
      <div className="star-layer">
        {Array.from({ length: 38 }, (_, index) => (
          <i key={index} style={{ '--i': index } as React.CSSProperties} />
        ))}
      </div>
      <div className="lightning" />
      <div className="scene-horizon" />
      <div className="scene-noise" />
    </div>
  );
}
