# Wend

A travel planning app that carries a daydream through to something you can hold up on a
street corner and follow. 

> 道草 *michikusa* — "grass by the road", the Japanese word for dawdling on the way.

---

## Getting it running

Two processes. Backend first.

### Backend — Rails API on :3000

```bash
cd backend
bundle install
bin/rails db:setup      # creates, migrates and seeds
bin/rails server        # http://localhost:3000
```

### Frontend — Vite on :5173

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

Vite proxies `/api` to the Rails server, so run both. Sign in with a seeded account:

| Email | Password |
| --- | --- |
| `peter@example.com` | `password123` |
| `sarah@example.com` | `password123` |

The second seeded user exists so vote tallies show more than one voice.

### Without the backend

The frontend ships Mock Service Worker fixtures covering the whole API, so
`npm run dev` works standalone. `/design` renders every component in every state — the
fastest way to check the design system.

---

## Checks

```bash
# backend
cd backend
bin/rails test          # model, request and query-count tests
bin/typecheck           # Sorbet

# frontend
cd frontend
npm run typecheck       # tsc, strict
npm test                # Vitest + Testing Library
npm run build
```

---

## How it's put together

**Everything is an Entry.** A trip, an idea, and a bundle are all rows in `entries`,
distinguished by `kind`. Structure lives entirely in `entry_links`, a self-referencing
many-to-many join. That one decision is what makes the product's harder promises work:

- An idea can sit in **several bundles at once** — Disneyland across three days, with a
  different dinner option each night.
- An idea can sit in **two trips at once**, which is what "reuse my research" means.
- **Lifting** an idea out into its own trip, or **absorbing** one trip into another, are
  link operations, not data migrations.

Trip membership is therefore *derived* by walking ancestors, not stored in a column.
Cycles are rejected at the model level — a cycle would hang the ancestor walk, so
`EntryLink` refuses any link where the parent is already a descendant of the child.

**Nothing is ever hard-deleted.** `DELETE /api/entries/:id` sets `archived_at`. The UI
calls it "set aside", and every scope offers a way to pick it back up. This is the first
principle of the design system, enforced at the data layer rather than left to the UI.

**Schedule times are integer minutes from midnight** alongside a date, which sidesteps
timezones entirely for a hand-authored plan. The trade-off is written up in
`.claude/interaction/wend-mvp/decisions.md` §5.

---

## Where to read next

| File | What's in it |
| --- | --- |
| `doc/project.md` | The original brief — use cases and core flow |
| `doc/architecture.md` | The build contract: schema, API surface, brand rules, ADRs |
| `frontend/README.md` | Component inventory and design-system usage |
| `backend/README.md` | API setup and conventions |
| `wend-design/` | The original design bundle — **read-only reference** |

The design system ships brand identity and primitives only; it deliberately excludes
application screens so the product UX could be designed fresh. 
