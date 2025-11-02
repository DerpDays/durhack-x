import { useState } from 'react'
import { Chatbox } from '@talkjs/react-components'
import '@talkjs/react-components/default.css'
import './App.css'
import { summarizeWithOpenRouter, buildFallbackSummary } from './services/summarizeMessage.js'

const initialStudents = [
  {
    id: 'ava',
    name: 'Ava Chen',
    deskLabel: 'Front Row • Desk 1',
    conversationId: 'sample_conversation',
  },
  {
    id: 'liam',
    name: 'Liam Johnson',
    deskLabel: 'Front Row • Desk 2',
    conversationId: 'sample_conversation',
  },
  {
    id: 'maya',
    name: 'Maya Patel',
    deskLabel: 'Front Row • Desk 3',
    conversationId: 'sample_conversation',
  },
  {
    id: 'noah',
    name: 'Noah Williams',
    deskLabel: 'Back Row • Desk 1',
    conversationId: 'sample_conversation',
  },
  {
    id: 'sofia',
    name: 'Sofia Martinez',
    deskLabel: 'Back Row • Desk 2',
    conversationId: 'sample_conversation',
  },
  {
    id: 'elijah',
    name: 'Elijah Brown',
    deskLabel: 'Back Row • Desk 3',
    conversationId: 'sample_conversation',
  },
]

const TALKJS_APP_ID = 't4J5woDb'
const TALKJS_USER_ID = 'sample_user_alice'

function StudentDesk({ student, onStudentMessage }) {
  const handleSendMessage = (event) => {
    const text =
      event?.message?.text ??
      event?.message?.body ??
      (typeof event?.message === 'string' ? event.message : '')

    const senderId = event?.message?.senderId ?? event?.message?.sender?.id
    const senderName = event?.message?.senderName ?? event?.message?.sender?.name

    if (!text) return

    onStudentMessage({
      student,
      text,
      senderId,
      senderName,
      timestamp: Date.now(),
    })
  }

  return (
    <article className="desk">
      <header className="desk-header">
        <div className="student-name">{student.name}</div>
        <div className="desk-label">{student.deskLabel}</div>
      </header>
      <div className="desk-chatbox">
        <Chatbox
          host="durhack.talkjs.com"
          appId={TALKJS_APP_ID}
          userId={TALKJS_USER_ID}
          conversationId={student.conversationId}
          style={{ width: '100%', height: '100%' }}
          chatHeaderVisible={false}
          onSendMessage={handleSendMessage}
        />
      </div>
    </article>
  )
}

function App() {
  const students = initialStudents
  const [summaries, setSummaries] = useState([])

  const formatTime = (isoString) => {
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const updateSummaryItem = (id, updates) => {
    setSummaries((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    )
  }

  const handleStudentMessage = ({ student, text, senderId }) => {
    if (senderId && senderId === TALKJS_USER_ID) {
      return
    }

    const createdAt = new Date().toISOString()
    const placeholderId = `${student.id}-${Date.now()}`

    setSummaries((previous) => {
      const next = [
        {
          id: placeholderId,
          studentName: student.name,
          summary: 'Summarising message…',
          evaluation: 'Awaiting evaluation…',
          status: 'loading',
          source: 'pending',
          createdAt,
        },
        ...previous,
      ]
      return next.slice(0, 8)
    })

    summarizeWithOpenRouter({ text, studentName: student.name })
      .then(({ summary, evaluation, source, error }) => {
        updateSummaryItem(placeholderId, {
          summary,
          evaluation,
          status: source === 'openrouter' ? 'complete' : 'fallback',
          source,
          error,
        })
      })
      .catch((error) => {
        const fallback = buildFallbackSummary(text)
        updateSummaryItem(placeholderId, {
          summary: fallback.summary,
          evaluation: fallback.evaluation,
          status: 'error',
          source: 'fallback',
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }

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
            <StudentDesk key={student.id} student={student} onStudentMessage={handleStudentMessage} />
          ))}
        </section>
      </div>
      <section className="summary-panel" aria-live="polite">
        <div className="summary-panel__header">
          <h2>Teacher Summary Feed</h2>
          <span className="summary-panel__count">
            {summaries.length ? `${summaries.length} recent message${summaries.length === 1 ? '' : 's'}` : 'No recent summaries'}
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
                  <time className="summary-card__time">{formatTime(item.createdAt)}</time>
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
