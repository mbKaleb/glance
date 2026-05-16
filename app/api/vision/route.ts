import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PROMPT_ANALYZE =
  'Look at this camera frame. Identify what is being asked, shown, or needs solving. ' +
  'Produce a complete, accurate answer.';

const PROMPT_FORMAT =
  'Now output ONLY the answer in exactly the form the question or context demands. ' +
  'If it is a number, output just the number. If a word, just the word. If a sentence, just the sentence. ' +
  'No labels, no explanation, no punctuation beyond what the answer itself requires.';

function extractText(data: { content: Array<{ type: string; text?: string }> }): string {
  return data.content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim();
}

async function callClaude(key: string, messages: object[]): Promise<Response> {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 300,
      messages,
    }),
  });
}

export async function POST(req: NextRequest) {
  let body: { key?: string; image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { key, image } = body;
  if (!key || !image) {
    return NextResponse.json({ error: 'Missing key or image' }, { status: 400 });
  }

  // Pass 1: analyze the image
  const r1 = await callClaude(key, [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: PROMPT_ANALYZE },
      ],
    },
  ]);

  if (!r1.ok) {
    let detail = '';
    try { const j = await r1.json(); detail = j?.error?.message || JSON.stringify(j).slice(0, 200); }
    catch { detail = await r1.text(); }
    return NextResponse.json({ error: detail }, { status: r1.status });
  }

  const d1 = await r1.json();
  const analysis = extractText(d1);

  // Pass 2: reformat into exact answer only
  const r2 = await callClaude(key, [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: PROMPT_ANALYZE },
      ],
    },
    { role: 'assistant', content: analysis },
    { role: 'user', content: PROMPT_FORMAT },
  ]);

  if (!r2.ok) {
    let detail = '';
    try { const j = await r2.json(); detail = j?.error?.message || JSON.stringify(j).slice(0, 200); }
    catch { detail = await r2.text(); }
    return NextResponse.json({ error: detail }, { status: r2.status });
  }

  const d2 = await r2.json();
  return NextResponse.json({ text: extractText(d2) });
}
