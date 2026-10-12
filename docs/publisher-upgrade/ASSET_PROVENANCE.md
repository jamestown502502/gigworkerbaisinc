# Side Hustle City: asset provenance register

Started 2026-10-12 (publisher polish). One row per asset family. **AI status** is stated plainly
because publishers ask (Steam's content survey covers player-facing AI art, music and text) and
several target publishers exclude generative AI. Funding plan: every row marked
"replace when funded" is commissioned from human artists/musicians, with contracts and credit.

| Asset family | Where | Count | Source | AI status | Plan |
|---|---|---|---|---|---|
| Key-art banner | `public/brand/banner-960.webp`, `banner-1600.webp`, `og-image.jpg` | 1 image, 3 exports | Supplied by BAIS 2026-10-12 ("Side Hustle City: Golden Hour Dreams") | AI-generated (supplied) | Replace when funded (blueprint SHC-04) |
| Wordmark (logo) | `public/brand/wordmark.webp` | 1 | Cut out of the banner with rembg (isnet), small streaks removed, alpha checked: corners transparent, 2.2% soft edge | AI-generated (derived) | Replace with a human-drawn logo when funded |
| Margin backdrop | `public/brand/backdrop.webp` | 1 | Banner downscaled to 64x32, blurred and darkened at build time | AI-generated (derived, unreadable at that size) | Regenerate from human key art |
| App icons, favicon | `public/icons/*`, `public/brand/favicon-48.png` | 5 | Supplied BAIS app icon (2026-10-10), cropped inside its rounded corners | AI-generated (supplied) | Replace when funded |
| Scene paintings, character, props, icons | `public/media/**` | 14 + 13 props | Image generation pipeline (FLUX tier per `src/assets/manifest.js`, later Gemini) | AI-generated | Replace when funded (blueprint SHC-04 slice first) |
| Background music | `public/audio/*.mp3` | 4 | Generated lo-fi tracks (see HANDOFF.md) | AI-generated | Replace with commissioned music when funded |
| Sound effects | `src/engine/audio.js` | code | Web Audio synthesis in code | Not AI-generated media | Keep |
| UI, HUD, minigames, effects | `src/ui/*`, `src/game/*` | code | Code-drawn on the canvas | Not AI-generated media | Keep |
| Story, dialogue, lessons | `src/game/*.js` | text | Written with Claude assistance, reviewed by BAIS | AI-assisted text | Human narrative pass when funded |
