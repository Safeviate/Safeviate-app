'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Wind, Thermometer, Eye, Navigation, Info, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MainPageHeader, HEADER_ACTION_BUTTON_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Map as MapIcon, Lock } from 'lucide-react';
import { isHrefEnabledForIndustry, shouldBypassIndustryRestrictions } from '@/lib/industry-access';
import { parseJsonResponse } from '@/lib/safe-json';

type WeatherCloudLayer = {
  cover?: string;
  base?: number | null;
};

type WeatherMetarData = {
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  altim?: number | string;
  obsTime?: number | string;
  icaoId?: string;
  name?: string;
  rawOb?: string;
  raw?: string;
  wspd?: number | string;
  wdir?: number | string | 'VRB';
  wgst?: number | string;
  visib?: number | string;
  temp?: number | string;
  dewp?: number | string;
  fltcat?: string;
  clouds?: WeatherCloudLayer[];
};

type WeatherTafForecast = {
  type?: string;
  timeFrom?: number | string;
  wdir?: number | string | 'VRB';
  wspd?: number | string;
  visib?: number | string;
  clouds?: WeatherCloudLayer[];
  wx?: string;
};

type WeatherTafData = {
  lat?: number;
  lon?: number;
  icaoId?: string;
  issueTime?: number | string;
  validTimeFrom?: number | string;
  validTimeTo?: number | string;
  rawTAF?: string;
  raw?: string;
  fcsts?: WeatherTafForecast[];
};

type CheckWxData = {
  latitude?: number;
  longitude?: number;
  barometer?: { hg?: number | string; hpa?: number | string };
  wind?: { degrees?: string | number; speed_kts?: number | string; gust_kts?: number | string };
  visibility?: { miles?: string | number };
  humidity?: { percent?: number | string };
  ceiling?: { feet?: number | string };
  temperature?: { celsius?: number | string };
  dewpoint?: { celsius?: number | string };
  icao?: string;
  timestamp?: number | string;
  raw_text?: string;
  flight_category?: string;
  station?: { name?: string };
};

type CheckWxResponse = CheckWxData & {
  data?: CheckWxData[];
};

type OpenMeteoData = {
  latitude?: number;
  longitude?: number;
  current?: {
    surface_pressure?: number | string;
    temperature_2m?: number | string;
    relative_humidity_2m?: number | string;
    visibility?: number | string;
    wind_direction_10m?: number | string;
    wind_speed_10m?: number | string;
    time?: string;
  };
};

type MetNorwayData = {
  properties?: {
    timeseries?: Array<{
      data?: {
        next_1_hours?: { details?: { precipitation_amount?: number } };
        instant?: { details?: { cloud_area_fraction?: number } };
      };
    }>;
  };
};

type WeatherObservation = {
  wdir: string | number | null;
  wspd: string | number | null;
  wgst: string | number | null;
  visib: string | number | null;
  temp: string | number | null;
  dewp: string | number | null;
  altim: string | number | null;
  altimHpa: string | number | null;
  icaoId: string;
  name: string | null;
  obsTime: number | string | null;
  rawOb: string | null;
  fltcat: string | null;
  clouds?: WeatherCloudLayer[];
};

type FlightCategoryData = {
  fltcat?: string | null;
  visib?: string | number | null;
  clouds?: WeatherCloudLayer[];
};

const formatTimestamp = (value?: number | string | null) => {
  if (value == null) return 'N/A';
  if (typeof value === 'number') {
    return new Date(value > 10_000_000_000 ? value : value * 1000).toLocaleString();
  }
  return new Date(value).toLocaleString();
};

export default function WeatherPage() {
  const { tenant, isLoading: isTenantLoading } = useTenantConfig();
  const [icao, setIcao] = useState('');
  const [loading, setLoading] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherMetarData | null>(null);
  const [tafData, setTafData] = useState<WeatherTafData | null>(null);
  const [avwxData, setAvwxData] = useState<{ summary?: string } | null>(null);
  const [checkWxData, setCheckWxData] = useState<CheckWxData | null>(null);
  const [vatsimData, setVatsimData] = useState<{ raw?: string; timestamp?: number | string } | null>(null);
  const [openMeteoData, setOpenMeteoData] = useState<OpenMeteoData | null>(null);
  const [metNorwayData, setMetNorwayData] = useState<MetNorwayData | null>(null);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);

  const { toast } = useToast();

  const mapCoords = useMemo(() => {
    // Priority: METAR -> TAF -> CheckWX -> Open-Meteo -> Default (FALA approx)
    const lat = Number(
      weatherData?.lat ?? 
      weatherData?.latitude ?? 
      tafData?.lat ?? 
      checkWxData?.latitude ?? 
      openMeteoData?.latitude ?? 
      -25.9231
    );
    const lon = Number(
      weatherData?.lon ?? 
      weatherData?.longitude ?? 
      tafData?.lon ?? 
      checkWxData?.longitude ?? 
      openMeteoData?.longitude ?? 
      27.9242
    );
    return {
      lat: Number.isFinite(lat) ? lat : -25.9231,
      lon: Number.isFinite(lon) ? lon : 27.9242,
    };
  }, [weatherData, tafData, checkWxData, openMeteoData]);

  const windyEmbedUrl = useMemo(() => {
    const { lat, lon } = mapCoords;
    return `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&width=1200&height=600&zoom=8&level=surface&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=true&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1`;
  }, [mapCoords]);

  const fetchWeather = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!icao.trim()) return;

    const station = icao.toUpperCase().trim();
    setLoading(true);

    try {
      // 1. Parallel Fetch for Aviation Sources
      const [mainRes, avwxRes, checkWxRes, vatsimRes] = await Promise.all([
        fetch(`/api/weather?ids=${station}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/weather/avwx?icao=${station}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/weather/check-wx?icao=${station}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/weather/vatsim?icao=${station}`, { cache: 'no-store' }).catch(() => null)
      ]);

      const mainJson = mainRes?.ok ? await parseJsonResponse<{
        metar?: WeatherMetarData;
        taf?: WeatherTafData;
      }>(mainRes) : null;
      const avwxJson = avwxRes?.ok ? await parseJsonResponse<{ summary?: string }>(avwxRes) : null;
      const checkWxJson = checkWxRes?.ok ? await parseJsonResponse<CheckWxResponse>(checkWxRes) : null;
      const vatsimJson = vatsimRes?.ok ? await parseJsonResponse<{ raw?: string; timestamp?: number | string }>(vatsimRes) : null;

      setWeatherData(mainJson?.metar || null);
      setTafData(mainJson?.taf || null);
      setAvwxData(avwxJson);
      setCheckWxData(checkWxJson?.data?.[0] || checkWxJson); // Handle varying formats
      setVatsimData(vatsimJson);

      // 2. Secondary Coordinate-based Sources
      const lat = mainJson?.metar?.lat ?? mainJson?.taf?.lat ?? checkWxJson?.latitude;
      const lon = mainJson?.metar?.lon ?? mainJson?.taf?.lon ?? checkWxJson?.longitude;

      if (lat && lon) {
        const [omRes, mnRes] = await Promise.all([
          fetch(`/api/weather/open-meteo?lat=${lat}&lon=${lon}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/weather/met-norway?lat=${lat}&lon=${lon}`, { cache: 'no-store' }).catch(() => null)
        ]);
        if (omRes?.ok) setOpenMeteoData((await parseJsonResponse<OpenMeteoData>(omRes)) ?? null);
        if (mnRes?.ok) setMetNorwayData((await parseJsonResponse<MetNorwayData>(mnRes)) ?? null);
      } else {
        setOpenMeteoData(null);
        setMetNorwayData(null);
      }

      // Check if we got anything
      if (!mainJson?.metar && !mainJson?.taf && !checkWxJson && !avwxJson && !vatsimJson) {
        toast({ 
          variant: 'destructive', 
          title: 'Station Not Found', 
          description: `No aviation weather data available for ${station}.` 
        });
      } else {
        toast({ 
          title: 'Weather Updated', 
          description: `Multi-source data synchronized for ${station}.` 
        });
      }
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Error Fetching Data', description: error instanceof Error ? error.message : 'Error fetching data.' });
    } finally {
      setLoading(false);
    }
  };

  // Aggregated data for the summary cards
  const unifiedObservation = useMemo(() => {
    const omCurrent = openMeteoData?.current;
    
    // 1. Identify raw values from all sources
    const officialAlt = weatherData?.altim ?? checkWxData?.barometer?.hg;
    const officialHpa = checkWxData?.barometer?.hpa;
    const groundHpa = omCurrent?.surface_pressure;
    const officialAltValue = officialAlt == null ? null : Number(officialAlt);
    const officialHpaValue = officialHpa == null ? null : Number(officialHpa);
    const groundHpaValue = groundHpa == null ? null : Number(groundHpa);

    // 2. Select best source (Official > Ground)
    let altVal = officialAltValue ?? (groundHpaValue != null ? Number((groundHpaValue * 0.02953).toFixed(2)) : null);
    let hpaVal = officialHpaValue ?? groundHpaValue ?? (officialAltValue != null ? officialAltValue * 33.8639 : null);

    // 3. Normalize: If altimeter > 50, it was provided as hPa.
    if (altVal != null && Number(altVal) > 50) {
      altVal = Number((Number(altVal) * 0.02953).toFixed(2));
    }

    // 4. Normalize: If hPa < 50, it was provided as inHg.
    if (hpaVal != null && Number(hpaVal) < 50) {
      hpaVal = Math.round(Number(hpaVal) * 33.8639);
    } else if (hpaVal != null) {
      hpaVal = Math.round(Number(hpaVal));
    }

    const obs: WeatherObservation = {
      wdir: weatherData?.wdir ?? checkWxData?.wind?.degrees ?? omCurrent?.wind_direction_10m ?? null,
      wspd: weatherData?.wspd ?? checkWxData?.wind?.speed_kts ?? omCurrent?.wind_speed_10m ?? null,
      wgst: weatherData?.wgst ?? checkWxData?.wind?.gust_kts ?? null,
      visib: weatherData?.visib ?? checkWxData?.visibility?.miles ?? (omCurrent?.visibility != null ? Number((Number(omCurrent.visibility) / 1609.34).toFixed(1)) : null), // m to sm
      temp: weatherData?.temp ?? checkWxData?.temperature?.celsius ?? omCurrent?.temperature_2m ?? null,
      dewp: weatherData?.dewp ?? checkWxData?.dewpoint?.celsius ?? null,
      altim: altVal,
      altimHpa: hpaVal, 
      icaoId: weatherData?.icaoId ?? checkWxData?.icao ?? vatsimData?.raw?.substring(0, 4) ?? icao.toUpperCase(),
      name: weatherData?.name ?? checkWxData?.station?.name ?? null,
      obsTime: weatherData?.obsTime ?? checkWxData?.timestamp ?? vatsimData?.timestamp ?? omCurrent?.time ?? null,
      rawOb: weatherData?.rawOb ?? vatsimData?.raw ?? checkWxData?.raw_text ?? null,
      fltcat: weatherData?.fltcat ?? checkWxData?.flight_category ?? null
    };

    // If METAR fields are missing, try to fill from the current TAF period
    if (tafData?.fcsts?.[0]) {
      const f = tafData.fcsts[0];
      if (obs.wdir === null) obs.wdir = f.wdir ?? null;
      if (obs.wspd === null) obs.wspd = f.wspd ?? null;
      if (obs.visib === null) obs.visib = f.visib ?? null;
    }

    return obs;
  }, [weatherData, checkWxData, vatsimData, openMeteoData, tafData, icao]);

  // Helper to calculate Flight Category if API doesn't provide it
  const calculateFlightCategory = (data: FlightCategoryData | null) => {
    if (!data) return 'UNKNOWN';
    if (data.fltcat && data.fltcat !== 'UNKNOWN') return data.fltcat;

    const vis = parseFloat(String(data.visib ?? 0));
    
    // Find ceiling (lowest BKN or OVC layer)
    let ceiling = 10000; // Default high
    if (data.clouds && data.clouds.length > 0) {
      const layers = data.clouds.filter((c) => c.cover === 'BKN' || c.cover === 'OVC');
      if (layers.length > 0) {
        ceiling = Math.min(...layers.map((l) => l.base || 10000));
      }
    }

    if (vis > 5 && ceiling > 3000) return 'VFR';
    if (vis >= 3 && ceiling >= 1000) return 'MVFR';
    if (vis >= 1 && ceiling >= 500) return 'IFR';
    if (vis < 1 || ceiling < 500) return 'LIFR';
    
    return 'VFR'; // Default to VFR if visibility is good and no ceiling found
  };

  const getFlightCategoryColor = (category?: string) => {
    switch (category) {
      case 'VFR': return 'bg-green-500 hover:bg-green-600 text-white';
      case 'MVFR': return 'bg-blue-500 hover:bg-blue-600 text-white';
      case 'IFR': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'LIFR': return 'bg-purple-500 hover:bg-purple-600 text-white';
      default: return 'bg-gray-500 hover:bg-gray-600 text-white';
    }
  };

  if (isTenantLoading) {
    return <Skeleton className="h-[420px] w-full" />;
  }

  if (
    !shouldBypassIndustryRestrictions(tenant?.id) &&
    !isHrefEnabledForIndustry('/operations/weather', tenant?.industry) &&
    !(tenant?.enabledMenus?.includes('/operations/weather') ?? false)
  ) {
    return (
      <Card className="mx-auto w-full max-w-3xl border shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl font-black uppercase tracking-tight">Weather Unavailable</CardTitle>
          <CardDescription>Aviation weather tools are only available for aviation tenants.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="font-black uppercase">
            <Link href="/operations">Back to Operations</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 pt-4 md:p-8 lg:max-w-[1100px] w-full mx-auto">
      <Card className="flex-1 flex min-h-0 flex-col overflow-hidden shadow-none border">
        <MainPageHeader
          title="Weather Center"
          description="Multi-source METAR, TAF, decoded weather, and live operations mapping."
          actions={
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
              <form onSubmit={fetchWeather} className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Input
                  placeholder="Enter ICAO (e.g. KJFK, EGLL)"
                  value={icao}
                  onChange={(e) => setIcao(e.target.value)}
                  className="w-full sm:w-64 h-8 font-mono uppercase font-black text-[10px] bg-background"
                  maxLength={4}
                />
                <Button type="submit" disabled={loading} className={HEADER_ACTION_BUTTON_CLASS}>
                  {loading ? <span className="animate-spin text-lg">↻</span> : <Search className="w-4 h-4" />}
                  {loading ? 'Fetching' : 'Search Updates'}
                </Button>
              </form>
              <div className="h-8 w-px bg-border hidden sm:block mx-1" />
              <Button 
                variant="outline" 
                onClick={() => setIsSyncDialogOpen(true)}
                className={HEADER_SECONDARY_BUTTON_CLASS}
              >
                <Lock className="w-4 h-4" />
                Sync Premium
              </Button>
            </div>
          }
        />
        <CardContent className="flex-1 overflow-y-auto min-h-0 p-0 no-scrollbar">
          <div className="flex flex-col min-h-0">
            {loading && (
              <div className="p-4 md:p-6">
                <div className="space-y-4">
                  <Skeleton className="h-[200px] w-full rounded-xl" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Skeleton className="h-[120px] rounded-xl" />
                    <Skeleton className="h-[120px] rounded-xl" />
                    <Skeleton className="h-[120px] rounded-xl" />
                  </div>
                </div>
              </div>
            )}

              {unifiedObservation.icaoId && !loading && (
                <Tabs defaultValue="overview" className="flex flex-col space-y-6 p-4 md:p-6">
                  <div className="flex items-center gap-2">
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest text-foreground">Multi-Source</p>
                    {weatherData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">NOAA</Badge>}
                    {tafData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">TAF</Badge>}
                    {vatsimData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">VATSIM</Badge>}
                    {avwxData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">AVWX</Badge>}
                    {checkWxData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">CheckWX</Badge>}
                    {openMeteoData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">Open-Meteo</Badge>}
                    {metNorwayData && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border bg-popover text-popover-foreground">MET-Norway</Badge>}
                  </div>

                  <div className="space-y-6 pt-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 overflow-hidden rounded-xl border-2 border-card-border bg-card shadow-sm">
                      <div className="p-4 flex flex-col items-center justify-center text-center">
                        <Wind className="w-5 h-5 text-blue-500 mb-2" />
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Wind</span>
                        <p className="text-sm md:text-base font-black">{unifiedObservation.wdir === 'VRB' ? 'VRB' : unifiedObservation.wdir ? `${unifiedObservation.wdir}°` : 'CALM'} {unifiedObservation.wspd ? `@ ${unifiedObservation.wspd}kt` : ''}</p>
                        {unifiedObservation.wgst && <p className="text-[10px] font-bold text-destructive uppercase">Gusts {unifiedObservation.wgst}kt</p>}
                      </div>
                      <div className="p-4 flex flex-col items-center justify-center text-center border-l">
                        <Eye className="w-5 h-5 text-amber-500 mb-2" />
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Visibility</span>
                        <p className="text-sm md:text-base font-black">{unifiedObservation.visib != null ? `${unifiedObservation.visib} SM` : 'N/A'}</p>
                      </div>
                      <div className="p-4 flex flex-col items-center justify-center text-center border-t md:border-t-0 md:border-l">
                        <Thermometer className="w-5 h-5 text-orange-500 mb-2" />
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Temp / Dew</span>
                        <p className="text-sm md:text-base font-black">{unifiedObservation.temp != null ? `${unifiedObservation.temp}°C` : 'N/A'} / {unifiedObservation.dewp != null ? `${unifiedObservation.dewp}°C` : 'N/A'}</p>
                      </div>
                      <div className="p-4 flex flex-col items-center justify-center text-center border-l border-t md:border-t-0">
                        <Info className="w-5 h-5 text-purple-500 mb-2" />
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Altimeter</span>
                        <p className="text-sm md:text-base font-black">{unifiedObservation.altim != null ? `${Number(unifiedObservation.altim).toFixed(2)} inHg` : 'N/A'}</p>
                        {unifiedObservation.altimHpa && <p className="text-[10px] font-bold text-muted-foreground uppercase">{unifiedObservation.altimHpa} hPa</p>}
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-muted/20 p-1 rounded-xl border border-card-border shadow-sm overflow-x-auto no-scrollbar">
                      <TabsList className="bg-transparent border-none">
                        <TabsTrigger value="overview" className="px-6 font-black uppercase text-[10px] tracking-widest text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">Current Condition</TabsTrigger>
                        {tafData && <TabsTrigger value="taf" className="px-6 font-black uppercase text-[10px] tracking-widest text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">Forecast (TAF)</TabsTrigger>}
                        {avwxData && <TabsTrigger value="translated" className="px-6 font-black uppercase text-[10px] tracking-widest text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">Translated (AVWX)</TabsTrigger>}
                        {checkWxData && <TabsTrigger value="checkwx" className="px-6 font-black uppercase text-[10px] tracking-widest text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">Decoded (CheckWX)</TabsTrigger>}
                        {openMeteoData && <TabsTrigger value="ground" className="px-6 font-black uppercase text-[10px] tracking-widest text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">Ground Context</TabsTrigger>}
                      </TabsList>
                    </div>
                  </div>

                  <TabsContent value="overview" className="m-0 space-y-6 pt-2">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="lg:col-span-2 border-l-4 border-l-primary overflow-hidden shadow-sm">
                        <div className="p-6 pb-4 border-b bg-muted/5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                          <div>
                            <h3 className="text-4xl font-black tracking-tighter uppercase">{unifiedObservation.icaoId}</h3>
                            <p className="text-muted-foreground font-bold text-sm tracking-wider uppercase flex items-center gap-2 mt-1 text-foreground">
                              <Navigation className="w-3.5 h-3.5" />
                              {unifiedObservation.name || 'Station'} {unifiedObservation.rawOb ? 'METAR' : 'Current Data'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 text-right">
                            <Badge className={`text-base font-black px-4 py-1 uppercase tracking-widest shadow-sm ${getFlightCategoryColor(calculateFlightCategory(unifiedObservation))}`}>
                              {calculateFlightCategory(unifiedObservation)}
                            </Badge>
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-foreground">
                              OBS: {unifiedObservation.obsTime 
                                ? (typeof unifiedObservation.obsTime === 'number'
                                  ? new Date(unifiedObservation.obsTime * 1000).toLocaleString()
                                  : new Date(unifiedObservation.obsTime).toLocaleString())
                                : 'Live Data Stream'}
                            </span>
                          </div>
                        </div>

                        <CardContent className="p-0">
                          <div className="p-6 bg-muted/10">
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-2 text-foreground">
                              {unifiedObservation.rawOb ? 'RAW OBSERVATION' : 'AUTOMATED DATA SUMMARY'}
                            </span>
                            <p className="font-mono text-sm font-medium p-4 bg-background border rounded-lg shadow-inner break-words leading-relaxed text-foreground">
                              {unifiedObservation.rawOb || 'No raw METAR string available. Using multi-source automated sensor data.'}
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-l-4 border-l-orange-500 overflow-hidden shadow-sm bg-orange-50/5">
                        <CardHeader className="pb-2 border-b bg-orange-50/10">
                          <span className="text-[10px] font-black uppercase text-orange-800 tracking-widest">Station Info</span>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4 pt-4">
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Latitude</span>
                            <p className="text-sm font-bold font-mono">{mapCoords.lat.toFixed(4)}°</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Longitude</span>
                            <p className="text-sm font-bold font-mono">{mapCoords.lon.toFixed(4)}°</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Pressure (QNH)</span>
                            <p className="text-sm font-bold font-mono">
                               {unifiedObservation.altimHpa ? `Q${unifiedObservation.altimHpa}` : 'N/A'}
                            </p>
                          </div>
                          <div className="pt-2">
                             <Badge variant="outline" className="w-full justify-center py-2 border-dashed border-primary/40 font-black text-[10px] uppercase tracking-widest text-primary">
                                Operational Status: Active
                             </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {tafData && (
                      <div className="flex flex-col gap-2 pt-4">
                         <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Integrated Forecast Summary</span>
                         <Card className="border shadow-none bg-muted/5 transition-all hover:bg-muted/10">
                            <CardContent className="p-4 flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                     <Info className="w-4 h-4" />
                                  </div>
                                  <div>
                                     <p className="text-sm font-black uppercase tracking-tight">Active Terminal Forecast (TAF)</p>
                                     <p className="text-[10px] font-bold text-muted-foreground uppercase">{tafData.fcsts?.length || 0} forecast periods available for flight planning.</p>
                                  </div>
                               </div>
                               <Badge className="bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest">Live</Badge>
                            </CardContent>
                         </Card>
                      </div>
                    )}
                  </TabsContent>

              {tafData && (
                <TabsContent value="taf" className="m-0 space-y-6">
                  <Card className="border-l-4 border-l-blue-500 overflow-hidden shadow-sm">
                    <div className="p-6 pb-4 border-b bg-muted/5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <h3 className="text-4xl font-black tracking-tighter uppercase">{tafData.icaoId} TAF</h3>
                        <p className="text-muted-foreground font-bold text-sm tracking-wider uppercase mt-1 text-foreground">
                          Terminal Aerodrome Forecast
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-right">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-foreground">ISSUED: {formatTimestamp(tafData.issueTime)}</span>
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-foreground">VALID: {formatTimestamp(tafData.validTimeFrom)} - {formatTimestamp(tafData.validTimeTo)}</span>
                      </div>
                    </div>

                    <CardContent className="p-6 space-y-6 bg-muted/10">
                      {tafData.fcsts && tafData.fcsts.map((fcst, index: number) => (
                        <div key={index} className="bg-background border rounded-lg p-4 shadow-sm space-y-3">
                          <div className="flex justify-between items-center border-b pb-2">
                            <Badge variant="outline" className="font-black uppercase tracking-tighter text-[10px]">
                              {fcst.type || 'PERIOD'}
                            </Badge>
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                              FROM: {formatTimestamp(fcst.timeFrom)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Wind</span>
                              <p className="text-sm font-black">{fcst.wdir === 'VRB' ? 'VRB' : fcst.wdir ? `${fcst.wdir}°` : 'CALM'} {fcst.wspd ? `@ ${fcst.wspd}kt` : ''}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Visibility</span>
                              <p className="text-sm font-black">{fcst.visib != null ? `${fcst.visib} SM` : 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Clouds</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {fcst.clouds && fcst.clouds.map((cloud, i: number) => (
                                  <Badge key={i} variant="secondary" className="text-[9px] font-bold uppercase">
                                    {cloud.cover} @ {cloud.base}FT
                                  </Badge>
                                ))}
                                {(!fcst.clouds || fcst.clouds.length === 0) && <p className="text-sm font-black">CLEAR</p>}
                              </div>
                            </div>
                          </div>
                          {fcst.wx && (
                            <div className="pt-2 border-t">
                              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Weather</span>
                              <p className="text-sm font-bold text-blue-600">{fcst.wx}</p>
                            </div>
                          )}
                        </div>
                      ))}

                      <div className="mt-4">
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-2 text-foreground">RAW TAF</span>
                        <p className="font-mono text-sm font-medium p-4 bg-background border rounded-lg shadow-inner break-words leading-relaxed text-foreground whitespace-pre-wrap">
                          {tafData.rawTAF}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {openMeteoData && (
                <TabsContent value="ground" className="m-0 space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="border shadow-none">
                         <CardHeader className="bg-blue-50/20 border-b">
                            <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                               <Wind className="w-4 h-4 text-blue-600" />
                               Open-Meteo Ground Sensors
                            </CardTitle>
                         </CardHeader>
                         <CardContent className="p-6 space-y-4">
                            <div className="flex justify-between items-center border-b pb-2">
                               <span className="text-xs font-bold text-muted-foreground uppercase">Surface Pressure</span>
                               <div className="flex flex-col items-end">
                                  <span className="text-sm font-black">{unifiedObservation.altim ?? 'N/A'} inHg</span>
                                  {unifiedObservation.altimHpa && <span className="text-[10px] font-bold text-muted-foreground">{unifiedObservation.altimHpa} hPa</span>}
                               </div>
                            </div>
                            <div className="flex justify-between items-center border-b pb-2">
                               <span className="text-xs font-bold text-muted-foreground uppercase">Ground Temperature</span>
                               <span className="text-sm font-black">{openMeteoData.current?.temperature_2m}°C</span>
                            </div>
                            <div className="flex justify-between items-center border-b pb-2">
                               <span className="text-xs font-bold text-muted-foreground uppercase">Relative Humidity</span>
                               <span className="text-sm font-black">{openMeteoData.current?.relative_humidity_2m}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                               <span className="text-xs font-bold text-muted-foreground uppercase">Visibility (Ground)</span>
                               <span className="text-sm font-black">{unifiedObservation.visib} SM</span>
                            </div>
                         </CardContent>
                      </Card>

                      {metNorwayData && (
                        <Card className="border shadow-none">
                          <CardHeader className="bg-emerald-50/20 border-b">
                             <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                                <Navigation className="w-4 h-4 text-emerald-600" />
                                MET Norway Forecast
                             </CardTitle>
                          </CardHeader>
                          <CardContent className="p-6">
                             <div className="space-y-4">
                                <p className="text-xs font-medium text-muted-foreground italic leading-relaxed">
                                   High-precision atmospheric modeling data for the next hour.
                                </p>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                   <div className="p-3 bg-muted/20 rounded-lg">
                                      <span className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Precipitation</span>
                                      <span className="text-sm font-black">{metNorwayData.properties?.timeseries?.[0]?.data?.next_1_hours?.details?.precipitation_amount ?? 0} mm</span>
                                   </div>
                                   <div className="p-3 bg-muted/20 rounded-lg">
                                      <span className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Cloud Cover</span>
                                      <span className="text-sm font-black font-mono">{metNorwayData.properties?.timeseries?.[0]?.data?.instant?.details?.cloud_area_fraction ?? 0}%</span>
                                   </div>
                                </div>
                             </div>
                          </CardContent>
                        </Card>
                      )}
                   </div>
                </TabsContent>
              )}

              {checkWxData && (
                <TabsContent value="checkwx" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="shadow-none border border-slate-200">
                      <CardHeader className="py-3 px-4 bg-emerald-50/30 border-b">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Advanced Wind</span>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4 font-bold text-sm text-foreground">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Degrees</span>
                          <span className="p-1 font-mono uppercase bg-emerald-100/40 rounded">{checkWxData.wind?.degrees || 'N/A'}°</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Speed</span>
                          <span className="p-1 font-mono uppercase bg-emerald-100/40 rounded">{checkWxData.wind?.speed_kts || 0}KT</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-none border border-slate-200 text-foreground">
                      <CardHeader className="py-3 px-4 bg-sky-50/30 border-b">
                        <span className="text-[10px] font-black uppercase tracking-widest text-sky-800">Advanced Conditions</span>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4 font-bold text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Humidity</span>
                          <span className="p-1 font-mono uppercase bg-sky-100/40 rounded">{checkWxData.humidity?.percent || 0}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Ceiling</span>
                          <span className="p-1 font-mono uppercase bg-sky-100/40 rounded">{(checkWxData.ceiling?.feet || 0).toLocaleString()} FT</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-none border border-slate-200 text-foreground">
                      <CardHeader className="py-3 px-4 bg-orange-50/30 border-b">
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-800">Pressure Info</span>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4 font-bold text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Altimeter</span>
                          <span className="p-1 font-mono uppercase bg-orange-100/40 rounded">{checkWxData.barometer?.hg || 'N/A'} hg</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">hPa</span>
                          <span className="p-1 font-mono uppercase bg-orange-100/40 rounded">{checkWxData.barometer?.hpa || 'N/A'} hPa</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              )}

              {avwxData && (
                <TabsContent value="translated" className="m-0 space-y-6">
                  <Card className="shadow-none border overflow-hidden">
                    <CardHeader className="bg-muted/5 border-b py-4">
                      <CardTitle className="text-lg font-black uppercase tracking-tight text-foreground">Plain English Summary</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-foreground">Generated via AVWX Translation Engine</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                      <p className="text-lg font-bold leading-relaxed text-foreground">
                        {avwxData.summary || 'No summary available.'}
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              <div className="space-y-4 pt-4 border-t border-dashed">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
                            <div className="space-y-1">
                                <h4 className="text-sm font-black uppercase tracking-wider text-foreground">Live Operations Map</h4>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-foreground">
                                    Interactive weather centered on {weatherData?.icaoId ?? tafData?.icaoId ?? 'Requested Station'}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsSyncDialogOpen(true)}
                                className={HEADER_SECONDARY_BUTTON_CLASS}
                            >
                                <Lock className="w-4 h-4 mr-2" />
                                Sync Premium
                            </Button>
                        </div>
                    </div>

                <div className="w-full">
                  <Card className="shadow-none border overflow-hidden bg-slate-900 border-slate-700 relative h-[72dvh] sm:h-[620px] lg:aspect-video lg:h-auto">
                    <div className="absolute top-4 left-4 z-10 hidden sm:block">
                        <Badge className="bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white font-black uppercase text-[10px] tracking-widest px-3 py-1.5 shadow-xl">
                           Windy Live Operations Layer
                        </Badge>
                    </div>
                    <iframe
                      width="100%"
                      height="100%"
                      src={windyEmbedUrl}
                      frameBorder="0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Windy Operations Map"
                      className="absolute inset-0 grayscale-[10%]"
                    />
                  </Card>
                </div>
                  </div>
                </Tabs>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="sm:max-w-md bg-[#1C1C1C] text-white border-[#333]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                <div className="bg-amber-500 p-1.5 rounded-lg">
                    <MapIcon className="w-5 h-5 text-black" />
                </div>
                Sync Windy Account
            </DialogTitle>
            <DialogDescription className="text-white/80 font-bold uppercase text-[10px] tracking-widest pt-1">
                Unlock Premium Map Features
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                <p className="text-sm font-medium leading-relaxed">
                    To use your <span className="text-amber-500 font-bold">Windy Premium</span> features (high-res models, airport charts, etc.) inside Safeviate, you need to sign in to your Windy.com account in this browser.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-white/80">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">1</div>
                        Click the button below to open Windy login.
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-white/80">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">2</div>
                        Sign in with your email/password.
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-white/80">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">3</div>
                        Return here to see your synced map.
                    </div>
                </div>
            </div>
          </div>
          <DialogFooter className="flex sm:justify-between items-center bg-white/5 -mx-6 -mb-6 p-6 mt-2 rounded-b-lg border-t border-white/10">
            <Button 
                variant="ghost" 
                onClick={() => setIsSyncDialogOpen(false)}
                className={HEADER_SECONDARY_BUTTON_CLASS}
            >
                Cancel
            </Button>
            <Button 
                asChild
                className={HEADER_ACTION_BUTTON_CLASS}
                onClick={() => setIsSyncDialogOpen(false)}
            >
                <a href="https://www.windy.com/login" target="_blank" rel="noreferrer">
                    Log in to Windy.com
                </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
