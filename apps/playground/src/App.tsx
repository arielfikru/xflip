import { XflipCard } from '@xflip/react';
import { useEffect, useMemo, useState } from 'react';

type Rarity = 'c' | 'r' | 'sr' | 'ssr' | 'ur';

interface PackDef {
  id: string;
  name: string;
  kicker: string;
  accent: string;
  back: string;
  manifest: string;
}

interface CardDef {
  id: string;
  gid: string; // globally unique: `${pack}:${id}`
  pack: string;
  name: string;
  rarity: Rarity;
  rarityLabel: string;
  rate: number;
  src: string;
}

type Phase = 'home' | 'opening' | 'reveal' | 'summary' | 'collection' | 'index';

const RARITY_ORDER: Record<Rarity, number> = { c: 0, r: 1, sr: 2, ssr: 3, ur: 4 };
const PACK_SIZE = 6;
const STORAGE_KEY = 'xflip-gacha-collection';

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

  // Reveal worst→best so the best card sits at the back and is revealed last.
  cards.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  return cards;
}

export function App(): JSX.Element {
  const [packs, setPacks] = useState<PackDef[]>([]);
  const [pool, setPool] = useState<CardDef[]>([]);
  const [phase, setPhase] = useState<Phase>('home');
  const [activePack, setActivePack] = useState<PackDef | null>(null);
  const [pack, setPack] = useState<{ card: CardDef; uid: string }[]>([]);
  const [index, setIndex] = useState(0); // current card in the deck
  const [flipped, setFlipped] = useState(false); // current card revealed?
  const [exiting, setExiting] = useState(false); // current card sliding away?
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [detail, setDetail] = useState<CardDef | null>(null);

  useEffect(() => {
    setCollection(loadCollection());
    fetch('gacha/packs.json')
      .then((r) => r.json())
      .then(async (defs: PackDef[]) => {
        setPacks(defs);
        const all = await Promise.all(
          defs.map(async (p) => {
            const cards = (await fetch(p.manifest).then((r) => r.json())) as CardDef[];
            return cards.map((c) => ({ ...c, pack: p.id, gid: `${p.id}:${c.id}` }));
          }),
        );
        setPool(all.flat());
      })
      .catch(() => {
        setPacks([]);
        setPool([]);
      });
  }, []);

  const byGid = useMemo(() => {
    const m = new Map<string, CardDef>();
    for (const c of pool) m.set(c.gid, c);
    return m;
  }, [pool]);

  function openPack(p: PackDef): void {
    const subset = pool.filter((c) => c.pack === p.id);
    if (!subset.length) return;
    setActivePack(p);
    setPack(drawPack(subset).map((card) => ({ card, uid: crypto.randomUUID() })));
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
      for (const { card } of pack) next[card.gid] = (next[card.gid] ?? 0) + 1;
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

  const backSrc = activePack?.back ?? 'gacha/waifu/back.jpg';

  return (
    <main className="gacha">
      <header className="topbar">
        <h1>
          xflip <span>gacha</span>
        </h1>
        <nav>
          <button
            type="button"
            className={phase === 'index' ? 'active' : ''}
            onClick={() => setPhase('index')}
          >
            All Cards
          </button>
          <button
            type="button"
            className={phase === 'collection' ? 'active' : ''}
            onClick={() => setPhase('collection')}
          >
            Collection
          </button>
          <button
            type="button"
            className={phase !== 'collection' && phase !== 'index' ? 'active' : ''}
            onClick={() => setPhase('home')}
          >
            Packs
          </button>
        </nav>
      </header>

      {phase === 'home' && (
        <section className="home">
          {packs.length ? (
            <div className="pack-shelf">
              {packs.map((p) => {
                const subset = pool.filter((c) => c.pack === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="pack"
                    style={{ ['--accent' as string]: p.accent }}
                    onClick={() => openPack(p)}
                  >
                    <div className="pack-shine" />
                    <div className="pack-label">
                      <span className="pack-kicker">{p.kicker}</span>
                      <strong>{p.name}</strong>
                      <span className="pack-sub">{subset.length} cards · tap to open</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="hint warn">loading packs…</span>
          )}
          <p className="hint">
            {PACK_SIZE} cards per pack · guaranteed SR or better · holo escalates with rarity · best
            card last
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
                  <span className="pack-kicker">{activePack?.kicker ?? 'PACK'}</span>
                  <strong>{activePack?.name ?? ''}</strong>
                </div>
              </div>
            </div>
            <div className="pack-half bottom">
              <div className="pack-face">
                <div className="pack-shine" />
                <div className="pack-label">
                  <span className="pack-kicker">{activePack?.kicker ?? 'PACK'}</span>
                  <strong>{activePack?.name ?? ''}</strong>
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
                      <img src={backSrc} alt="" />
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
            {activePack && (
              <button type="button" className="ghost" onClick={() => openPack(activePack)}>
                Open another {activePack.name}
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setPhase('home')}>
              Back to packs
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
              .map(([gid, n]) => ({ card: byGid.get(gid), count: n }))
              .filter((x): x is { card: CardDef; count: number } => Boolean(x.card))
              .sort(
                (a, b) =>
                  RARITY_ORDER[b.card.rarity] - RARITY_ORDER[a.card.rarity] ||
                  a.card.gid.localeCompare(b.card.gid),
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
                      key={card.gid}
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

      {phase === 'index' && (
        <section className="collection">
          <h2>Card Index</h2>
          <p className="hint">
            {pool.filter((c) => (collection[c.gid] ?? 0) > 0).length}/{pool.length} collected
          </p>
          {packs.map((p) => {
            const packCards = pool.filter((c) => c.pack === p.id);
            if (!packCards.length) return null;
            const packOwned = packCards.filter((c) => (collection[c.gid] ?? 0) > 0).length;
            return (
              <div key={p.id} className="index-pack">
                <h3 className="index-pack-head">
                  <span style={{ color: p.accent }}>{p.name}</span>
                  <span className="hint">
                    {packOwned}/{packCards.length}
                  </span>
                </h3>
                {(['ur', 'ssr', 'sr', 'r', 'c'] as Rarity[]).map((rarity) => {
                  const cards = packCards.filter((c) => c.rarity === rarity);
                  if (!cards.length) return null;
                  const ownedN = cards.filter((c) => (collection[c.gid] ?? 0) > 0).length;
                  return (
                    <div key={rarity} className="index-group">
                      <div className="index-head">
                        <span className={`badge badge-${rarity}`}>
                          {cards[0]?.rarityLabel ?? rarity}
                        </span>
                        <span className="hint">
                          {ownedN}/{cards.length}
                        </span>
                      </div>
                      <div className="summary-grid">
                        {cards.map((c) => {
                          const owned = (collection[c.gid] ?? 0) > 0;
                          return owned ? (
                            <button
                              type="button"
                              key={c.gid}
                              className={`sum-card rarity-${c.rarity}`}
                              onClick={() => setDetail(c)}
                            >
                              <XflipCard src={c.src} tiltMax={12} />
                              <span className={`badge badge-${c.rarity}`}>{c.rarityLabel}</span>
                              <span className="sum-name">{c.name}</span>
                            </button>
                          ) : (
                            <div key={c.gid} className="sum-card locked">
                              <div className="locked-art">
                                <span>?</span>
                              </div>
                              <span className="sum-name muted">Locked</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
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
