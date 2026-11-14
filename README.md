# SCAVENGE — Global Signal Intelligence

Monitor social media and the planet from one sci-fi command deck: live multi-platform feeds, keyword and
hashtag alerts, AI trend and sentiment analysis by country and city, and a world map of earthquakes,
wildfires, storms, volcanoes, news hotspots, weather, day/night and NASA satellite imagery.

**Zero dependencies.** Pure Node.js 18+ (built-in `fetch`, HTTP server, Server-Sent Events). No `npm install` needed.

```bash
cp .env.example .env          # optional: add API keys
node server/index.js          # → http://localhost:8080  (live feeds)
SCAVENGE_DEMO=1 node server/index.js   # offline simulator
npm test                      # API smoke test
docker build -t scavenge . && docker run -p 8080:8080 -v scavenge:/data scavenge
```

## What's inside

```
server/
  index.js              HTTP API, SSE live stream (/api/stream), static host, satellite proxy
  connectors/social.js  X, Facebook/Instagram, LinkedIn, Reddit, Mastodon, Bluesky, Hacker News, YouTube, GDELT news
  connectors/earth.js   USGS quakes, NASA EONET events, GDELT GEO hotspots, Open-Meteo weather, NASA GIBS imagery
  engine/scheduler.js   polls every source, enriches posts, pushes to clients
  engine/alerts.js      rule matching + delivery (in-app, desktop, webhook, ntfy.sh phone push)
  engine/ai.js          AI briefing via any OpenAI-compatible LLM (e.g. free local Ollama), statistical fallback
  engine/store.js       ring buffer + JSON persistence in ./data
  engine/sdr.js         RTL-SDR receiver: streaming, scanning, clips, transcription, distress detection
  engine/tx.js          ops intercom + licensed on-air transmit (rigctld PTT, band checks, logging)
  connectors/emergency.js  aircraft emergency squawks, GDACS, NWS
  connectors/radio.js   broadcast station directory, public KiwiSDR receivers
  connectors/flights.js live ADS-B aircraft, flight lookup & routes, airports with ATC frequencies
public/
  index.html            the whole UI (pinned map · Overview · Live feeds · Alerts · Radio & SOS · Analytics · Live TV · Sources)
  js/core.js            shared analysis engine: sentiment, geo-tagging, trend velocity, rule matching, briefing
  js/sim.js             simulator for the demo/test site
  js/radio.js           distress channels, transmit band rules, emergency numbers
```

## Data sources

| Source | Cost | Setup |
|---|---|---|
| Reddit, Mastodon, Hacker News, GDELT news (65+ languages) | Free | none |
| USGS earthquakes, NASA EONET, GDELT GEO, Open-Meteo, NASA GIBS | Free | none |
| Bluesky | Free | `BSKY_HANDLE`, `BSKY_APP_PASSWORD` |
| YouTube | Free quota | `YOUTUBE_API_KEY` |
| X (Twitter) | Paid API plan with search | `X_BEARER_TOKEN` |
| Facebook / Instagram | Meta Graph API, public pages only | `FB_ACCESS_TOKEN`, `FB_PAGE_IDS` |
| LinkedIn | Community Management API, organisation pages only | `LINKEDIN_TOKEN`, `LINKEDIN_ORG_URNS` |

X, Meta and LinkedIn no longer offer free public search. Scavenge includes working adapters that switch on
as soon as you add credentials; until then the Sources page shows them as "Needs keys".
Respect each platform's terms of service and local privacy law when monitoring.

## Radio & SOS

- **Emergency board**: aircraft squawking 7700 / 7600 / 7500 (adsb.lol), GDACS orange/red disaster alerts,
  US NWS extreme/severe warnings, and MAYDAY / PAN-PAN / SOS calls found in radio traffic or social posts.
  All of it is shown on the map, fed into alert rules (topic "Emergencies & distress"), and summarised in a ticker.
- **Distress watch**: presets for VHF 16, 121.5 MHz, 243 MHz, 2182 kHz, the GMDSS HF voice channels, SAR 5680 kHz,
  IARU emergency nets, 2 m calling channels and NOAA weather radio.
- **Listening**: a local RTL-SDR receiver (`rtl_fm`) streamed to the browser, with scanning, per-call clips,
  optional Whisper transcription and automatic distress detection; the nearest public KiwiSDR receivers, opened
  already tuned; links to LiveATC, Broadcastify, OpenMHz and WebSDR; and 40,000+ broadcast stations (radio-browser.info).
- **Talk back**: an ops intercom (push-to-talk voice and text between operators) and, for licensed operators,
  on-air transmit through your own transceiver via Hamlib `rigctld`. Transmit is off by default and needs a call sign
  and PIN. It is limited to your licensed bands, never transmits on aviation or beacon frequencies, always releases PTT, and every over is logged.
  Never send a false distress call. Listening to police and emergency-service radio is restricted in some countries.

## Admin sign-in & connected accounts

- **Admin sign-in**: username `admin`, password `admin` by default (or set `SCAVENGE_ADMIN_USER` / `SCAVENGE_ADMIN_PASSWORD`
  before first start). After signing in with the default password, Scavenge asks you to choose a new one; until you do,
  the Sign-in button shows a ⚠. Every change (rules, watch terms, accounts, intercom, route planning) needs the admin session.
- **Accounts tab**: sign in to X, Reddit, Mastodon, Bluesky, YouTube, Facebook/Instagram and LinkedIn on each platform's
  own login page (OAuth; Bluesky uses an app password). Scavenge stores read-only tokens encrypted (AES-256-GCM,
  key from `SCAVENGE_SECRET` or `data/.vault-key`) and its connectors monitor through them, refreshing tokens as needed.
- OAuth platforms need your own developer app; the Accounts tab shows the exact callback URL to register and takes the
  client ID and secret. Mastodon registers itself with your instance automatically.

## Situational layers

- **Incidents from news**: explosions, shootings, strikes, fires, floods, protests, crashes, kidnappings, outbreaks… are
  detected in news and posts and shown as icons at the city or country they mention (a dedicated GDELT sweep feeds this).
- **Conflict zones**: a reference list of active conflicts (mid-2026) with live intensity from news reports; links to
  ACLED and CrisisWatch for verification.
- **Weather radar**: live and forecast precipitation radar frames (RainViewer), animated.
- **Flights**: live ADS-B in the view; when zoomed out, a world snapshot from OpenSky (live with free credentials).
- **Traffic & road incidents**: live congestion overlay, accidents, closures, road works, broken-down vehicles and
  flooded roads (TomTom Traffic, free key in the Accounts tab or `TOMTOM_API_KEY`). Heavy jams get a cause: the
  nearest reported road incident, otherwise a matching local news incident (crash, flood, protest…), shown as a
  callout on the map and a notification. Each alert links to Google Maps' traffic view (Google's own traffic layer
  can't be embedded outside Google Maps). Shown at city zoom; flooded areas from news are shaded blue.

## Fastest route (operators)

Map toolbar → **Route** (or the Route tab beside the map). Enter From and To (address, place or `lat,lon`). Scavenge
fetches up to four alternatives and ranks them:

- **Live congestion and closures**: TomTom Routing with live traffic (free key); without a key, OpenStreetMap routing (OSRM)
  checked against the live traffic incident feed.
- **Flooding and closures** on a route mark it as blocked; **incidents in the news** (crashes, protests, fires…) within
  300 m add risk.
- **Speed cameras** from OpenStreetMap (Overpass) and **speed limits** from TomTom; travel times are never faster than the limits allow.
- The best route is drawn on the map (cyan), alternatives dashed, with cameras and blockages marked, a written briefing
  (your LLM when `LLM_BASE_URL` is set) and a Google Maps link that follows the same route.

## Flights

- **Live aircraft** on the map from community ADS-B networks (adsb.lol → airplanes.live → adsb.fi, all free), loaded
  for the area in view and moved smoothly between reports. Optional OpenSky credentials add a whole-world view.
- **Flights tab**: sortable list of aircraft in view, filters (altitude, emergencies, military), search by callsign,
  registration or ICAO hex, and a tracking card with route, altitude, speed, heading and squawk. Follow keeps the map on the aircraft.
- **Listen to ATC**: nearest airports with their published frequencies (OurAirports). One click tunes your local
  RTL-SDR receiver to the tower/approach/ATIS frequency (AM airband); LiveATC links cover airports with volunteer feeds.

## Map styles

The map uses Web Mercator and can switch between the Scavenge vector map, OpenStreetMap streets, CARTO night streets,
Esri satellite imagery (with or without labels), NASA's daily MODIS satellite mosaic, and a locally rendered Earth.
Tiles stream from those providers to the viewer's browser with their attribution shown on the map; respect each
provider's usage policy for heavy traffic.

## How the analysis works

- **Sentiment**: lexicon scoring with negation handling, normalised to −1…+1 per post.
- **Geo-tagging**: native coordinates when a platform provides them, otherwise place names in the text
  (100+ cities, every country they belong to, demonyms), then post language as a weak fallback.
- **Trends**: hashtags, terms and two-word phrases ranked by volume × velocity (current window vs. previous),
  with a bonus for spreading across platforms. Filterable by country or city.
- **AI briefing**: set `LLM_BASE_URL` (Ollama is free and local) for an LLM-written situation report; otherwise
  a statistical briefing is generated.

## API

`GET /api/health · /api/feed?platform=&country=&city=&q=&limit= · /api/trends?window=&country= · /api/analytics ·
/api/brief?country= · /api/events?layers=quake,nature,news,weather · /api/rules · /api/alerts · /api/watch ·
/api/sources · /api/satellite?date=YYYY-MM-DD · /api/stream (SSE) · /api/emergency · /api/radio/log ·
/api/radio/stations?country=&q= · /api/radio/kiwi?lat=&lon=&hz= · /api/sdr/status · /api/sdr/audio · /api/intercom · /api/tx/status ·
/api/flights?lamin=&lomin=&lamax=&lomax= · /api/traffic/incidents?lamin=&lomin=&lamax=&lomax= · /api/traffic/flow/{style}/{z}/{x}/{y}.png · POST /api/route {from, to} (operator) · /api/flights/find?q= · /api/flights/route?callsign= · /api/airports/near?lat=&lon=`
`POST /api/rules {name, terms[], platforms[], country, mood, match, delivery{inapp,browser,sound,webhook,ntfy}} ·
POST /api/watch {terms[]} · DELETE /api/rules?id= · POST /api/sdr/tune {freqs[], mode, squelch} ·
POST /api/sdr/stop · POST /api/intercom (JSON text or raw audio) · POST /api/tx (raw audio; X-Freq, X-Operator-Pin)`
