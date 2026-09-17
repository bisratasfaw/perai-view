import { useState, type FormEvent } from 'react'
import { activityTypeLabel } from '@shared/programs'
import type { ClassificationResult, DataSource } from '@/data/types'
import { formatPercent } from '@/utils/format'

const EXAMPLES = [
  'Why does my Python script throw a KeyError when reading this JSON?',
  'Turn these meeting notes into five short bullet points',
  'How do I say "where is the train station" in Japanese?',
]

const MAX_LENGTH = 2000

export function ClassifierDemo({ source }: { source: DataSource | null }) {
  const [text, setText] = useState(EXAMPLES[0])
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!source || !trimmed) return
    setBusy(true)
    setError(null)
    try {
      setResult(await source.classify(trimmed.slice(0, MAX_LENGTH)))
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Classification failed.')
    } finally {
      setBusy(false)
    }
  }

  const topScores = result
    ? Object.entries(result.scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : []

  return (
    <section aria-labelledby="classifier-title" className="classifier">
      <h3 id="classifier-title">Try the activity classifier</h3>
      <p>Type something you might ask an AI assistant. The classifier guesses which kind of activity it is.</p>
      <form onSubmit={submit} className="classifier-form">
        <label htmlFor="classifier-input" className="sr-only">
          Prompt to classify
        </label>
        <textarea
          id="classifier-input"
          value={text}
          maxLength={MAX_LENGTH}
          rows={3}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="classifier-actions">
          <button type="submit" className="btn" disabled={busy || !text.trim() || !source}>
            {busy ? 'Classifying…' : 'Classify'}
          </button>
          <div className="classifier-examples" role="group" aria-label="Example prompts">
            {EXAMPLES.map((example, i) => (
              <button key={example} type="button" className="link-btn" onClick={() => setText(example)}>
                Example {i + 1}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="classifier-error">
            {error}
          </p>
        )}
        {result && (
          <div className="classifier-result">
            <p>
              <strong>{activityTypeLabel(result.activity_type)}</strong> · {formatPercent(result.confidence * 100)} confidence
            </p>
            <ul className="bar-list">
              {topScores.map(([label, score]) => (
                <li key={label} className="bar-row">
                  <div className="bar-meta">
                    <span className="name">{activityTypeLabel(label)}</span>
                    <span className="value num">{formatPercent(score * 100)}</span>
                  </div>
                  <div className="bar-track" aria-hidden="true">
                    <div className="bar-fill" style={{ width: `${score * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="panel-note">
              {result.source === 'model'
                ? `Answered by the scikit-learn model (${result.model_version}) behind the PerAI API.`
                : source?.kind === 'api'
                  ? "The ML service didn't respond, so the API's keyword matcher answered instead."
                  : 'This static demo has no server, so a simple keyword matcher answered. Run the full stack to use the scikit-learn model.'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
