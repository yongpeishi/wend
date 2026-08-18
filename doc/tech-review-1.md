# Wend — Technical Review

Reviewed 2026-08-17. Scope: full Rails API backend (`backend/`) and React frontend
(`frontend/src`). Backend models/controllers were reviewed directly; policies,
serializers, config, and the frontend were reviewed by parallel deep-dive passes and
merged here. Findings are ordered by impact within each section.

**Overall verdict:** this is an unusually well-put-together side project. The
single-table `Entry` graph + `entry_links` DAG is a bold but coherent core design, the
authorization layer is deny-by-default with audit hooks, destructive operations are
consistently archive-not-delete, and the comment culture is exceptional — comments
explain *why* and name the invariant they protect. The findings below are mostly edge
cases in the seams between subsystems, not structural rot. Two backend issues are
genuinely High severity and worth fixing first.

---

## 1. Architecture & Code Structure

### Backend

**What's good (worth keeping as-is):**

- **The `Entry` unification** (trips, ideas, bundles as one table, structure in
  `entry_links`) trades column-level clarity for graph flexibility, and the codebase
  pays the tax honestly: cycle prevention lives in `EntryLink` with a depth-capped
  descendant walk (`app/models/entry_link.rb:149`), and every recursive CTE carries an
  explicit depth guard so even a slipped cycle terminates
  (`app/models/entry.rb:296-342`). This is the right way to run this design.
- **Authorization architecture is a highlight.** `Governed#governing_entry_ids` +
  `ApplicationPolicy#role` conjunction (`app/policies/application_policy.rb:33-44`)
  gives one permission rule written once. `Api::BaseController`'s paired
  `verify_authorized` / `verify_policy_scoped` hooks with empty exemption lists
  (`app/controllers/api/base_controller.rb:17-33`) is deny-by-default done properly.
- **404-over-403** consistently applied (`application_controller.rb:1049`) so trip ids
  aren't enumerable — with a deliberate, documented exception in
  `CollaboratorsController` where the caller already proved visibility.
- **`TripDateShift` as a plain PO Ruby object** (`app/models/trip_date_shift.rb`) is
  exactly the "service object where it earns its keep" pattern — preview and apply
  share one computation, the confirmation contract is explicit.

**Findings:**

- **Medium — controllers carry business logic that belongs on models/objects.**
  `EntriesController#lift/#absorb/#fork` (`entries_controller.rb:417-474`) each open
  transactions and manipulate links inline. They're well-commented, but these are
  domain operations (like `DayVersion#keep!` already is) and will grow. Moving them to
  `Entry#lift!(by:)`, `Entry#absorb_into!(target)`, `Entry#fork!(by:)` keeps the
  controller at "authorize, call, render" and makes them testable without HTTP.
- **Medium — `TodosController#index` does two queries plus a Ruby merge**
  (`todos_controller.rb:869-882`): trip-level todos and entry-descendant todos are
  fetched separately, concatenated, `uniq`'d and sorted in Ruby. One
  `where(trip_id: X).or(where(entry_id: descendant_ids))` scope expresses the
  "unified checklist" in SQL and removes the merge/sort code.
- **Low — `Entry` is on its way to God-object status** (~280 lines: tree walks,
  visibility SQL, pros/cons normalization, membership syncing). Fine today; when it
  next grows, extract the pros/cons normalization and the recursive-CTE class methods
  into concerns (`ProsCons`, `EntryGraph`) before it tips.
- **Low — no pagination anywhere.** `entries#index` materializes every visible entry
  (`entries_controller.rb:307`), then filters `scheduled` in Ruby. Fine at
  two-users scale; it's the first thing that will hurt if the dataset grows. Not worth
  building now, worth knowing.

### DB schema

- **Good:** partial unique index enforcing one owner per trip
  (`index_trip_memberships_one_owner_per_trip`), unique `[trip_id, day]` on
  `trip_days`, unique `[parent_id, child_id]` on `entry_links`, unique
  `[entry_id, user_id]` on votes — the invariants the code narrates are actually
  enforced by the database. FKs are present everywhere, including the entries-pointing
  `trip_id` columns.
- **Medium — `schedule_items.position` and `todos.position` are nullable**
  (`db/schema.rb`: both `default: 0` but no `null: false`). `TodosController#index`
  sorts in Ruby with `sort_by! { |t| [t.position, t.id] }`
  (`todos_controller.rb:882`) — one row with an explicitly-nil position (the PATCH
  permits `:position`) and the whole checklist 500s on a `nil` comparison. Add
  `null: false` to both columns (backfill first) or guard the sort with
  `t.position || 0`.
- **Low — `entries` mixes trip-only and idea-only columns** (`starts_on/ends_on` vs
  `category/duration_minutes`), the accepted cost of the single-table design. The
  `from_entry_id`/`to_entry_id` pair appears unused by any controller or serializer
  path reviewed — if nothing reads them, drop them; dead columns on the central table
  are the most expensive kind.
- **Low — JSON `pros`/`cons` columns** are well-defended (normalizing writers with
  caps, `entry.rb:275-289`), a reasonable trade against a join table given
  whole-array read/write semantics. No action needed; noted as a deliberate exception
  to normalization.

### Frontend

(See sections 3 and 5 for detail; structural summary here.)

- **Good:** clean layering — `api/` (fetch wrapper + typed endpoint modules +
  centralized `queryKeys`), `features/` by domain, thin `routes/` screens, shared
  `components/`, and a separate `design/` primitive layer. Derived-state modules
  (`itineraryModel.ts`, `scheduleModel.ts`, `checklistModel.ts`) keep computation out
  of components. This is the shape most production React apps should have.
- The findings that follow are seam-level (invalidation breadth, context identity,
  drag-drop races), not structural.

---

## 2. Duplication & Simplification

### Backend

- **Medium — the `render`/`errors` ceremony is repeated ~14 times.** Every mutation
  action ends in the same
  `if save → render json … else → render errors.to_hash(true), 422` block, and five
  actions separately `rescue ActiveRecord::RecordInvalid` even though
  `ApplicationController` already rescues it globally (`application_controller.rb:1044`).
  Prefer bang methods (`save!`, `update!`) everywhere and let the global rescue
  produce the 422 — deletes ~40 lines and removes the drift risk between the two
  error shapes. Example:

  ```ruby
  # entries_controller.rb#create — after
  def create
    entry = Entry.new(entry_params.merge(created_by: current_user))
    parent = params[:parent_id].present? ? Entry.find(params[:parent_id]) : nil
    parent ? authorize(parent, :write?) : authorize(entry, :create?)

    ActiveRecord::Base.transaction do
      entry.save!
      EntryLink.create!(parent:, child: entry, position: next_position(parent.id)) if parent
    end
    render json: { entry: EntrySerializer.one(entry, current_user:) }, status: :created
  end
  ```

- **Low — `truthy?` (`entries_controller.rb:491`) and inline
  `ActiveModel::Type::Boolean.new.cast` (`nearby_controller.rb:708`,
  `todos_controller.rb:932`) are three copies of one helper.** Put `truthy?` in
  `Api::BaseController`.
- **Low — `next_position` exists twice** (`entries_controller.rb:487`,
  `entry_links_controller.rb:564`) and the same `(maximum || -1) + 1` idiom appears
  again in `TripDay#next_version_position` and `DayVersion#restore!`. An
  `EntryLink.next_position_for(parent_id)` class method covers the first two.
- **Low — the "scheduled ids" computation is duplicated verbatim** between
  `entries_controller.rb:314-316` and `nearby_controller.rb:726-728`. Extract
  `ScheduleItem.placed_entry_ids(trip_id:, among:)`.

### Frontend

- **Medium — the loading/empty branch is repeated per screen, and wrongly.** Six
  screens hand-roll `if (isLoading) … else render list-or-EmptyState` (see F1 in §5).
  A tiny shared `<QueryGate query={...}>` (or per-feature hook) that renders
  spinner / error-with-retry / children would fix the error-state bug *and* delete
  the repetition in one move.
- **Low — shift-select logic is duplicated byte-for-byte** between
  `src/routes/TripBoard.tsx:232-246` and `src/routes/Library.tsx:66-80` (range
  select against rendered order, `lastSelectedId` ref included). Extract
  `useShiftSelect(orderedIds)`.
- **Low — `formatMinutes` exists twice with diverging signatures**
  (`src/api/schedule.ts:67-74` accepts `number | null`; `src/lib/formatDates.ts:77-81`
  doesn't). Keep the one in `lib/formatDates.ts` and migrate callers.
- **Low — two acknowledged API-layer forks are one small change from deletable.**
  `patchTripDates` hand-rolls `fetch` because `ApiError` discards the 422 body
  (`src/api/entries.ts:110-142`), and `useEditItemHours`
  (`src/routes/TripItinerary.tsx:640-652`) re-implements `useUpdateScheduleItem`
  because that hook binds `id` at hook-call time. Add `readonly body?: unknown` to
  `ApiError` and switch `useUpdateScheduleItem` to take `{ id, ...payload }` in the
  mutate variables (the TanStack v5-idiomatic shape); both copies — including a
  second copy of the schedule+itinerary invalidation list, which is exactly the kind
  that drifts — then go away.

---

## 3. Idiomatic Practices

### Backend

- **Good:** Pundit used canonically (scopes for reads, `authorize` for writes),
  strong parameters everywhere, `has_secure_password`, enum-with-validate,
  `inverse_of` declared on nearly every association, `find_or_create_by!` +
  `RecordNotUnique` retry for the create race in `TripDay.ensure!`
  (`trip_day.rb:766-774`).
- **Acceptable deviation for a side project:** hand-rolled serializer classes instead
  of `jbuilder`/`active_model_serializers`/Blueprinter. They're consistent
  (`.one`/`.list`, string keys) and the bulk-context pattern in
  `TripDaySerializer.list` shows N+1 awareness. Keep them; adopting a gem now would
  churn every endpoint for little gain.
- **Acceptable deviation:** raw SQL strings for the recursive CTEs and haversine
  (`nearby_controller.rb:688-700`). They're parameterized via `sanitize_sql_array`,
  documented, and SQLite-specific on purpose. The long-term pain arrives only if the
  database changes — the comments already flag that.
- **Low — `sort_by` string-building in `DayVersion.name_for`** and friends are fine;
  no action.
- **Low — `EntriesController#index` `q` search doesn't escape LIKE wildcards**
  (`entries_controller.rb:301`): `%` or `_` in the query behave as wildcards. Not an
  injection (it's parameterized), just surprising search results. Use
  `ActiveRecord::Base.sanitize_sql_like(params[:q])`.

### Frontend

- **Good:** centralized query-key factory (`src/api/queryKeys.ts`), one fetch
  wrapper with normalized `ApiError`, role logic in exactly one file
  (`src/auth/tripRole.ts`), presentational features fed by container routes,
  derived-state modules kept out of components. TanStack Query usage is broadly
  idiomatic.
- **Deliberate convention-breaks that are fine as-is:** the broad `entries.all`
  invalidation on every mutation (correct trade at this scale), `TripRoleContext`
  defaulting to editable instead of throwing (documented reasoning), duplicated
  `NO_SENSORS` constants in TripBoard/TripItinerary (explicitly chosen decoupling),
  and the mock-opt-in boot flow.
- **Low — `AuthContext`'s `useMemo` is a no-op and its comment is wrong**
  (`src/auth/AuthContext.tsx:25-39`): v5's `useMutation` returns a new object every
  render, so with mutation objects in the deps the memo recomputes each render and
  the context value has unstable identity. Depend on the stable pieces instead
  (`me.data`, `me.isLoading`, the `mutateAsync` references, `isPending`). Impact is
  small (three consumers); the memo as written is dead weight.
- **Low — ARIA semantics:** `TabBar` uses `role="tablist"/"tab"` with no `tabpanel`
  anywhere (`src/components/TabBar.tsx:54-77`) — as a segmented value-picker it
  should be `radiogroup`/`radio`; `Drawer` is `aria-modal` without a focus trap
  (`src/components/Drawer.tsx:24-32`) — only `DesignGallery` uses it, so delete it
  or port `Modal`'s trap before it gains a second caller.

---

## 4. Bugs & Edge Cases (backend)

A cross-cutting observation first: the policy layer itself held up under review —
every scope checked matches its model's `governing_entry_ids`, and no missing
`authorize` was found. **Every High/Medium authorization finding below is the same
species of bug: a foreign key inside writable params that is never validated against
the caller's world.** The authorization sweep test probes strangers addressing other
people's routes, but never an authenticated user smuggling foreign ids into their own
writable params — which is exactly where all of these live.

### High

- [DONE] **H1 — Any member can demote a trip to an idea and wipe all memberships.**
  `entry_params` permits `:kind` on update (`entries_controller.rb:498`), and
  `EntryPolicy#update? = write?` (member level). PATCHing a trip with
  `kind: "idea"` fires `sync_owner_membership`, whose else-branch is
  `TripMembership.where(trip_id: id).delete_all` (`entry.rb:406-412`) — every
  collaborator including the owner silently and irreversibly loses the trip
  (strictly worse than `destroy`, which is owner-gated and merely archives), and the
  entry falls back to `created_by` ownership. The reverse is a silent lift: PATCH
  `kind: "trip"` skips the parent detachment `lift` performs and the owner-on-both
  check `absorb` performs. `kind` should be create-only; kind transitions belong
  exclusively to the `lift`/`absorb` verbs:

  ```ruby
  def entry_params
    permitted = [:title, :description, :category, ...]
    permitted << :kind if action_name == "create"
    params.require(:entry).permit(*permitted, pros: [...], cons: [...])
  end
  ```

- [DONE] **H2 — Reading any entry's details by smuggling its id into a schedule item.**
  `entry_id`/`chosen_entry_id` on a schedule item are never validated to be visible
  to the caller or inside the trip (`schedule_items_controller.rb:826-830`,
  `schedule_item.rb` — `optional: true` associations, no ownership check), and
  `ItineraryItemSerializer.context_for` loads them by raw id with no visibility
  scope. Entry ids are sequential integers, so any user can POST
  `schedule_item: { entry_id: <victim id> }` into *their own* trip and read back the
  victim entry's `title`, `category`, `duration_minutes`, and `location_name`. This
  contradicts the care taken in `EntrySerializer.detail`, which does scope
  `parents`/`children` through `visible_to`. Validate on the model
  (`entry_id` must be a descendant of `trip_id` or visible to the placer), or scope
  the serializer lookup through `Entry.visible_to`.

- [DONE] **H3 — Cross-trip itinerary injection via unvalidated `day_version_id`.**
  Same family: `POST /trips/:trip_id/schedule` and `PATCH /schedule_items/:id`
  permit `day_version_id`, authorization checks only the item's own `trip_id`
  (`ScheduleItemPolicy` → `governing_entry_ids == [trip_id]`,
  `schedule_item.rb:534-536`), and the model validates only that the version
  *exists* (`schedule_item.rb:543-547`) — never that it belongs to the same trip. A
  member of trip A can attach an item to trip B's day version; trip B's itinerary
  read (`TripDaySerializer` → `day_versions` → `schedule_items`, unscoped
  association walk) then renders the injected row inside trip B's plan. Bonus leak:
  `resolve_day_version!` fills `item.day` from the victim trip's day and echoes it
  back (`schedule_items_controller.rb:813-817`). Fix in the model so every path is
  covered:

  ```ruby
  # schedule_item.rb
  validate :day_version_belongs_to_trip

  def day_version_belongs_to_trip
    return if day_version_id.blank? || day_version.nil?
    return if day_version.trip_day&.trip_id == trip_id

    errors.add(:day_version_id, "must belong to this trip")
  end
  ```

### Medium

- [DONE] **M0a — `lodging_entry_id` is the small sibling of H2.**
  `PATCH /trips/:trip_id/days/:day` accepts any entry id as lodging
  (`trip_days_controller.rb:970-972`) with no visibility check, and
  `TripDay#lodging_title` (`trip_day.rb:857-859`) exposes the entry's title through
  `TripDaySerializer`. Same id-enumeration title leak, smaller payload; same fix
  shape.
- **M0b — Visibility and role resolution disagree at depth and on nested trips.**
  `Entry.visible_to` descends 20 levels (`VISIBILITY_DEPTH_CAP`, `entry.rb:168`) but
  `role_for` ascends only 10 (`DEFAULT_DEPTH_CAP`, `entry.rb:389`), and `library?`
  (cap 10) disagrees with the `library` scope (cap 20). Separately, nothing stops
  creating a `kind: "trip"` entry *under* another trip, and then the parent trip's
  members can *see* the nested trip (the granted CTE descends through it) while
  `role_for` returns `nil` for them — index lists a row whose `show` then 404s.
  Unify the caps (pass `depth_cap: VISIBILITY_DEPTH_CAP` in `role_for`) and either
  forbid trip-under-parent at create or define the nested-trip role answer.

- **M1 — No brute-force protection on `POST /api/session` or `POST /api/users`**
  (`sessions_controller.rb`, `users_controller.rb`). Unlimited sign-in attempts +
  the collaborator invite endpoint's careful anti-enumeration design
  (`collaborators_controller.rb:79-107`) are undermined if the sign-in endpoint can
  be hammered. Rails 8 ships `rack-attack`-style rate limiting via
  `Rails.application.config` middleware or the new `rate_limit` controller API —
  `rate_limit to: 10, within: 1.minute, only: :create` is one line.
- **M2 — No minimum password length.** `User` (`user.rb:897-917`) validates email
  format but `has_secure_password` alone accepts a 1-character password. Add
  `validates :password, length: { minimum: 8 }, allow_nil: true`.
- **M3 — Session cookie is permanent-ish and never expires or rotates**
  (`application_controller.rb:1060`): `cookies.signed[:user_id]` with no `expires`
  is a browser-session cookie, but nothing invalidates it server-side — there's no
  session record to revoke, and the cookie stays valid for the account's lifetime if
  the browser persists it. Acceptable for an MVP; when sharing with real users, move
  to `cookies.signed.permanent`-with-expiry or a session token you can revoke. Also
  confirm `secure: true` in production (set `config.force_ssl = true`).
- **M4 — `swap_days!` parking-spot collision window.** `TripDay.swap_days!`
  (`trip_day.rb:783-809`) parks row A on `maximum(:day) + 1`. Two concurrent swaps
  on the same trip can pick the same parking date and one dies on the unique index —
  worse, SQLite serializes writers so it mostly won't manifest, but the failure mode
  is a 500 halfway through a swap. The transaction protects consistency; just be
  aware the retry story is "user clicks again."
- **M5 — Vote/collaborator upsert races 500 instead of retrying.**
  `Vote.find_or_initialize_by` + unique index (`votes_controller.rb:1002`) and
  `TripMembership.find_or_create_by!` (`collaborators_controller.rb:104`) can raise
  `RecordNotUnique` under a double-submit; `TripDay.ensure!` already shows the
  rescue-and-retry pattern (`trip_day.rb:770`) — apply it to both, or use
  `create_or_find_by`.

### Low

- **L0a — Sign-in leaks account existence through timing.**
  `user&.authenticate` (`sessions_controller.rb:838-839`) skips the bcrypt
  comparison entirely when the email is unknown, so response time reveals whether an
  account exists — undercutting the effort spent on the collaborator-invite
  enumeration defense (`collaborators_controller.rb:79-107`). Rails ≥ 7.1 ships the
  fix: `User.authenticate_by(email: ..., password: ...)` runs a dummy hash when the
  user is missing.
- **L0b — CSRF posture rests entirely on `SameSite=Lax`.**
  Cookie auth on an API controller with no forgery protection and no Origin check
  (`application_controller.rb:1039-1061`). Lax does block modern-browser cross-site
  non-GET requests, so this is acceptable for a side project; for defense in depth
  add a one-line Origin allowlist `before_action` — rack-cors does not block
  non-CORS form posts.
- **L0c — `VotePolicy` is dead code that will drift.** Its `create?`/`destroy?` and
  `Scope` are never invoked — `VotesController` authorizes the *Entry* via `:vote?`
  and never calls `policy_scope(Vote)`. Delete the file (noting the rule lives in
  `EntryPolicy#vote?`) or route the controller through it.
- **L0d — `entries#show` runs the aggregate battery twice.**
  It calls `EntrySerializer.detail` (which internally builds `.one` with its five
  aggregate queries) and then calls `EntrySerializer.one(@entry, ...)` again
  (`entries_controller.rb:323-333`). Reuse the detail hash instead of
  re-serializing.
- **L1 — `DayVersionsController#create` doesn't range-check the day** against the
  trip's dates (unlike `ItinerariesController#swap_days`, `itineraries_controller.rb:639`),
  so forking a day outside the trip's range mints an unreachable `trip_day`. The
  route's regex only checks the *shape* of the date.
- **L2 — `TripDateShift#shift!` row-at-a-time updates** (`trip_date_shift.rb:713-720`)
  are O(n) queries; correct (the ordering trick around the unique index is sound and
  well-explained) but a single
  `UPDATE trip_days SET day = date(day, '+N days')` per table would do it in two
  statements. Only matters if trips get long.
- **L3 — `Entry#library?` and `role_for` walk ancestors per call** — fine on the
  detail path, and the code already warns "never call this in a loop"
  (`entry.rb:385`). The serializer bulk path honors it today; keep the warning true.
- **L4 — `feedbacks.element_selector`/`url` lengths are unbounded** while `message`
  is capped at 5 000 (`feedback.rb:452-456`) — a hostile client can park megabytes in
  the selector column. Cap both.
- **L5 — `TodoPolicy::Scope` interpolates `visible_entries.to_sql` into a raw
  string** (`todo_policy.rb:14-16`). Safe today (bound values are pre-sanitized) but
  it's the one hand-built SQL seam in the policy layer and inlines the recursive CTE
  twice in one query. Compose relations with `.or`/`.merge` instead.

### Deploy readiness (all Low individually, but blocking together)

- **CORS origin is hardcoded** to `http://localhost:5173` with `credentials: true`
  (`config/initializers/cors.rb:11`) — correct for dev, silently breaks the client on
  first deploy. Drive it from `ENV.fetch("FRONTEND_ORIGIN", ...)`.
- **`config/database.yml:29-31`** — the production database path is commented out;
  boot fails on first deploy. **`config/environments/production.rb`** leaves
  `config.hosts` unset (no Host-header protection) — and while there, set
  `config.force_ssl = true` so the session cookie gets `Secure`.
- **`db/seeds.rb:9-22`** creates three accounts with password `password123` and
  `db:seed` has no environment guard, so a stray production seed mints known
  credentials. Wrap the demo users in `unless Rails.env.production?`.

### Test coverage

Coverage is unusually good for a side project (~3.6k lines): a route-table
authorization sweep (`test/requests/api/authorization_test.rb`) probes every `/api`
route as a stranger, asserts 404-not-403, substring-checks bodies for leaks, and
asserts its own probe list is complete against the route table; list endpoints carry
query-count budgets; models have direct tests for visibility, cycles, date shifts,
and owner-membership backfill. **The conspicuous gap matches the High findings
exactly:** nothing tests an authenticated user smuggling foreign ids
(`entry_id`, `day_version_id`, `lodging_entry_id`) into their own writable params,
and nothing tests the `kind`-via-PATCH transition. When fixing H1–H3, add that
"hostile insider" dimension to the sweep so the class of bug stays fixed.

---

## 5. Frontend Findings — bugs, resilience, performance, UX

### Error handling & resilience (the frontend's one systemic weakness)

- **F1 (High) — Query errors render as "empty" states that affirmatively claim
  nothing exists.** `src/routes/TripsList.tsx:63-75`, `TripBoard.tsx:394-397`,
  `Library.tsx:105-108`, `TripChecklist.tsx:47,73`, `TripMap.tsx:105-108`,
  `TripSchedule.tsx:267-276` all branch only on `isLoading`; on `isError` the data
  is `undefined` and the screen falls through to `EmptyState` copy ("No trips yet",
  "This one's still a daydream") with no retry path. Only `TripLayout` and
  `TripItinerary` handle errors. Fix per screen by mirroring
  `TripItinerary.tsx:476-487` (message + `refetch` button) — ideally via the shared
  `<QueryGate>` suggested in §2.
- **F2 (Medium) — Transient `/api/me` failure signs the user out.**
  `src/auth/ProtectedRoute.tsx:18-20` treats `!user` from a 500/network blip
  (session query has `retry: false`, `src/api/session.ts:19-21`) identically to
  "signed out" and redirects to `/signin`. Distinguish `me.isError` (retry UI) from
  `me.data === null` (redirect), and retry non-401 errors:
  `retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2`.
- **F3 (Medium) — No mid-session 401 handling.** Only `useMe` interprets 401; the
  session query is cached with `staleTime: Infinity`, so when a session expires
  mid-use every query fails and — combined with F1 — screens quietly go "empty"
  while the user stays visually signed in. One `QueryCache`/`MutationCache`
  `onError` in `src/api/queryClient.ts` that does
  `queryClient.setQueryData(queryKeys.session, null)` on 401 makes ProtectedRoute
  redirect for free.
- **F4 (Medium) — Silent mutation failures where the rest of the app toasts.**
  `TripsList.tsx:71` (archive), `:97` (restore), and `EntryDetail.tsx:193-195`
  (restore) have no `onError`; archiving a trip that 403s does nothing visible.
  Every other route mutation passes `onError: () => show(SAVE_FAILED, 'error')` —
  add the same.
- **F5 (Low) — Unhandled promise in the boot path.** `src/main.tsx:22` —
  `enableMocksIfNeeded().then(render)` has no `.catch`; a rejected `worker.start()`
  leaves a permanently blank page. Catch, log, and render anyway.
- **F6 (Low) — Error toasts auto-dismiss in 4s** (`src/components/Toast.tsx:60-67`)
  whether or not they were seen, and the timeout id is never retained. Make
  `tone === 'error'` sticky-until-dismissed or much longer.

### Data-editing correctness

- **F7 (Medium) — `EntryDetail` blur-save PATCHes unchanged fields, and a numeric
  typo silently wipes data.** `src/routes/EntryDetail.tsx:127-144`: (a) only
  `title` is diffed, so tabbing through the dialog can fire ~8 needless
  PATCH+invalidate cycles; (b) `Number("12.5.6")` is `NaN` and
  `JSON.stringify({lat: NaN})` serializes to `null`, so a typo in lat/lng/duration
  silently clears the stored value. Diff every field before mutating and guard
  numerics with `Number.isFinite`.
- **F8 (Low) — Cache write-back race in itinerary mutations.**
  `src/api/itinerary.ts:30-43` writes the returned `TripDay` into the cache without
  `cancelQueries` first, so an in-flight refetch can resolve later and overwrite
  the fresher day. `await queryClient.cancelQueries(...)` before `setQueryData`.
  Related: `useSwapDays` (`:101-104`) sets the full list *and then* invalidates,
  which refetches and discards the write — pick one.
- **F9 (Low) — Schedule-item writes never invalidate `entries`,** leaving
  `Entry.scheduled` (checklist ordering, board filter) stale until the 10s
  staleTime saves you on navigation (`src/api/schedule.ts:22-28`). Add
  `queryKeys.entries.all` to `useInvalidateSchedule`.
- **F10 (Low) — Deep-linked `/entries/:id` cannot be closed in a fresh tab.**
  `EntryDetail.tsx:386` — `navigate(-1)` is a no-op as the first history entry, so
  ✕/Escape/Done do nothing. Fall back to `navigate('/')` when there's no history.
- **F11 (Low) — SignIn niggles.** `src/routes/SignIn.tsx:25` types
  `location.state.from` as the DOM `Location`, drops `search`/`hash` on redirect,
  and an already-authenticated visitor to `/signin` isn't redirected away.
- **F12 (Low) — `TripLayout` outlet context carries a dead payload.**
  `TripLayout.tsx:102-110` widens `{ role, canEdit, canDelete, canShare }` into the
  outlet but every consumer destructures only `trip`; capabilities already flow
  through `TripRoleProvider`. Trim to `{ trip }`. The `TripLayout.tsx:57-63`
  comment ("fetched for a viewer and nobody else") is also stale —
  `AppLayout.tsx:103` fetches collaborators unconditionally.

### Mocks (contract fidelity)

- The MSW layer is genuinely good: every endpoint the api modules call is covered
  with real error shapes (422 `{errors}`, `dropped_days_need_confirmation`, 202
  collaborator add, viewer email redaction), and `db.ts` mirrors the serializers.
  Two drift risks: (a) mock entry writes enforce **no role checks**, so a
  viewer-path regression passes every MSW test while the real API 403s — the UI's
  only guard is `canEdit` gating; (b) `Object.assign(entry, body.entry)`
  (`handlers.ts:297`) accepts fields outside `EntryWritePayload`, masking payload
  mistakes the real strong params would reject.

### Feature modules — bugs & correctness

The feature layer is unusually well-factored: pure `*Model.ts` files with real test
suites, consistent read-only handling, disciplined XSS escaping in the map layer
(`markerIcon.ts` escapes user titles in both HTML builders), and local-midnight date
parsing used consistently. The findings below are the exceptions.

- **F13 (Medium) — Concurrent reorder race in `BundleCard`.**
  `src/features/board/BundleCard.tsx:219-235` (`moveMember`) swaps two members with
  two *concurrent* `updateLinkPosition.mutate` calls, each independently
  invalidating `['entries']`; the interleaved refetch can observe (or persist) both
  links claiming the same position. The atomic `reorderLinks` endpoint already
  exists and is what the drag path uses — use it here too:

  ```ts
  const reordered = members.slice();
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  reorderLinks.mutate(reordered.map((m) => m.id), { onError: ... });
  ```

- **F14 (Medium) — Stale-props whole-array PATCH drops pros/cons notes.**
  `src/features/trips/ProsCons.tsx:65-68,76-84` computes adds from **props**, so a
  second note added before the first mutation's refetch settles PATCHes an array
  built from stale props and silently drops the first note (whole-array,
  last-write-wins). Base the write on `queryClient.getQueryData` or do an
  optimistic `setQueryData` in `onMutate` so back-to-back adds compose.
- **F15 (Medium) — Double-commit renames.** `BundleCard.tsx:171-190,288`: Enter
  commits, the input unmounts, blur fires and commits *again* (the mutation is
  still in flight so the title comparison passes) — two PATCHes, two toasts. The
  codebase already solved this exact bug with a `settled` ref in
  `ProsCons.tsx:59-61`; apply the same guard. Relatedly in
  `src/features/trips/TripCard.tsx`: the `skipTitleSave` flag set by Escape is only
  reset inside `saveTitle`, so if the unmount doesn't fire a blur the *next*
  rename's save is silently swallowed (reset it in `startEditingTitle`), and on
  rename failure `titleDraft` keeps the refused name forever (revert in `onError`,
  as `BundleCard` does).
- **F16 (Medium) — Aborted search still clears results.**
  `src/features/map/PlaceSearch.tsx:67-80`: an aborted request runs
  `.catch(() => []).then(...)`, setting `results` to `[]` and `searched` to `true`,
  so "No matches. Paste coordinates instead…" flashes between keystrokes. Early
  return when `controller.signal.aborted`.
- **F17 (Low) — Partial-failure UX in `TakeSomewhereModal`**
  (`src/features/library/TakeSomewhereModal.tsx:47-63`): if trip creation succeeds
  but some links fail, the toast implies nothing happened and retrying creates a
  *second* trip. Surface "trip created, N ideas didn't attach" and call
  `onDone(trip.id)` anyway.
- **F18 (Low) — Assorted small ones.**
  `useGeolocation.ts:36-40` collapses timeout/unavailable/denial into
  `denied: true` (branch on `error.code`); `BulkBar.tsx:140-143` toasts
  `Added ${selectedIds.length}` even when already-members were skipped (use
  `toLink.length`); `BulkBar.tsx:105-115`'s `stopPropagation` in a document-level
  listener cannot actually shield a modal's own document-level listener (the
  comment claiming so is wrong); `EntryTree.tsx:42-44` draws an expand chevron for
  nodes whose only children are bundles (filtered out of the rendered kids);
  `NewIdeaModal.tsx:119-122` accepts negative durations;
  `QuickAdd.tsx:24` stores `source_url` verbatim with no scheme check — nothing
  renders it as an `href` today (grep-verified), but add the one-line `http(s):`
  allowlist at capture time before some surface does.

### Feature modules — duplication & structure

- **F19 (Medium) — Five hand-rolled copies of the same popover contract**
  (open → focus first item, Escape → close + restore focus, outside-pointerdown →
  close): `board/IdeaActionsMenu.tsx:52-69`, `board/FilterBar.tsx:168-188`,
  `board/BulkBar.tsx:102-115`, `itinerary/SwapDayMenu.tsx:53-70`,
  `itinerary/UnplacedRail.tsx:133-150` — and they already drift (BulkBar lacks
  outside-click close; FilterBar excludes the trigger from outside-click, the
  others don't). Extract `usePopover(triggerRef, containerRef)`; same for the
  byte-identical `moveFocus` arrow-key walker in `SwapDayMenu.tsx:73-98` and
  `UnplacedRail.tsx:164-191`.
- **F20 (Medium) — Bulk fan-out invalidation storms.**
  `Promise.all(ids.map(m.mutateAsync))` where each mutation's `onSuccess`
  invalidates the whole `['entries']` prefix: `BulkBar.tsx:142,157,169`,
  `BundleCard.tsx:206`, `TakeSomewhereModal.tsx:53` — N mutations ⇒ N
  refetch rounds mid-flight. Add bulk-path mutation variants that skip per-call
  invalidation, with one `invalidateQueries` after the `Promise.all`.
- **F21 (Low)** — The toast string "That didn't save. It's still here — try again."
  is spelled out ~15 times; hoist next to `useToast`. The sort comparator in
  `itineraryModel.ts:120-127` duplicates `scheduleModel.ts:73-80` — share a generic
  `sortByStartThenPosition`. `dayPlan.ts:63-77` regex-parses the human "Day N"
  label to recover the index — pass the index as data instead.
- **F22 (High, lives in `src/components`) — `Modal`'s focus effect depends on
  `onClose` identity** and steals focus mid-keystroke unless every caller memoizes
  its close callback — four features currently carry the workaround
  (`NewIdeaModal.tsx:76-86`, `NewBundleModal.tsx:44-46`, `SharePanel.tsx:130-134`,
  `NewTripModal.tsx:85-89`). Fix `Modal` at the source (run the focus effect on
  open/close only, keep `onClose` in a ref) and delete four `useCallback`s plus a
  recurring bug class. Similarly `components/Field` throws when handed an `<input>`
  child (documented in `NewIdeaModal.tsx:68-74`).

### Performance & UX

- **F23 (Medium) — `useBundleMembers` re-render cascade.**
  `src/features/board/useBundleMembers.ts:36-42`: in TanStack v5, `useQueries`
  without `combine` returns a fresh array each render, so the `useMemo` recomputes
  and the returned `Map` changes identity every render — cascading into every
  `IdeaRow`'s `bundleNames` memo re-filtering bundles×members per row per render.
  Use the `combine` option (memoized by v5) to return a stable map.
- **F24 (Low)** — `IdeaRow` isn't memoized and `selectedIds.includes(id)` is O(n)
  per row (`IdeaList.tsx:76-91`), so toggling one pick re-renders every row; same
  pattern in the library list on every search keystroke. Fine at current scale;
  `memo(IdeaRow)` + a `Set` is the two-line fix when boards grow.
- **F25 (Observation, fine as-is)** — No optimistic updates anywhere: every
  drag-drop waits for server + refetch. That's the safe half of the trade at this
  scale. If drop latency ever feels bad, start with `setQueryData` on
  `queryKeys.entries.detail(bundleId)` — the cache-compatible key
  `useBundleMembers` deliberately chose (`useBundleMembers.ts:20-27`) makes that a
  clean insertion point.
- **F26 (Observation)** — `MapView.tsx` is clean on the classic leak vectors:
  observer disconnected, rAF cancelled, StrictMode-guarded refits, escaped pin
  HTML. Cluster keys churn on zoom (full marker remounts) — acceptable at MVP pin
  counts.

### Frontend test coverage

The model files are the best-tested code in the tree (`itineraryModel.test.ts` 47
cases, `dayPlan.test.ts` 34, `filters.test.ts` 30, `useDayDrop.test.ts` 19 including
keyboard-walk geometry), and the big interactive components have substantial
behavioral suites. Priority gaps: `useBundleMembers`/`useLinkMutations` (the board's
data spine — untested), `useGeolocation` error paths, `IdeaActionsMenu`/`SwapDayMenu`
(indirect coverage only), `RowOptions` (the one mutating component on the final
schedule), and the library trio (`QuickAdd`, `LibraryRow`, `LibraryFilterBar`).
`MapView` being untested is a documented, defensible jsdom trade — its logic lives in
the tested `bounds`/`clustering`/`pins`/`markerIcon` modules. On the MSW side, note
the role-check gap flagged under "Mocks" above.

---

## Priority shortlist

If only five things get fixed, fix these:

1. **H1** — make `kind` create-only; stop member-level trip demotion wiping
   memberships (`entries_controller.rb` + `entry.rb`).
2. **H2/H3/M0a as one change** — validate every writable foreign key
   (`entry_id`, `chosen_entry_id`, `day_version_id`, `lodging_entry_id`) against the
   trip/visibility, and add the "hostile insider" dimension to the authorization
   sweep test.
3. **F1+F3** — error states on the six screens plus global 401 handling; a shared
   `<QueryGate>` gets most of it.
4. **F7** — `EntryDetail` blur-save: diff before PATCH, `Number.isFinite` guard so
   typos stop wiping coordinates.
5. **F22/F23** — fix `Modal`'s focus effect and `useBundleMembers`' `combine`; both
   are single-file fixes that delete workarounds elsewhere.
