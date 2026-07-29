<div align="center">

# Global Weather Observatory

### Your weather now, with more precise forecasts from multiple global models

A bilingual, mobile-first weather experience that combines forecasts, model comparison, and interactive global maps.

[Live application](https://global-weather-observatory.netlify.app) · [Arabic documentation](../README.md) · [Demo video](video/weather-observatory-demo.mp4)

</div>

![Weather Observatory preview](video/weather-observatory-preview.gif)

## Overview

Weather Observatory is a progressive web application for desktop and mobile. It combines an open primary weather source with two server-protected secondary providers and exposes five global forecast models in a single responsive interface.

![Arabic overview](images/overview-ar.png)

## Highlights

- Full Arabic right-to-left interface and optional English interface.
- Arabic and English city search with diacritic and hamza normalization.
- Search by city name or geographic coordinates.
- Localized city and country names when switching languages.
- Country flags in search, favorites, and current-location results.
- Multiple favorites and a locally stored search history.
- Live backgrounds driven by weather conditions and time of day.
- Hourly forecast with detailed weather metrics.
- Daily forecast up to sixteen days, subject to each model's real horizon.
- One forecast-source selection shared by hourly, daily, and map views.
- Custom comparison of any two or more models.
- Shared-period and full-available-period comparison modes.
- Custom model blending with participating-model flags.
- Interactive model temperature chart.
- Flat world map and optional 3D globe.
- Temperature, precipitation, cloud, wind, humidity, pressure, ultraviolet, and dust fields.
- Radar, satellite imagery, aerosol observations, and active tropical cyclones.
- A single selected-location weather value with an approximate model-resolution area.
- Live geolocation and point selection directly from the map.
- Temperature, wind, time, and reduced-motion preferences.
- Shareable weather summary card.
- Installable progressive web application.
- Graceful fallback when a secondary provider is unavailable.

## Forecast models

![Model comparison](images/model-comparison.png)

| Model | Region | Maximum displayed horizon |
|---|---|---:|
| European | Europe | 15 days |
| American | United States | 16 days |
| German | Germany | 7.5 days |
| Canadian | Canada | 10 days |
| Japanese | Japan | 11 days |

When a model reaches the end of its real data horizon, the application uses only models that still provide data for that day and displays the flags of actual participants. It does not fabricate forecasts beyond an available model range.

## Interactive weather map

![Interactive weather map](images/weather-map.png)

The map is loaded on demand to protect mobile performance. Users can select the weather field, forecast source, and time, then choose one location for a clear value instead of rendering crowded labels across the viewport.

## Data sources

The project uses open forecast and mapping services, two optional protected weather providers, precipitation radar, satellite imagery, atmospheric aerosol observations, and active tropical-cyclone information.

See [Data sources and attribution](DATA_SOURCES.md) for technical details and official links.

## Local development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/
```

## Production build

```bash
npm run build
```

Production assets are generated in:

```text
dist
```

## Hosting variables

Never commit provider credentials. Configure these values in the hosting dashboard:

```text
WEATHERAPI_KEY
VISUALCROSSING_KEY
ALLOWED_ORIGINS
```

The serverless functions keep provider keys out of the browser and production bundle.

## Privacy

- No application account is required.
- No advertising or analytics tracker is included.
- Favorites, search history, and preferences stay in the user's browser.
- Geolocation is requested only after the user explicitly selects the live-location action.

## Developer

Designed and developed by Mohammed Jafer Al-Shouha

© 2026
