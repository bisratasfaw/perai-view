import { useEffect, useRef } from 'react'
import { ExternalLink, TriangleAlert, X } from 'lucide-react'
import { REPO_URL } from '@/config'
import type { DataSource } from '@/data/types'
import { useAppStore } from '@/store'
import { useRealData } from '@/data/realData'
import { ClassifierDemo } from './ClassifierDemo'

const TECH = ['React 18', 'TypeScript', 'CesiumJS', 'Zustand', 'Vite', 'Node.js + Express', 'WebSockets', 'Zod', 'FastAPI', 'scikit-learn', 'Vitest', 'Playwright']

export function AboutDialog({ source: dataSource }: { source: DataSource | null }) {
  const open = useAppStore((s) => s.aboutOpen)
  const setOpen = useAppStore((s) => s.setAboutOpen)
  const source = useAppStore((s) => s.source)
  const ref = useRef<HTMLDialogElement>(null)
  const manifest = useRealData('manifest', open)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="about-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        // Close when the backdrop (the dialog element itself) is clicked.
        if (e.target === ref.current) setOpen(false)
      }}
    >
      <div className="dialog-inner">
        <header>
          <h2 id="about-title">About PerAI View</h2>
          <button type="button" className="btn icon-btn btn-ghost" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="notice" role="note">
          <TriangleAlert size={20} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
          <p>
            <strong>All data on this site is simulated.</strong> No real usage data is collected, tracked or shown. The
            numbers show what a live map of AI-assistant activity could look like.
          </p>
        </div>

        <p>
          PerAI View is an open-source portfolio project: an interactive 3D globe showing where people use AI assistants,
          what for, and how activity moves around the planet with the sun.
        </p>

        <section>
          <h3>How the data is generated</h3>
          <ul>
            <li>241 cities have an illustrative activity level and a leading assistant.</li>
            <li>Activity follows each city's local time of day, so the sunlit side of the planet is busiest.</li>
            <li>Live events are drawn at random from cities weighted by how busy they are right now.</li>
            <li>
              {source === 'api'
                ? 'This page gets its data from the PerAI Node.js API, which runs the simulation; the static demo runs the same code in the browser.'
                : 'The same simulation runs directly in your browser, so the demo works without a server.'}
            </li>
          </ul>
        </section>

        {open && <ClassifierDemo source={dataSource} />}

        <section>
          <h3>Built with</h3>
          <ul className="tech">
            {TECH.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Real data sources</h3>
          <p>
            The "Real data" layers and analytics tab use published, free datasets, fetched by a nightly GitHub Action and
            shipped with the site. Nothing about individual people is collected.
          </p>
          {manifest.status === 'ready' ? (
            <ul className="source-list">
              {Object.values(manifest.data.sources).map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                  <span className="source-meta">
                    {s.publisher} · {s.license}
                    {s.as_of ? ` · ${s.as_of}` : ''}
                    {s.status === 'ok' ? '' : ` · ${s.status.replace('_', ' ')}`}
                  </span>
                  <span className="source-desc">{s.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">{manifest.status === 'error' ? `Snapshots unavailable: ${manifest.error}` : 'Loading sources…'}</p>
          )}
        </section>

        <section>
          <h3>Credits</h3>
          <p>
            Earth imagery: NASA Global Imagery Browse Services (GIBS), Blue Marble and VIIRS Black Marble. Borders: Natural
            Earth via world-atlas. Globe engine: CesiumJS.
          </p>
        </section>

        <div className="dialog-actions">
          <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Source code on GitHub
          </a>
        </div>
      </div>
    </dialog>
  )
}
