# Asset provenance and reproduction

The four screenshots and the 106-second MP4 show real interactions with the locally served GitHub Pages static export. The MP4 is silent and includes an explicit demo-guide caption overlay. It shows published results, not a live Python solve or a recording of the external website domain. No synthetic product interface was used.

The cover is 1600 × 900 pixels, 409,029 bytes when first generated, below the BoardingPass 2 MB limit. It combines project typography and a real interface screenshot. The brief is one A4 page; the pitch is six 16:9 slides. The HTML files retain editable source layouts.

To regenerate, use Python 3.12, Node.js 22+, system Chromium at `/usr/bin/chromium`, ffmpeg, the application's Python dependencies, and `npm ci --prefix e2e`. From the repository root:

```bash
.venv/bin/python scripts/build_pages_data.py
NEXT_PUBLIC_STATIC_DEMO=true NEXT_PUBLIC_BASE_PATH=/SAF-Anthropic-Hackathon npm --prefix apps/web run build
node scripts/submission/capture.mjs
node scripts/submission/build-briefs.mjs
```

The capture/renderer scripts start and stop local-only servers on ports 3003/3004. Keep those ports free. They do not log into or submit to BoardingPass. Numeric examples are read from the actual generated dataset; solver-tolerance differences can change the precise example cost between builds.

Review `OWNER_NOTES.md` and the event's actual rules before submitting. If human narration is required, add it using the supplied demo script; do not describe the silent recording as narrated.
