import { XflipCard } from '@xflip/react';
import { useEffect, useMemo, useState } from 'react';

type Rarity = 'r' | 'sr' | 'ssr' | 'ur';

interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  rarityLabel: string;
  rate: number;
  src: string;
}

type Phase = 'home' | 'opening' | 'reveal' | 'summary' | 'collection';

const RARITY_ORDER: Record<Rarity, number> = { r: 0, sr: 1, ssr: 2, ur: 3 };
const PACK_SIZE = 6;
const STORAGE_KEY = 'xflip-gacha-collection';
const BACK_SRC = 'gacha/back.jpg';

function loadCollection(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveCollection(c: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore quota / unavailable */
  }
}

function pickRarity(rates: { rarity: Rarity; rate: number }[]): Rarity {
  const total = rates.reduce((a, x) => a + x.rate, 0);
  let r = Math.random() * total;
  for (const x of rates) {
    r -= x.rate;
    if (r <= 0) return x.rarity;
  }
  return rates[rates.length - 1]?.rarity ?? 'r';
}

function drawPack(pool: CardDef[]): CardDef[] {
  const first = pool[0];
  if (!first) return [];

  const byRarity = new Map<Rarity, CardDef[]>();
  for (const c of pool) {
    const arr = byRarity.get(c.rarity) ?? [];
    arr.push(c);
    byRarity.set(c.rarity, arr);
  }
  const rates = [...byRarity.entries()].map(([rarity, arr]) => ({
    rarity,
    rate: arr[0]?.rate ?? 0,
  }));

  const drawOne = (rarity: Rarity): CardDef => {
    const arr = byRarity.get(rarity) ?? [];
    return arr[Math.floor(Math.random() * arr.length)] ?? first;
  };

  const cards: CardDef[] = [];
  for (let i = 0; i < PACK_SIZE; i++) cards.push(drawOne(pickRarity(rates)));

  // Pity: guarantee at least one SR+ per pack.
  if (!cards.some((c) => RARITY_ORDER[c.rarity] >= 1)) {
    const srPlus = rates.filter((x) => RARITY_ORDER[x.rarity] >= 1);
    if (srPlus.length) cards[PACK_SIZE - 1] = drawOne(pickRarity(srPlus));
  }
  return cards;
}

export function App(): JSX.Element {
  const [pool, setPool] = useState<CardDef[]>([]);
  const [phase, setPhase] = useState<Phase>('home');
  const [pack, setPack] = useState<{ card: CardDef; uid: string }[]>([]);
  const [index, setIndex] = useState(0); // current card in the deck
  const [flipped, setFlipped] = useState(false); // current card revealed?
  const [exiting, setExiting] = useState(false); // current card sliding away?
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [detail, setDetail] = useState<CardDef | null>(null);

  useEffect(() => {
    setCollection(loadCollection());
    fetch('gacha/manifest.json')
      .then((r) => r.json())
      .then((data: CardDef[]) => setPool(data))
      .catch(() => setPool([]));
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, CardDef>();
    for (const c of pool) m.set(c.id, c);
    return m;
  }, [pool]);

  function openPack(): void {
    if (!pool.length) return;
    setPack(drawPack(pool).map((card) => ({ card, uid: crypto.randomUUID() })));
    setIndex(0);
    setFlipped(false);
    setExiting(false);
    setSaved(false);
    setDetail(null);
    setPhase('opening');
    window.setTimeout(() => setPhase('reveal'), 1100);
  }

  function next(): void {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      if (index + 1 >= pack.length) {
        setPhase('summary');
      } else {
        setIndex((i) => i + 1);
        setFlipped(false);
        setExiting(false);
      }
    }, 420);
  }

  function saveToCollection(): void {
    setCollection((prev) => {
      const next = { ...prev };
      for (const { card } of pack) next[card.id] = (next[card.id] ?? 0) + 1;
      saveCollection(next);
      return next;
    });
    setSaved(true);
  }

  const bestRarity = useMemo<Rarity>(() => {
    let best: Rarity = 'r';
    for (const { card } of pack)
      if (RARITY_ORDER[card.rarity] > RARITY_ORDER[best]) best = card.rarity;
    return best;
  }, [pack]);

  return (
    <main className="gacha">
      <header className="topbar">
        <h1>
          xflip <span>gacha</span>
        </h1>
        <nav>
          <button
            type="button"
            className={phase === 'collection' ? 'active' : ''}
            onClick={() => setPhase('collection')}
          >
            Collection
          </button>
          <button
            type="button"
            className={phase !== 'collection' ? 'active' : ''}
            onClick={() => setPhase('home')}
          >
            Packs
          </button>
        </nav>
      </header>

      {phase === 'home' && (
        <section className="home">
          <button type="button" className="pack" onClick={openPack}>
            <div className="pack-shine" />
            <div className="pack-label">
              <span className="pack-kicker">PREMIUM PACK</span>
              <strong>{PACK_SIZE} CARDS</strong>
              <span className="pack-sub">tap to open</span>
            </div>
          </button>
          <p className="hint">
            {PACK_SIZE} cards per pack · guaranteed SR or better · holo escalates with rarity
          </p>
          <div className="odds">
            {pool.length ? (
              Object.entries(
                pool.reduce<Record<string, { label: string; rate: number }>>((acc, c) => {
                  acc[c.rarity] = { label: c.rarityLabel, rate: c.rate };
                  return acc;
                }, {}),
              )
                .sort((a, b) => RARITY_ORDER[b[0] as Rarity] - RARITY_ORDER[a[0] as Rarity])
                .map(([rarity, { label, rate }]) => (
                  <span key={rarity} className={`badge badge-${rarity}`}>
                    {label} {(rate * 100).toFixed(rate < 0.01 ? 2 : 1)}%
                  </span>
                ))
            ) : (
              <span className="hint warn">loading cards…</span>
            )}
          </div>
        </section>
      )}

      {phase === 'opening' && (
        <section className="opening">
          <div className={`rip-scene rarity-${bestRarity}`}>
            <div className="rip-flash" />
            <div className="pack-half top">
              <div className="pack-face">
                <div className="pack-shine" />
                <div className="pack-label">
                  <span className="pack-kicker">PREMIUM PACK</span>
                  <strong>{PACK_SIZE} CARDS</strong>
                </div>
              </div>
            </div>
            <div className="pack-half bottom">
              <div className="pack-face">
                <div className="pack-shine" />
                <div className="pack-label">
                  <span className="pack-kicker">PREMIUM PACK</span>
                  <strong>{PACK_SIZE} CARDS</strong>
                </div>
              </div>
            </div>
          </div>
          <p className="hint">tearing open…</p>
        </section>
      )}

      {phase === 'reveal' && (
        <section className="reveal-stack">
          <div className="counter">
            {index + 1} / {pack.length}
          </div>
          <div className="deck">
            {pack.map(({ card: c, uid }, i) => {
              const pos = i - index;
              if (pos < 0) return null; // already revealed & gone
              const isActive = pos === 0;
              const depth = Math.min(pos, 3);
              const exitDir = index % 2 === 0 ? 1 : -1;
              const style: React.CSSProperties = isActive
                ? exiting
                  ? {
                      transform: `translateX(${exitDir * 130}%) rotate(${exitDir * 12}deg)`,
                      opacity: 0,
                    }
                  : { transform: 'none', opacity: 1, zIndex: 10 }
                : {
                    transform: `translateY(${-depth * 22}px) scale(${1 - depth * 0.05})`,
                    opacity: depth >= 4 ? 0 : 1,
                    filter: `brightness(${1 - depth * 0.18})`,
                    zIndex: 10 - depth,
                  };
              return (
                <button
                  type="button"
                  key={uid}
                  className={`deck-card rarity-${c.rarity} ${isActive && flipped ? 'flipped' : ''}`}
                  style={style}
                  onClick={() => {
                    if (!isActive) return;
                    if (!flipped) setFlipped(true);
                    else setDetail(c);
                  }}
                >
                  <div className="deck-inner">
                    <div className="deck-back">
                      <img src={BACK_SRC} alt="" />
                    </div>
                    <div className="deck-front">
                      {isActive && flipped && (
                        <>
                          <span className={`badge badge-${c.rarity}`}>{c.rarityLabel}</span>
                          <XflipCard src={c.src} tiltMax={16} />
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="actions">
            {!flipped ? (
              <button type="button" className="ghost" onClick={() => setFlipped(true)}>
                Reveal
              </button>
            ) : (
              <button type="button" className="primary" onClick={next}>
                {index + 1 >= pack.length ? 'Finish' : 'Next card'}
              </button>
            )}
          </div>
          {flipped && <p className="hint">tap card for detail</p>}
        </section>
      )}

      {phase === 'summary' && (
        <section className="summary">
          <h2>Pack results</h2>
          <div className="summary-grid">
            {pack.map(({ card: c, uid }) => (
              <button
                type="button"
                key={uid}
                className={`sum-card rarity-${c.rarity}`}
                onClick={() => setDetail(c)}
              >
                <XflipCard src={c.src} tiltMax={12} />
                <span className={`badge badge-${c.rarity}`}>{c.rarityLabel}</span>
                <span className="sum-name">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="primary" disabled={saved} onClick={saveToCollection}>
              {saved ? 'Saved ✓' : 'Save to collection'}
            </button>
            <button type="button" className="ghost" onClick={openPack}>
              Open another pack
            </button>
          </div>
        </section>
      )}

      {phase === 'collection' && (
        <section className="collection">
          <h2>Collection</h2>
          {(() => {
            const owned = Object.entries(collection)
              .filter(([, n]) => n > 0)
              .map(([id, n]) => ({ card: byId.get(id), count: n }))
              .filter((x): x is { card: CardDef; count: number } => Boolean(x.card))
              .sort(
                (a, b) =>
                  RARITY_ORDER[b.card.rarity] - RARITY_ORDER[a.card.rarity] ||
                  a.card.id.localeCompare(b.card.id),
              );
            const total = owned.reduce((a, x) => a + x.count, 0);
            if (!owned.length) return <p className="hint">No cards yet. Open a pack!</p>;
            return (
              <>
                <p className="hint">
                  {owned.length}/{pool.length} unique · {total} total
                </p>
                <div className="summary-grid">
                  {owned.map(({ card, count }) => (
                    <button
                      type="button"
                      key={card.id}
                      className={`sum-card rarity-${card.rarity}`}
                      onClick={() => setDetail(card)}
                    >
                      <XflipCard src={card.src} tiltMax={12} />
                      <span className={`badge badge-${card.rarity}`}>{card.rarityLabel}</span>
                      <span className="sum-name">
                        {card.name} {count > 1 && <em>×{count}</em>}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </section>
      )}

      {detail && (
        <div className="modal">
          <button
            type="button"
            className="modal-scrim"
            aria-label="Close detail"
            onClick={() => setDetail(null)}
          />
          <div className={`modal-card rarity-${detail.rarity}`}>
            <button type="button" className="modal-close" onClick={() => setDetail(null)}>
              ×
            </button>
            <XflipCard src={detail.src} tiltMax={20} />
            <div className="modal-meta">
              <span className={`badge badge-${detail.rarity}`}>{detail.rarityLabel}</span>
              <strong>{detail.name}</strong>
              <span className="hint">
                drop rate {(detail.rate * 100).toFixed(detail.rate < 0.01 ? 2 : 1)}%
              </span>
              <span className="hint">tap & drag the card to tilt</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
