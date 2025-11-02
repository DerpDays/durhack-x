const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet'

const systemPrompt = `You are a concise classroom assistant. You receive short chat messages sent from students to their teacher.
Summarise each message into a single sentence (max 30 words) and provide a short evaluation that tells the teacher how to react.
Return JSON with: summary (string), evaluation (string). Keep the tone neutral and professional.`

function buildFallbackSummary(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      summary: 'Empty message received.',
      evaluation: 'No action needed.',
    }
  }

  const summary = trimmed.length > 140 ? `${trimmed.slice(0, 137).trimEnd()}…` : trimmed

  let evaluation = 'General check-in.'
  const lowercase = trimmed.toLowerCase()

  if (trimmed.includes('?')) {
    evaluation = 'Requires teacher follow-up (question detected).'
  } else if (lowercase.includes('done') || lowercase.includes('complete')) {
    evaluation = 'Status update: student reports progress.'
  } else if (lowercase.includes('help') || lowercase.includes('stuck')) {
    evaluation = 'Student may need assistance.'
  } else if (lowercase.includes('late') || lowercase.includes('missing')) {
    evaluation = 'Potential issue flagged; monitor response.'
  }

  return { summary, evaluation }
}

export async function summarizeWithOpenRouter({ text, studentName }) {
  const fallback = buildFallbackSummary(text)
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY

  if (!apiKey) {
    return { ...fallback, source: 'fallback', error: 'Missing OpenRouter API key' }
  }

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Student name: ${studentName}\nMessage: ${text}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'student_summary',
        schema: {
          type: 'object',
          required: ['summary', 'evaluation'],
          properties: {
            summary: { type: 'string' },
            evaluation: { type: 'string' },
          },
        },
      },
    },
  }

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'HTTP-Referer': window?.location?.origin ?? 'http://localhost',
        'X-Title': 'Classroom Chat Summariser',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const reason = await response.text()
      return { ...fallback, source: 'fallback', error: `OpenRouter error: ${reason}` }
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content

    if (!content) {
      return { ...fallback, source: 'fallback', error: 'No content returned' }
    }

    let parsed
    if (typeof content === 'string') {
      try {
        parsed = JSON.parse(content)
      } catch {
        parsed = undefined
      }
    } else if (Array.isArray(content)) {
      const textChunk = content.find((chunk) => typeof chunk === 'string') ?? content[0]?.text
      if (textChunk) {
        try {
          parsed = JSON.parse(textChunk)
        } catch {
          parsed = undefined
        }
      }
    } else if (content?.text) {
      try {
        parsed = JSON.parse(content.text)
      } catch {
        parsed = undefined
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { ...fallback, source: 'fallback', error: 'Unable to parse OpenRouter response' }
    }

    return {
      summary: parsed.summary?.trim() || fallback.summary,
      evaluation: parsed.evaluation?.trim() || fallback.evaluation,
      source: 'openrouter',
    }
  } catch (error) {
    return { ...fallback, source: 'fallback', error: error instanceof Error ? error.message : String(error) }
  }
}

export { buildFallbackSummary }
