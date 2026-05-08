import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const PROMPT =
  'Look at this camera frame. If a question, problem, or text is visible, answer it directly. ' +
  'Otherwise, describe the most useful or interesting observation about what is shown. ' +
  'One or two short sentences. No preamble. No "I see" or "this image shows". Just the answer.';

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

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!upstream.ok) {
    let detail = '';
    try {
      const j = await upstream.json();
      detail = j?.error?.message || JSON.stringify(j).slice(0, 200);
    } catch {
      detail = await upstream.text();
    }
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }

  const data = await upstream.json();
  const text = (data.content as Array<{ type: string; text?: string }>)
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim();

  return NextResponse.json({ text });
}
