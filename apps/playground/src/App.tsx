import { XflipCard } from '@xflip/react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addCards,
  fetchCollection,
  fetchOpens,
  login,
  logout,
  me,
  recordOpen,
  register,
} from './api';

type Rarity = 'c' | 'uc' | 'r' | 'sr' | 'ssr' | 'ur' | 'hr';

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

const RARITY_ORDER: Record<Rarity, number> = {
  c: 0,
  uc: 1,
  r: 2,
  sr: 3,
  ssr: 4,
  ur: 5,
  hr: 6,
};
const ELITE_MIN = RARITY_ORDER.sr; // SR and above = "good" cards (god pack / SR+ stats)
// Pull rates: SR+ ~8%/card → ~39% chance a pack holds any SR+. No pity floor.
const RARITY_RATES: Record<Rarity, number> = {
  c: 0.56,
  uc: 0.24,
  r: 0.12,
  sr: 0.05,
  ssr: 0.022,
  ur: 0.007,
  hr: 0.001,
};
const PACK_SIZE = 6;
const GOD_PACK_RATE = 0.01; // 1% — every card SR or better

function pickRarity(rates: { rarity: Rarity; rate: number }[]): Rarity {
  const total = rates.reduce((a, x) => a + x.rate, 0);
  let r = Math.random() * total;
  for (const x of rates) {
    r -= x.rate;
    if (r <= 0) return x.rarity;
  }
  return rates[rates.length - 1]?.rarity ?? 'r';
}

function ratesOf(pool: CardDef[]): { rarity: Rarity; rate: number }[] {
  const seen = new Set<Rarity>();
  for (const c of pool) seen.add(c.rarity);
  return [...seen].map((rarity) => ({ rarity, rate: RARITY_RATES[rarity] }));
}

function drawFrom(pool: CardDef[], rates: { rarity: Rarity; rate: number }[]): CardDef[] {
  const first = pool[0];
  if (!first) return [];
  const byRarity = new Map<Rarity, CardDef[]>();
  for (const c of pool) {
    const arr = byRarity.get(c.rarity) ?? [];
    arr.push(c);
    byRarity.set(c.rarity, arr);
  }
  const drawOne = (rarity: Rarity): CardDef => {
    const arr = byRarity.get(rarity) ?? [];
    return arr[Math.floor(Math.random() * arr.length)] ?? first;
  };
  const cards: CardDef[] = [];
  for (let i = 0; i < PACK_SIZE; i++) cards.push(drawOne(pickRarity(rates)));
  return cards;
}

// Normal pack: weighted across all tiers. No pity — most packs are C/R.
function drawPack(pool: CardDef[]): CardDef[] {
  const cards = drawFrom(pool, ratesOf(pool));
  cards.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  return cards;
}

// God pack: only SR and above, weighted among those tiers. No C / UC / R.
function drawGodPack(pool: CardDef[]): CardDef[] {
  const elite = pool.filter((c) => RARITY_ORDER[c.rarity] >= ELITE_MIN);
  if (elite.length < 1) return drawPack(pool);
  const cards = drawFrom(elite, ratesOf(elite));
  cards.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  return cards;
}

function AuthScreen({ onAuthed }: { onAuthed: (user: string) => void }): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user =
        mode === 'login' ? await login(username, password) : await register(username, password);
      onAuthed(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gacha auth-page">
      <div className="auth-card">
        <h1>
          xflip <span>gacha</span>
        </h1>
        <p className="hint">Sign in to keep your collection</p>
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>
            Username
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <span className="auth-error">{error}</span>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="hint warn">Your collection syncs to your account.</p>
      </div>
    </main>
  );
}

export function App(): JSX.Element {
  const [user, setUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [packs, setPacks] = useState<PackDef[]>([]);
  const [pool, setPool] = useState<CardDef[]>([]);
  const [phase, setPhase] = useState<Phase>('home');
  const [activePack, setActivePack] = useState<PackDef | null>(null);
  const [pack, setPack] = useState<{ card: CardDef; uid: string }[]>([]);
  const [isGod, setIsGod] = useState(false);
  const [index, setIndex] = useState(0); // current card in the deck
  const [flipped, setFlipped] = useState(false); // current card revealed?
  const [exiting, setExiting] = useState(false); // current card sliding away?
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [opens, setOpens] = useState<Record<string, number>>({});
  const [preOwned, setPreOwned] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<CardDef | null>(null);

  useEffect(() => {
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

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!user) {
      setCollection({});
      setOpens({});
      return;
    }
    fetchCollection()
      .then(setCollection)
      .catch(() => setCollection({}));
    fetchOpens()
      .then(setOpens)
      .catch(() => setOpens({}));
  }, [user]);

  const byGid = useMemo(() => {
    const m = new Map<string, CardDef>();
    for (const c of pool) m.set(c.gid, c);
    return m;
  }, [pool]);

  function openPack(p: PackDef): void {
    if (!user) return;
    const subset = pool.filter((c) => c.pack === p.id);
    if (!subset.length) return;
    const god = Math.random() < GOD_PACK_RATE;
    const drawn = god ? drawGodPack(subset) : drawPack(subset);

    // Snapshot what was owned before this pack, so we can flag NEW cards.
    setPreOwned(new Set(Object.keys(collection).filter((g) => (collection[g] ?? 0) > 0)));

    // Auto-save: optimistic local bump, then persist to the server. The POST
    // returns the authoritative collection, so reconcile when it lands.
    setCollection((prev) => {
      const next = { ...prev };
      for (const card of drawn) next[card.gid] = (next[card.gid] ?? 0) + 1;
      return next;
    });
    addCards(drawn.map((card) => card.gid))
      .then(setCollection)
      .catch(() => {
        /* keep optimistic state; will resync on next load */
      });

    setOpens((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }));
    recordOpen(p.id)
      .then(setOpens)
      .catch(() => {
        /* keep optimistic count; resyncs on next load */
      });

    setActivePack(p);
    setIsGod(god);
    setPack(drawn.map((card) => ({ card, uid: crypto.randomUUID() })));
    setIndex(0);
    setFlipped(false);
    setExiting(false);
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

  function doLogout(): void {
    logout().catch(() => {});
    setUser(null);
    setPhase('home');
  }

  const backSrc = activePack?.back ?? 'gacha/waifu/back.jpg';

  if (!authReady)
    return (
      <main className="gacha auth-page">
        <p className="hint">Loading…</p>
      </main>
    );
  if (!user) return <AuthScreen onAuthed={setUser} />;

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
          <span className="user-chip">
            <span className="user-name">{user}</span>
            <button type="button" className="logout" onClick={doLogout}>
              Log out
            </button>
          </span>
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
                      <span className="pack-opens">opened {opens[p.id] ?? 0}×</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="hint warn">loading packs…</span>
          )}
          <p className="hint">
            {PACK_SIZE} cards per pack · auto-saved to your collection ·{' '}
            {(GOD_PACK_RATE * 100).toFixed(0)}% god pack (all SR+)
          </p>
          <div className="odds">
            {pool.length ? (
              Object.entries(
                pool.reduce<Record<string, { label: string; rate: number }>>((acc, c) => {
                  acc[c.rarity] = { label: c.rarityLabel, rate: RARITY_RATES[c.rarity] };
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
          <div className={`rip-scene ${isGod ? 'god' : ''}`}>
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
          <p className="hint">{isGod ? '✨ something feels special… ✨' : 'tearing open…'}</p>
        </section>
      )}

      {phase === 'reveal' && (
        <section className="reveal-stack">
          {isGod && <div className="god-banner">✨ GOD PACK ✨</div>}
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
                      zIndex: 20,
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
                          {!preOwned.has(c.gid) && <span className="new-badge">NEW</span>}
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
          <h2>{isGod ? '✨ God Pack results ✨' : 'Pack results'}</h2>
          <p className="hint">Added to your collection ✓</p>
          <div className="summary-grid">
            {pack.map(({ card: c, uid }) => (
              <button
                type="button"
                key={uid}
                className={`sum-card rarity-${c.rarity}`}
                onClick={() => setDetail(c)}
              >
                {!preOwned.has(c.gid) && <span className="new-badge">NEW</span>}
                <XflipCard src={c.src} tiltMax={12} />
                <span className={`badge badge-${c.rarity}`}>{c.rarityLabel}</span>
                <span className="sum-name">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="actions">
            {activePack && (
              <button type="button" className="primary" onClick={() => openPack(activePack)}>
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
                {(['hr', 'ur', 'ssr', 'sr', 'r', 'uc', 'c'] as Rarity[]).map((rarity) => {
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
                drop rate{' '}
                {(RARITY_RATES[detail.rarity] * 100).toFixed(
                  RARITY_RATES[detail.rarity] < 0.01 ? 2 : 1,
                )}
                %
              </span>
              <span className="hint">tap & drag the card to tilt</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
