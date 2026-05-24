import { useXflip, XflipCard, type XflipCardElement } from '@xflip/react';
import { useEffect, useRef, useState } from 'react';

const SAMPLES = [{ label: 'Flat (blue / red)', src: '/sample.xflip' }] as const;

export function App(): JSX.Element {
  const [src, setSrc] = useState<string>(SAMPLES[0].src);
  const [tiltMax, setTiltMax] = useState<number>(14);
  const [lastEvent, setLastEvent] = useState<string>('—');
  const cardRef = useRef<XflipCardElement | null>(null);

  const { file, error, status } = useXflip(src);

  // Revoke object URLs created from the file input on unmount / replacement.
  const lastBlobUrl = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
    };
  }, []);

  function onPickFile(ev: React.ChangeEvent<HTMLInputElement>): void {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
    const url = URL.createObjectURL(file);
    lastBlobUrl.current = url;
    setSrc(url);
  }

  return (
    <main className="layout">
      <section className="stage">
        <XflipCard
          ref={cardRef}
          src={src}
          tiltMax={tiltMax}
          onLoad={(f) =>
            setLastEvent(
              `load · v${f.versionMajor}.${f.versionMinor} · ${f.head.width}×${f.head.height}`,
            )
          }
          onError={(err) => setLastEvent(`error · ${err.message}`)}
        />
      </section>

      <aside className="panel">
        <h1>xflip playground</h1>

        <div className="group">
          <label htmlFor="sample">Sample</label>
          <select
            id="sample"
            value={SAMPLES.some((s) => s.src === src) ? src : ''}
            onChange={(ev) => setSrc(ev.target.value)}
          >
            {SAMPLES.map((s) => (
              <option key={s.src} value={s.src}>
                {s.label}
              </option>
            ))}
            {!SAMPLES.some((s) => s.src === src) ? (
              <option value={src}>Custom (uploaded)</option>
            ) : null}
          </select>
        </div>

        <div className="group">
          <label htmlFor="upload">Upload .xflip</label>
          <input id="upload" type="file" accept=".xflip" onChange={onPickFile} />
        </div>

        <div className="group">
          <label htmlFor="tilt">Tilt max ({tiltMax}°)</label>
          <input
            id="tilt"
            type="range"
            min={0}
            max={30}
            step={1}
            value={tiltMax}
            onChange={(ev) => setTiltMax(Number(ev.target.value))}
          />
        </div>

        <div className="group buttons">
          <button type="button" onClick={() => cardRef.current?.toggleFace()}>
            Flip
          </button>
          <button type="button" onClick={() => cardRef.current?.enableGyroscope()}>
            Enable gyroscope
          </button>
        </div>

        <hr />

        <dl className="meta">
          <dt>useXflip status</dt>
          <dd>
            <span className={`pill pill-${status}`}>{status}</span>
          </dd>
          <dt>Last event</dt>
          <dd>{lastEvent}</dd>
          <dt>Decoded</dt>
          <dd>
            {status === 'success' && file ? (
              <pre className="json">
                {JSON.stringify(
                  {
                    version: `${file.versionMajor}.${file.versionMinor}`,
                    head: file.head,
                    frontLayers: file.frontLayers?.layers.length ?? 0,
                    backLayers: file.backLayers?.layers.length ?? 0,
                    effects: file.effects ?? null,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : status === 'error' ? (
              <span className="error">{error?.message}</span>
            ) : (
              <span className="muted">{status === 'loading' ? 'fetching…' : '—'}</span>
            )}
          </dd>
        </dl>
      </aside>
    </main>
  );
}
