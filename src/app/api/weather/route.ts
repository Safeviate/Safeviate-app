import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for aviationweather.gov (NOAA)
 * This does NOT require an API key for basic METAR/TAF data.
 */
async function fetchObservation(
  url: string,
  label: 'METAR' | 'TAF',
  icao: string,
  headers: Record<string, string>
) {
  try {
    const response = await fetch(url, {
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      console.warn(`[Weather API] ${label} fetch failed for ${icao}: ${response.status}`);
      return null;
    }

    const raw = await response.text();

    if (!raw.trim()) {
      console.warn(`[Weather API] ${label} returned an empty body for ${icao}`);
      return null;
    }

    const payload = JSON.parse(raw);

    if (!Array.isArray(payload)) {
      console.warn(`[Weather API] ${label} returned an unexpected payload for ${icao}`);
      return null;
    }

    return payload[0] || null;
  } catch (error: any) {
    console.warn(`[Weather API] ${label} request failed for ${icao}: ${error.message}`);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get('ids');

  if (!ids) {
    return NextResponse.json({ error: 'Missing station IDs' }, { status: 400 });
  }

  const icao = ids.toUpperCase();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };

  try {
    console.log(`[Weather API] Fetching METAR/TAF for: ${icao}`);
    
    // Fetch METAR and TAF in parallel
    const [metar, taf] = await Promise.all([
      fetchObservation(
        `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`,
        'METAR',
        icao,
        headers
      ),
      fetchObservation(
        `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`,
        'TAF',
        icao,
        headers
      )
    ]);

    if (!metar && !taf) {
      return NextResponse.json(
        { metar: null, taf: null, found: false, station: icao },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    return NextResponse.json(
      { metar, taf, found: true, station: icao },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('[Weather API] Proxy Error:', error);
    return NextResponse.json({ error: 'Aviation Weather service error', details: error.message }, { status: 500 });
  }
}
