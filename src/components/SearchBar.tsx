import { FormEvent, useEffect, useRef, useState } from 'react';
import { FiClock, FiMapPin, FiSearch, FiStar, FiX } from 'react-icons/fi';
import { parseCoordinates, reverseGeocode, searchCities } from '../services/weatherService';
import { Coordinates, GeocodingResult, Language } from '../types';
import { translations } from '../constants';
import CountryFlag from './CountryFlag';

interface Props {
  language: Language;
  disabled: boolean;
  favorites: Coordinates[];
  recent: Coordinates[];
  selectedLocation: Coordinates;
  onSelect: (location: Coordinates) => void;
  onUseLocation: () => void;
  onClearRecent: () => void;
}

const locationLabel = (location: Coordinates) =>
  [location.name, location.admin1, location.country]
    .filter((part, index, values) => part && values.indexOf(part) === index)
    .join('، ');

export default function SearchBar({
  language,
  disabled,
  favorites,
  recent,
  selectedLocation,
  onSelect,
  onUseLocation,
  onClearRecent
}: Props) {
  const t = translations[language];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selectedLocation.name ?? '');
    setResults([]);
    setSearched(false);
    setOpen(false);
  }, [language, selectedLocation.lat, selectedLocation.lon, selectedLocation.name]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    const coords = parseCoordinates(value);
    if (coords) {
      setResults([]);
      setSearched(false);
      setOpen(true);
      return;
    }
    if (value.length < 2 || value === selectedLocation.name) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      const id = ++requestId.current;
      setSearching(true);
      try {
        const found = await searchCities(value, language);
        if (id === requestId.current) {
          setResults(found);
          setSearched(true);
          setOpen(true);
        }
      } catch {
        if (id === requestId.current) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query, language, selectedLocation.name]);

  const chooseLocation = (location: Coordinates) => {
    setQuery(location.name ?? '');
    setResults([]);
    setSearched(false);
    setOpen(false);
    onSelect(location);
  };

  const choose = (result: GeocodingResult) => {
    chooseLocation({
      lat: result.latitude,
      lon: result.longitude,
      name: result.name,
      country: result.country,
      countryCode: result.countryCode,
      admin1: result.admin1,
      source: 'search'
    });
  };

  const chooseCoordinates = async (coords: { lat: number; lon: number }) => {
    setSearching(true);
    try {
      const resolved = await reverseGeocode(coords, language);
      chooseLocation({ ...resolved, source: 'coordinates' });
    } catch {
      chooseLocation({
        ...coords,
        name: t.coordinatesLocation,
        source: 'coordinates'
      });
    } finally {
      setSearching(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const coords = parseCoordinates(query);
    if (coords) {
      await chooseCoordinates(coords);
    } else if (results[0]) {
      choose(results[0]);
    }
  };

  const typedCoordinates = parseCoordinates(query);
  const showSaved = query.trim().length === 0 || query === selectedLocation.name;

  return (
    <div className="search-shell" ref={shellRef}>
      <form className="search-form" onSubmit={submit}>
        <FiSearch aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t.search}
          disabled={disabled}
          aria-label={t.search}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setSearched(false);
              setOpen(true);
            }}
            aria-label={t.close}
          >
            <FiX />
          </button>
        )}
        <button className="search-submit" type="submit" aria-label={t.searchAction} disabled={disabled || !query.trim()}>
          {searching ? <span className="mini-loader" /> : t.searchAction}
        </button>
      </form>

      <button className="location-button" type="button" onClick={onUseLocation} disabled={disabled}>
        <FiMapPin />
        <span>{t.location}</span>
      </button>

      {open && (
        <div className="search-results">
          {typedCoordinates && (
            <button type="button" onClick={() => chooseCoordinates(typedCoordinates)}>
              <FiMapPin />
              <span>
                <strong>{t.coordinatesLocation}</strong>
                <small>{typedCoordinates.lat.toFixed(5)}، {typedCoordinates.lon.toFixed(5)}</small>
              </span>
            </button>
          )}

          {showSaved && favorites.length > 0 && (
            <>
              <div className="results-label"><FiStar /> {t.favorites}</div>
              <div className="saved-locations-list">
                {favorites.map((favorite) => (
                  <button
                    type="button"
                    key={`favorite-${favorite.lat}-${favorite.lon}`}
                    onClick={() => chooseLocation(favorite)}
                  >
                    <CountryFlag countryCode={favorite.countryCode} label={favorite.country} />
                    <span>
                      <strong>{favorite.name}</strong>
                      <small>{[favorite.admin1, favorite.country].filter(Boolean).join('، ')}</small>
                    </span>
                    <FiStar />
                  </button>
                ))}
              </div>
            </>
          )}

          {showSaved && recent.length > 0 && (
            <>
              <div className="results-label"><FiClock /> {t.recent}</div>
              {recent.slice(0, 5).map((item) => (
                <button
                  type="button"
                  key={`recent-${item.lat}-${item.lon}`}
                  onClick={() => chooseLocation(item)}
                >
                  <CountryFlag countryCode={item.countryCode} label={item.country} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.country}</small>
                  </span>
                  <FiClock />
                </button>
              ))}
              <button type="button" className="clear-history" onClick={onClearRecent}>
                {language === 'ar' ? 'مسح السجل' : 'Clear history'}
              </button>
            </>
          )}

          {!typedCoordinates && results.map((result) => (
            <button
              type="button"
              key={`${result.id}-${result.latitude}-${result.longitude}`}
              onClick={() => choose(result)}
            >
              <CountryFlag countryCode={result.countryCode} label={result.country} />
              <span>
                <strong>{result.name}</strong>
                <small>{[result.admin1, result.country].filter(Boolean).join('، ')}</small>
              </span>
            </button>
          ))}

          {!typedCoordinates && query.trim().length >= 2 && searched && results.length === 0 && !searching && (
            <p className="empty-result">{t.noResults}</p>
          )}

          {!typedCoordinates && !showSaved && !searched && (
            <p className="coordinate-hint"><FiMapPin /> {t.coordinateHint}</p>
          )}

          {showSaved && favorites.length === 0 && recent.length === 0 && (
            <p className="coordinate-hint"><FiMapPin /> {t.coordinateHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
