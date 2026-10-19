# MFD exercise catalogue

Version 0.3.0: 1,064 immutable exercise IDs, grouped into 300 families.

Public catalogue and media live under `dist/catalogue/`. Only public generated outputs
from the supplied catalogue package are included. Personal Hevy links belong in the
owner's private workspace (`mfdExerciseLinks`), never these files. Custom exercises
are stored in each private workspace; older catalogue contributions are protected by
creator-only SELECT RLS for exercise rows. Foods remain shared.

`runtime.ts` fetches/indexes the catalogue once. The app shell does not prefetch its
media or JSON; the service worker caches these public assets after use. Exercise
IDs are attached to existing logs without changing measurements or raw imports.
Exact links migrate automatically; fuzzy matches require confirmation during import.
The compatibility adapter also resolves old records when reading backups.

Do not rename/reuse IDs. Updates must retain previously published IDs or provide
explicit redirects, then run `npm run test:performance`, TypeScript checks and the
Sites build helper. The included catalogue is draft/imported, not professionally
verified; source/review information is accessible in the guide.

Photographs: Free Exercise DB (public domain), with source links from each exercise.
Other media credits/licenses are preserved verbatim in the catalogue metadata.
