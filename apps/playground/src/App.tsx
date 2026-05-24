import { XflipCard, type XflipCardElement } from '@xflip/react';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_SRC = '/sample.xflip';

export function App(): JSX.Element {
  const [src, setSrc] = useState<string>(DEFAULT_SRC);
  const [tiltMax, setTiltMax] = useState<number>(14);
  const cardRef = useRef<XflipCardElement | null>(null);

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
        <XflipCard ref={cardRef} src={src} tiltMax={tiltMax} />
      </section>

      <aside className="panel">
        <h1>xflip</h1>
        <p className="muted">flip card with built-in holographic sheen</p>

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
      </aside>
    </main>
  );
}
