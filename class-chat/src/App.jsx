import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import './App.css'
import { summarizeWithOpenRouter, buildFallbackSummary } from './services/summarizeMessage.js'

const initialStudents = [
  {
    id: 'ava',
    name: 'Ava Chen',
    deskLabel: 'Front Row • Desk 1',
  },
  {
    id: 'liam',
    name: 'Liam Johnson',
    deskLabel: 'Front Row • Desk 2',
  },
  {
    id: 'maya',
    name: 'Maya Patel',
    deskLabel: 'Front Row • Desk 3',
  },
  {
    id: 'noah',
    name: 'Noah Williams',
    deskLabel: 'Back Row • Desk 1',
  },
  {
    id: 'sofia',
    name: 'Sofia Martinez',
    deskLabel: 'Back Row • Desk 2',
  },
  {
    id: 'elijah',
    name: 'Elijah Brown',
    deskLabel: 'Back Row • Desk 3',
  },
]

const teacherName = 'Ms. Alice Johnson'

const studentProfiles = {
  ava: {
    subject: 'biology',
    project: 'plant growth experiment',
    strengths: ['observation', 'note-taking'],
    tone: 'upbeat',
    hobby: 'sketching lab setups',
  },
  liam: {
    subject: 'robotics',
    project: 'line-following bot',
    strengths: ['debugging', 'soldering'],
    tone: 'casual',
    hobby: 'speedcubing',
  },
  maya: {
    subject: 'creative writing',
    project: 'short story anthology',
    strengths: ['editing', 'story structure'],
    tone: 'reflective',
    hobby: 'journaling',
  },
  noah: {
    subject: 'algebra',
    project: 'probability game',
    strengths: ['data tables', 'figures'],
    tone: 'matter-of-fact',
    hobby: 'pickup basketball',
  },
  sofia: {
    subject: 'history',
    project: 'oral history podcast',
    strengths: ['interviewing', 'scripting'],
    tone: 'warm',
    hobby: 'photography',
  },
  elijah: {
    subject: 'environmental science',
    project: 'recycling awareness campaign',
    strengths: ['presentations', 'organising'],
    tone: 'enthusiastic',
    hobby: 'cycling',
  },
}

const GENERIC_REPLIES = [
  'Sounds good—thanks for the reminder!',
  "Got it, I'll keep you posted.",
  'Will do, thanks for checking in!',
  'Understood! I’ll jump on that now.',
]

const QUESTION_REPLIES = [
  "I'll look into that and report back soon.",
  'Let me double-check and send you an update shortly.',
  'Thanks for the question! I’ll follow up with an answer.',
]

const STATUS_REPLIES = [
  'Progress is on track so far!',
  "I’ve wrapped up my current task and I’m moving to the next part.",
  'I’m about halfway there—should finish soon.',
  'Everything is going smoothly on my end.',
]

const HELP_REPLIES = [
  'I’m a bit stuck—could we review this together later?',
  'A quick pointer would help me get unstuck.',
  'I tried a few ideas but could use a hint, please.',
]

const THANKS_REPLIES = [
  'Thanks, appreciate it!',
  'Thanks for the encouragement!',
  'Thanks, that helps a lot!',
]

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function detectIntent(text) {
  const lower = text.toLowerCase()
  return {
    isGreeting: /\b(hi|hello|hey|morning|afternoon)\b/.test(lower),
    isThanks: lower.includes('thank'),
    asksProgress:
      /\b(status|progress|update|check-in|how.*going|where.*at|finished|done|wrap|timeline)\b/.test(lower),
    offersHelp: /\b(help|assist|support|need anything|stuck|clarify|question)\b/.test(lower),
    mentionsDeadline: /\b(due|deadline|by tomorrow|end of day|friday|tonight)\b/.test(lower),
    mentionsMeeting: /\b(meet|check in|sync|touch base|swing by|stop by)\b/.test(lower),
    asksQuestion: lower.includes('?'),
  }
}

function describeProgress(traits) {
  const phases = [
    `I'm polishing the ${traits.project} notes now.`,
    `I just wrapped a solid draft of the ${traits.project}.`,
    `I compared results and the ${traits.project} is finally taking shape.`,
    `I need one more trial for the ${traits.project}, then I'll chart everything.`,
  ]
  return pickRandom(phases)
}

function describeHelpRequest(traits) {
  const needs = [
    `Could you double-check the rubric for the ${traits.project}? I want to be sure I'm hitting the right targets.`,
    `Can you take a quick look at my ${traits.project} outline? I think it's close but I'm unsure about the intro.`,
    `I'm stuck deciding how to present the ${traits.project}. Maybe we can brainstorm a better format?`,
  ]
  return pickRandom(needs)
}

function generateStudentReply({ prompt, student, history }) {
  const trimmed = prompt.trim()
  if (!trimmed) {
    return null
  }

  const intent = detectIntent(trimmed)
  const traits = studentProfiles[student.id] ?? {
    subject: 'class project',
    project: 'project draft',
    strengths: ['research'],
    tone: 'friendly',
    hobby: 'studying',
  }

  const studentName = student.name.split(' ')[0]
  const priorStudentMessages = history.filter((message) => message.author === 'student')
  const firstInteraction = priorStudentMessages.length === 0

  if (intent.isThanks) {
    return `${pickRandom(THANKS_REPLIES)} I appreciate the support, ${teacherName.split(' ')[0]}!`
  }

  if (intent.isGreeting && firstInteraction) {
    return `Hi! ${studentName} here—I'm deep into the ${traits.project} for ${traits.subject}.`
  }

  if (intent.asksProgress) {
    const detail = describeProgress(traits)
    if (intent.mentionsDeadline) {
      return `${detail} I'm confident about the deadline; I pencilled the final pass for tomorrow after study hall.`
    }
    return `${detail} Next, I'll use my ${pickRandom(traits.strengths)} skills to tidy up the final bits.`
  }

  if (intent.offersHelp) {
    return `${describeHelpRequest(traits)} I'd love a quick check-in when you have a few minutes.`
  }

  if (intent.mentionsMeeting) {
    return `Meeting works for me. I can swing by after lunch to walk you through the latest on the ${traits.project}.`
  }

  if (intent.mentionsDeadline) {
    return `Deadline noted. I've broken the ${traits.project} into smaller chunks, so I'm pacing myself to finish on time.`
  }

  if (intent.asksQuestion) {
    return `${pickRandom(QUESTION_REPLIES)} I’ll jot down whatever comes up while I keep pushing on the ${traits.project}.`
  }

  if (trimmed.length < 40 && firstInteraction) {
    return `All good here! I'm settling into the ${traits.project} and using my ${pickRandom(traits.strengths)} skills to keep things tidy.`
  }

  if (trimmed.length > 140) {
    return `Thanks for the detailed note. I'll pull out the key steps for the ${traits.project} and follow them point by point.`
  }

  const casual = [
    `${pickRandom(GENERIC_REPLIES)} I'll keep weaving in fresh ideas for the ${traits.project}.`,
    `Copy that! I'll update you once I've tried a new angle on the ${traits.project}.`,
    `Understood! I'm mixing in some notes from ${traits.hobby} to keep the ${traits.project} engaging.`,
  ]
  return pickRandom(casual)
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function formatClockTime(isoString) {
  if (!isoString) {
    return ''
  }

  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StudentDesk({ student, messages, onSendMessage }) {
  const [draft, setDraft] = useState('')
  const historyRef = useRef(null)

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [messages.length])

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }
    onSendMessage(trimmed)
    setDraft('')
  }

  const studentNickname = student.name.split(' ')[0]

  return (
    <article className="desk">
      <header className="desk-header">
        <div className="student-name">{student.name}</div>
        <div className="desk-label">{student.deskLabel}</div>
      </header>
      <div className="desk-chatbox">
        <div className="chat-history" ref={historyRef}>
          {messages.length === 0 ? (
            <p className="chat-history__empty">No messages yet. Send a quick hello to get things started.</p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`chat-message chat-message--${message.author}`}>
                <div className="chat-message__meta">
                  <span className="chat-message__author">
                    {message.author === 'teacher' ? 'You' : studentNickname}
                  </span>
                  <time className="chat-message__time">{formatClockTime(message.createdAt)}</time>
                </div>
                <div className="chat-message__bubble">{message.text}</div>
              </div>
            ))
          )}
        </div>
        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${studentNickname}...`}
            aria-label={`Send a message to ${student.name}`}
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </article>
  )
}

function App() {
  const students = useMemo(() => initialStudents, [])
  const [messagesByStudent, setMessagesByStudent] = useState(() =>
    Object.fromEntries(students.map((student) => [student.id, []])),
  )
  const [summaries, setSummaries] = useState([])
  const pendingRepliesRef = useRef(new Map())

  useEffect(() => {
    return () => {
      pendingRepliesRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      pendingRepliesRef.current.clear()
    }
  }, [])

  const appendMessage = useCallback((studentId, message) => {
    setMessagesByStudent((previous) => {
      const next = { ...previous }
      const existing = next[studentId] ?? []
      next[studentId] = [...existing, message]
      return next
    })
  }, [])

  const updateSummaryItem = useCallback((id, updates) => {
    setSummaries((previous) => previous.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }, [])

  const handleStudentMessage = useCallback(
    ({ student, message }) => {
      const trimmed = message.text?.trim()
      if (!trimmed) {
        return
      }

      const summaryId = message.id
      setSummaries((previous) => {
        const next = [
          {
            id: summaryId,
            studentName: student.name,
            summary: 'Summarising message…',
            evaluation: 'Awaiting evaluation…',
            status: 'loading',
            source: 'pending',
            createdAt: message.createdAt,
          },
          ...previous,
        ]
        return next.slice(0, 8)
      })

      summarizeWithOpenRouter({ text: trimmed, studentName: student.name })
        .then(({ summary, evaluation, source, error }) => {
          updateSummaryItem(summaryId, {
            summary,
            evaluation,
            status: source === 'openrouter' ? 'complete' : 'fallback',
            source,
            error,
          })
        })
        .catch((error) => {
          const fallback = buildFallbackSummary(trimmed)
          updateSummaryItem(summaryId, {
            summary: fallback.summary,
            evaluation: fallback.evaluation,
            status: 'error',
            source: 'fallback',
            error: error instanceof Error ? error.message : String(error),
          })
        })
    },
    [updateSummaryItem],
  )

  const handleTeacherSend = useCallback(
    (student, rawText) => {
      const trimmed = rawText.trim()
      if (!trimmed) {
        return
      }

      const createdAt = new Date().toISOString()
      const teacherMessage = {
        id: `teacher-${student.id}-${Date.now()}`,
        author: 'teacher',
        text: trimmed,
        createdAt,
      }

      const existingHistory = messagesByStudent[student.id] ?? []
      const projectedHistory = [...existingHistory, teacherMessage]

      appendMessage(student.id, teacherMessage)

      const key = `${student.id}-${teacherMessage.id}`
      const delay = randomBetween(900, 2200)
      const timeoutId = window.setTimeout(() => {
        pendingRepliesRef.current.delete(key)
        const replyText =
          generateStudentReply({ prompt: trimmed, student, history: projectedHistory }) ??
          'Thanks for the update!'
        const studentMessage = {
          id: `student-${student.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          author: 'student',
          text: replyText,
          createdAt: new Date().toISOString(),
        }
        appendMessage(student.id, studentMessage)
        handleStudentMessage({ student, message: studentMessage })
      }, delay)

      pendingRepliesRef.current.set(key, timeoutId)
    },
    [appendMessage, handleStudentMessage, messagesByStudent],
  )

  return (
    <>
      <div className="classroom">
        <section className="chalkboard">
          <div className="chalkboard-frame" aria-hidden="true" />
          <div className="chalkboard-surface">
            <h1>Room 101 Class Chat</h1>
            <p>
              Share quick updates with your classmates. Keep it respectful, stay on task, and
              check the agenda before the bell!
            </p>
            <p className="chalkboard-note">Teacher on duty: {teacherName}</p>
            <div className="class-agenda">
              <span className="agenda-title">Agenda</span>
              <ul>
                <li>Warm-up question</li>
                <li>Project stand-ups</li>
                <li>Homework check-in</li>
              </ul>
            </div>
          </div>
        </section>
        <section className="desk-grid" aria-label="Student desks">
          {students.map((student) => (
            <StudentDesk
              key={student.id}
              student={student}
              messages={messagesByStudent[student.id] ?? []}
              onSendMessage={(text) => handleTeacherSend(student, text)}
            />
          ))}
        </section>
      </div>
      <section className="summary-panel" aria-live="polite">
        <div className="summary-panel__header">
          <h2>Teacher Summary Feed</h2>
          <span className="summary-panel__count">
            {summaries.length
              ? `${summaries.length} recent message${summaries.length === 1 ? '' : 's'}`
              : 'No recent summaries'}
          </span>
        </div>
        <div className="summary-panel__list">
          {summaries.length === 0 ? (
            <p className="summary-panel__empty">
              Student summaries will appear here once new messages come in.
            </p>
          ) : (
            summaries.map((item) => (
              <article key={item.id} className={`summary-card summary-card--${item.status ?? 'complete'}`}>
                <header className="summary-card__header">
                  <span className="summary-card__student">{item.studentName}</span>
                  <time className="summary-card__time">{formatClockTime(item.createdAt)}</time>
                </header>
                <span className={`summary-card__badge summary-card__badge--${item.status ?? 'complete'}`}>
                  {item.status === 'loading'
                    ? 'Generating summary…'
                    : item.status === 'error'
                      ? 'Fallback summary (error)'
                      : item.status === 'fallback'
                        ? 'Heuristic summary'
                        : 'AI summary'}
                </span>
                <p className="summary-card__summary">{item.summary}</p>
                <p className="summary-card__evaluation">{item.evaluation}</p>
                {item.error && (
                  <p className="summary-card__error" role="note">
                    {item.error}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </>
  )
}

export default App
