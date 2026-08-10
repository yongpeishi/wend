# Q2 — Maps provider, and how you add a place

**Status:** answered by assumption, not blocking.

Two separate things hide behind "I want maps that show Entry":

1. **Rendering** a map with pins — cheap, no key needed.
2. **Place search** — typing "Daiso" and getting back real branches with real
   coordinates. This is the expensive half, and it's exactly what your Daiso example
   needs: *"There are many Daiso in Japan, whichever one works with the schedule."*

**What I assumed:** Leaflet + OpenStreetMap tiles for rendering (no API key, no billing,
app runs for anyone who clones it), and for search, **Nominatim** — OSM's free geocoder.
Nominatim will find "Daiso Kyoto" and return coordinates, but its coverage of small
businesses in Japan is patchier than Google's, and its usage policy caps you at one
request per second (fine for a personal app, not for a product).

You can also always drop a pin manually or paste coordinates, so nothing is blocked if
geocoding misses.

**Options:**

- **(a) Leaflet + OSM + Nominatim** — zero setup, free, patchy business coverage. *(current)*
- **(b) Google Maps + Places API** — much better Japanese business data, autocomplete,
  photos, opening hours (which would feed your "check opening time" todo nicely).
  Needs a billing-enabled API key from you. I'd keep the same `<MapView>` /
  `<PlaceSearch>` interfaces so this is a swap, not a rewrite.
- **(c) Mapbox** — nicer-looking maps, decent search, generous free tier, still needs a key.

If you want (b) or (c), drop the key in `backend/.env` as `MAPS_API_KEY` and say so
here — the swap is maybe an hour of work.

**Answer here:**

(a)

