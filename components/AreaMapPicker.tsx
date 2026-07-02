'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Map as LeafletMap, LatLngExpression, LeafletMouseEvent, Polygon, Polyline } from 'leaflet';
import type { GeoAreaSelection } from '@/lib/types';

type GeoArea = GeoAreaSelection;

interface PlaceSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
  type?: string;
  class?: string;
}

interface Props {
  language: 'hr' | 'en';
  value?: GeoArea;
  values?: GeoArea[];
  onChange: (area?: GeoArea, areas?: GeoArea[]) => void;
}

const ZAGREB: LatLngExpression = [45.815, 15.9819];
const MIN_DRAW_POINT_DISTANCE = 0.00008;

function boundsFrom(points: GeoArea['points']): GeoArea['bounds'] {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

function centerFrom(points: GeoArea['points']): GeoArea['center'] {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

function fallbackLabel(points: GeoArea['points'], language: 'hr' | 'en'): string {
  const center = centerFrom(points);
  const coords = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  return language === 'en' ? `Selected area near ${coords}` : `Odabrano područje oko ${coords}`;
}

function shouldAddDrawPoint(points: GeoArea['points'], point: GeoArea['points'][number]): boolean {
  const previous = points.at(-1);
  if (!previous) return true;
  return Math.hypot(previous.lat - point.lat, previous.lng - point.lng) >= MIN_DRAW_POINT_DISTANCE;
}

function areaFromSearchResult(result: PlaceSearchResult): GeoArea {
  const center = { lat: Number(result.lat), lng: Number(result.lon) };
  let points: GeoArea['points'];

  if (result.boundingbox) {
    const [southRaw, northRaw, westRaw, eastRaw] = result.boundingbox;
    const south = Number(southRaw);
    const north = Number(northRaw);
    const west = Number(westRaw);
    const east = Number(eastRaw);
    points = [
      { lat: north, lng: west },
      { lat: north, lng: east },
      { lat: south, lng: east },
      { lat: south, lng: west },
    ];
  } else {
    const delta = 0.04;
    points = [
      { lat: center.lat + delta, lng: center.lng - delta },
      { lat: center.lat + delta, lng: center.lng + delta },
      { lat: center.lat - delta, lng: center.lng + delta },
      { lat: center.lat - delta, lng: center.lng - delta },
    ];
  }

  return {
    label: result.display_name.split(',').slice(0, 4).join(','),
    center,
    points,
    bounds: boundsFrom(points),
  };
}

async function reverseGeocode(center: GeoArea['center'], language: 'hr' | 'en'): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(center.lat));
    url.searchParams.set('lon', String(center.lng));
    url.searchParams.set('zoom', '12');
    url.searchParams.set('accept-language', language === 'en' ? 'en' : 'hr');
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.display_name === 'string' ? data.display_name.split(',').slice(0, 4).join(', ') : null;
  } catch {
    return null;
  }
}

export default function AreaMapPicker({ language, value, values, onChange }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const lineRef = useRef<Polyline | null>(null);
  const polygonRef = useRef<Polygon | null>(null);
  const drawHandlersRef = useRef<{
    down: (e: LeafletMouseEvent) => void;
    move: (e: LeafletMouseEvent) => void;
    up: () => void;
  } | null>(null);
  const isPointerDownRef = useRef(false);
  const initialValueRef = useRef(value);
  const [drawing, setDrawing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [points, setPoints] = useState<GeoArea['points']>(value?.points ?? []);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const pointsRef = useRef(points);
  const drawingRef = useRef(drawing);
  const selectedAreas = values ?? (value ? [value] : []);

  const t = {
    hr: {
      label: 'Područje koje želiš testirati',
      hint: 'Za lokalne usluge, dostavu ili marketplace: zaokruži kvart/grad/zonu pa AI koristi taj geo kontekst za publike i persone.',
      draw: 'Crtaj područje',
      finish: 'Završi područje',
      clear: 'Obriši',
      remove: 'Ukloni',
      expand: 'Otvori veliku mapu',
      shrink: 'Zatvori veliku mapu',
      close: 'Zatvori',
      searchPlaceholder: 'Upiši grad, državu ili mjesto...',
      searchButton: 'Pretraži',
      searchEmpty: 'Nema rezultata za taj upit.',
      searchError: 'Ne mogu pretražiti lokaciju. Pokušaj ponovno.',
      chooseArea: 'Odaberi ovo područje',
      selectedAreas: 'Odabrana područja',
      noAreas: 'Još nema odabranih područja.',
      searchHint: 'Možeš upisati lokaciju i odabrati je bez crtanja, ili otvoriti mapu pa ručno zaokružiti područje.',
      selected: 'Odabrano',
      points: 'točke',
      drawHint: 'Drži klik i povuci po mapi. Mapa je zaključana dok crtaš.',
    },
    en: {
      label: 'Area to test',
      hint: 'For local services, delivery, or marketplaces: draw a neighborhood/city/zone and AI will use that geo context for audiences and personas.',
      draw: 'Draw area',
      finish: 'Finish area',
      clear: 'Clear',
      remove: 'Remove',
      expand: 'Open large map',
      shrink: 'Close large map',
      close: 'Close',
      searchPlaceholder: 'Type a city, country, or place...',
      searchButton: 'Search',
      searchEmpty: 'No results for that query.',
      searchError: 'Could not search this location. Try again.',
      chooseArea: 'Use this area',
      selectedAreas: 'Selected areas',
      noAreas: 'No areas selected yet.',
      searchHint: 'You can type a location and select it without drawing, or open the map and draw the area manually.',
      selected: 'Selected',
      points: 'points',
      drawHint: 'Hold click and drag across the map. The map is locked while drawing.',
    },
  }[language];

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    (async () => {
      const L = await import('leaflet');
      if (!mounted || !mapEl.current || mapRef.current) return;

      const activePoints = pointsRef.current.length > 0
        ? pointsRef.current
        : initialValueRef.current?.points ?? [];
      const initialCenter = initialValueRef.current?.center
        ?? (activePoints.length > 0 ? centerFrom(activePoints) : null);
      const map = L.map(mapEl.current, {
        center: initialCenter ? [initialCenter.lat, initialCenter.lng] : ZAGREB,
        zoom: activePoints.length > 0 ? 12 : 11,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      lineRef.current = L.polyline([], { color: '#818cf8', weight: 3, dashArray: '6 6' }).addTo(map);
      polygonRef.current = L.polygon([], {
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(map);

      if (activePoints.length > 0) {
        const latLngs = activePoints.map((p) => [p.lat, p.lng] as [number, number]);
        if (drawingRef.current) {
          lineRef.current.setLatLngs(latLngs);
        } else if (latLngs.length >= 3) {
          polygonRef.current.setLatLngs(latLngs);
        }
        map.fitBounds(L.latLngBounds(latLngs), { padding: [18, 18] });
      }

      mapRef.current = map;
      setMapReadyVersion((version) => version + 1);

      const refreshSize = () => {
        map.invalidateSize({ animate: false });
      };
      resizeObserver = new ResizeObserver(refreshSize);
      resizeObserver.observe(mapEl.current);
      requestAnimationFrame(refreshSize);
      window.setTimeout(refreshSize, 120);
      window.setTimeout(refreshSize, 450);
    })();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [isExpanded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawHandlersRef.current) {
      map.off('mousedown', drawHandlersRef.current.down);
      map.off('mousemove', drawHandlersRef.current.move);
      map.off('mouseup', drawHandlersRef.current.up);
      map.off('mouseout', drawHandlersRef.current.up);
      drawHandlersRef.current = null;
    }

    isPointerDownRef.current = false;

    if (!drawing) {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      return;
    }

    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.touchZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();

    const appendPoint = (event: LeafletMouseEvent) => {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (!shouldAddDrawPoint(pointsRef.current, point)) return;
      const next = [...pointsRef.current, point];
      setPoints(next);
      lineRef.current?.setLatLngs(next.map((p) => [p.lat, p.lng]));
    };

    const handlers = {
      down: (event: LeafletMouseEvent) => {
        event.originalEvent.preventDefault();
        isPointerDownRef.current = true;
        appendPoint(event);
      },
      move: (event: LeafletMouseEvent) => {
        if (!isPointerDownRef.current) return;
        event.originalEvent.preventDefault();
        appendPoint(event);
      },
      up: () => {
        isPointerDownRef.current = false;
      },
    };

    drawHandlersRef.current = handlers;
    map.on('mousedown', handlers.down);
    map.on('mousemove', handlers.move);
    map.on('mouseup', handlers.up);
    map.on('mouseout', handlers.up);

    return () => {
      map.off('mousedown', handlers.down);
      map.off('mousemove', handlers.move);
      map.off('mouseup', handlers.up);
      map.off('mouseout', handlers.up);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
    };
  }, [drawing, isExpanded, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const refresh = () => map.invalidateSize({ animate: false });
    requestAnimationFrame(refresh);
    window.setTimeout(refresh, 160);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isExpanded]);

  const commitAreas = (nextAreas: GeoArea[]) => {
    onChange(nextAreas[0], nextAreas.length > 0 ? nextAreas : undefined);
  };

  const addArea = (area: GeoArea) => {
    const exists = selectedAreas.some((selected) => selected.label === area.label);
    commitAreas(exists ? selectedAreas : [...selectedAreas, area]);
  };

  const removeArea = (indexToRemove: number) => {
    commitAreas(selectedAreas.filter((_, index) => index !== indexToRemove));
  };

  const startDrawing = () => {
    if (drawing) {
      setDrawing(false);
      return;
    }
    setPoints([]);
    lineRef.current?.setLatLngs([]);
    polygonRef.current?.setLatLngs([]);
    setDrawing(true);
  };

  const searchPlaces = async () => {
    const query = searchTerm.trim();
    if (!query || isSearching) return;

    setIsSearching(true);
    setSearchError('');
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '6');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', language === 'en' ? 'en' : 'hr');
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) setSearchError(t.searchEmpty);
    } catch {
      setSearchResults([]);
      setSearchError(t.searchError);
    } finally {
      setIsSearching(false);
    }
  };

  const chooseSearchResult = async (result: PlaceSearchResult) => {
    const area = areaFromSearchResult(result);
    setDrawing(false);
    isPointerDownRef.current = false;
    setPoints(area.points);
    pointsRef.current = area.points;
    lineRef.current?.setLatLngs([]);
    polygonRef.current?.setLatLngs(area.points.map((p) => [p.lat, p.lng]));
    addArea(area);
    setSearchTerm(area.label);
    setSearchResults([]);

    const map = mapRef.current;
    if (map) {
      const L = await import('leaflet');
      map.fitBounds(L.latLngBounds(area.points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [28, 28] });
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    }
  };

  const finish = async () => {
    if (points.length < 3) return;
    const center = centerFrom(points);
    const area: GeoArea = {
      label: fallbackLabel(points, language),
      center,
      points,
      bounds: boundsFrom(points),
    };
    polygonRef.current?.setLatLngs(points.map((p) => [p.lat, p.lng]));
    lineRef.current?.setLatLngs([]);
    isPointerDownRef.current = false;
    setDrawing(false);
    const label = await reverseGeocode(center, language);
    addArea({ ...area, label: label ?? area.label });
  };

  const clear = () => {
    setPoints([]);
    setDrawing(false);
    isPointerDownRef.current = false;
    lineRef.current?.setLatLngs([]);
    polygonRef.current?.setLatLngs([]);
    commitAreas([]);
  };

  const searchPanel = (
    <div className="border-b border-zinc-800 bg-zinc-950/95 p-3 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void searchPlaces();
            }
          }}
          placeholder={t.searchPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => void searchPlaces()}
          disabled={isSearching || searchTerm.trim().length === 0}
          className="rounded-lg border border-indigo-700 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:border-zinc-800 disabled:bg-zinc-800 disabled:text-zinc-600 cursor-pointer disabled:cursor-not-allowed"
        >
          {isSearching ? '...' : t.searchButton}
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed">{t.searchHint}</p>
      {searchError && <p className="text-xs text-amber-400">{searchError}</p>}
      {searchResults.length > 0 && (
        <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
          {searchResults.map((result) => (
            <button
              key={result.place_id}
              type="button"
              onClick={() => void chooseSearchResult(result)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left transition-colors hover:border-indigo-600 hover:bg-zinc-800 cursor-pointer"
            >
              <span className="block text-sm font-medium text-zinc-100 leading-snug">{result.display_name}</span>
              <span className="mt-1 block text-[11px] text-indigo-300">{t.chooseArea}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">{t.selectedAreas}</p>
        {selectedAreas.length === 0 ? (
          <p className="text-xs text-zinc-600">{t.noAreas}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedAreas.map((area, index) => (
              <span
                key={`${area.label}-${index}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-100"
              >
                <span className="truncate">{area.label}</span>
                <button
                  type="button"
                  onClick={() => removeArea(index)}
                  className="text-emerald-300 hover:text-white cursor-pointer"
                  aria-label={`${t.remove}: ${area.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const mapControls = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950/95 px-3 py-2">
      <div className="text-xs text-zinc-500">
        {drawing ? (
          <span className="text-indigo-300">{t.drawHint}</span>
        ) : selectedAreas.length > 0 ? (
          <span><span className="text-zinc-300">{t.selected}:</span> {selectedAreas.length} · {selectedAreas.map((area) => area.label).join(' + ')}</span>
        ) : (
          <span>{points.length} {t.points}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startDrawing}
          className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer ${drawing ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
        >
          {t.draw}
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="px-3 py-1.5 rounded text-xs font-semibold border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          {isExpanded ? t.shrink : t.expand}
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={points.length < 3}
          className="px-3 py-1.5 rounded text-xs font-semibold border border-emerald-700 bg-emerald-700/80 disabled:border-zinc-800 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {t.finish}
        </button>
        <button
          type="button"
          onClick={clear}
          className="px-3 py-1.5 rounded text-xs font-semibold border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          {t.clear}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">{t.label}</label>
        <p className="text-xs text-zinc-500 leading-relaxed">{t.hint}</p>
      </div>
      {isExpanded && <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" aria-hidden="true" />}
      <div
        className={
          isExpanded
            ? `fixed inset-3 md:inset-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl ${drawing ? 'ai-area-map-drawing' : ''}`
            : `rounded-lg border border-zinc-700 overflow-hidden bg-zinc-950 ${drawing ? 'ai-area-map-drawing' : ''}`
        }
      >
        {isExpanded && (
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">{t.label}</p>
              <p className="text-xs text-zinc-500">{t.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        )}
        {searchPanel}
        <div
          ref={mapEl}
          className={`ai-area-map w-full ${isExpanded ? 'flex-1 min-h-0' : 'h-[26rem]'}`}
        />
        {mapControls}
      </div>
    </div>
  );
}
