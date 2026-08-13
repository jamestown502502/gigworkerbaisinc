// Usage: node scripts/generate-image.mjs "<prompt>" <output-file.jpg> [reference-image.jpg]
// Requires GEMINI_API_KEY in the environment.
const [, , prompt, outPath, refPath] = process.argv;

if (!prompt || !outPath) {
  console.error('Usage: node scripts/generate-image.mjs "<prompt>" <output-file.jpg> [reference-image.jpg]');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set');
  process.exit(1);
}

const fs = await import('node:fs');

const parts = [];
if (refPath) {
  const refBytes = fs.readFileSync(refPath);
  const mimeType = refPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  parts.push({ inlineData: { mimeType, data: refBytes.toString('base64') } });
}
parts.push({ text: prompt });

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  }
);

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) {
  console.error('No image returned:', JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
console.log('saved', outPath);
