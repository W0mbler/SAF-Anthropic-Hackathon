# Data provenance

The application uses the source files supplied to this repository on 31 October 2026. This is a repository receipt date, not a claim about the datasets' original publication dates.

| Asset | Source and treatment | Rights / limitations |
| --- | --- | --- |
| `kalimantan_80_locations_6800kt_full_range.csv` | User-uploaded hackathon challenge file; all seven fields and original identifiers retained; loader validates 80 unique rows and 6,800 kt aggregate supply | Organiser-provided; redistribution permission not established |
| `airports.dat` | User-uploaded airport database; application selects only the four Indonesian IATA codes PNK, PKN, BPN and TRK | Resembles OpenFlights data; verify exact provenance and ODbL/database-content obligations at https://openflights.org/data before redistribution |
| Candidate sites | Deterministic group median-nearest and peak-output screen of the supplied biomass coordinates | Geographic reference points; no land ownership, siting, protected-area or construction permission validation |
| Airport demands and mass yield | User-editable model assumptions; baseline 60/30/90/30 kt and 20% mass yield | Illustrative, not observed demand or a process guarantee |
| Distances | Haversine great-circle geometry with explicit user multiplier | Straight-line proxy; no verified road routes, truck access or travel times |
| `SAF_COMMAND_hackathon_strategy_and_codex.zip` | Original uploaded specification, reference model and illustrative outputs retained unchanged | Not evidence that the proposed services already existed; bundled example outputs are illustrative |

New application code is MIT-licensed separately. The MIT licence does not cover these datasets or grant rights the original data owners have not granted.

The local spatial visualisation does not depend on paid tiles or an external road-routing service. Coordinate-grid/schematic fallback is not an OpenStreetMap basemap and must not be presented as verified geography. If a future deployment adds OpenStreetMap or other basemap tiles, retain provider attribution and comply with its usage policy and data licence.
