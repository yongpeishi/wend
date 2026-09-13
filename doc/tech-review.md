# Wend — Technical Review, Round 2

Reviewed 2026-09-13 against `main` at `aea8da8`. Round 1 is `doc/tech-review-1.md`
(2026-08-17); 281 commits have landed since. Scope: the full Rails 8.1 API backend
(`backend/`) and the React 19 / TanStack Query v5 frontend (`frontend/src`). The
backend models, controllers, policies, serializers and service were read directly;
config, schema, tests and the four frontend areas were reviewed by parallel passes and
merged here. Findings are ordered by impact within each section, and each carries a
`file:line` against this commit.

**Overall verdict:** the codebase is materially better than in round 1. Every High
finding from round 1 is fixed, and fixed at the right layer (validations on the model,
not guards in the controller). The new work — sessions with server-side revocation,
rate limiting, delete-for-good with a preview that cannot lie, member times, feedback
with screenshot uploads, the optimistic link cache — is consistently well-reasoned and
well-commented. The review below is therefore mostly about (a) round-1 Mediums that are
still open, (b) new seams introduced by the new features, and (c) the first
scalability walls, which are now visible and worth naming even if not worth building
for yet.

Three things stand out:

1. **One anonymous-reachable hole.** Active Storage's unauthenticated
   `POST /rails/active_storage/direct_uploads` route is drawn and unused, so anyone can
   mint blob rows and presigned R2 uploads outside the feedback model's limits — and the
   `bin/brakeman` wrapper CI calls currently exits without scanning. See §4 D.
2. **The `kind: "trip"` invariant is enforced in exactly one of six places.** Five
   `trips/:trip_id/...` controllers accept any visible entry id as a "trip", nothing
   validates that `schedule_items.trip_id`, `trip_days.trip_id` or `todos.trip_id` point
   at a trip, and `absorb` leaves a demoted trip's itinerary dangling. See §1 / §4 B2.
3. **Frontend: five real user-facing bugs and a fat container layer.** Enter on a Cancel
   button saves (FH1), the itinerary claims "nothing kept" while loading (FH2), the trip
   card wipes a description mid-edit (FH3), nothing guards double-submit (FH4), and
   `TripBoard.tsx` (826 lines), `TripMap.tsx` (742), `TripItinerary.tsx` (707) each hold a
   dozen mutations and screen state that belongs in per-feature hooks. See §1 and §5.

Suites at this commit, run during this review: backend 448 runs, 0 failures; frontend
`tsc` clean, `oxlint` only the known `only-export-components` baseline, 126 test files /
2234 tests passing. Nothing below was found by a failing test; everything was found by
reading.

---

## 0. Status of round-1 findings

Only items not marked `[DONE]` in round 1 are listed. Evidence is `file:line` at
`aea8da8`.

### Backend

| Round-1 item | Status | Evidence |
|---|---|---|
| Controllers carry lift/absorb/fork logic (Medium) | **Open** | `entries_controller.rb:165-217` still open transactions and manipulate links inline. |
| `TodosController#index` two queries + Ruby merge (Medium) | **Open** | `todos_controller.rb:13-21`. |
| `Entry` God-object (Low) | Open, grown | `entry.rb` is 299 lines and gained the member-times association; no concern extracted. |
| No pagination (Low) | Open | `entries_controller.rb:32` materializes every visible entry. |
| `schedule_items.position` / `todos.position` nullable (Medium) | **Open** | `db/schema.rb:139`, `:165` — both still `default: 0` with no `null: false`; `todos_controller.rb:21` still sorts on `t.position`. |
| `from_entry_id`/`to_entry_id` unused (Low) | Open, and worse | Still on the row, still permitted on write (`entries_controller.rb:242`), still serialized; the frontend's only reference is the type definition. See §4 B4. |
| `render`/`errors` ceremony (Medium) | **Fixed** | Every mutation uses `save!`/`update!` and the global rescue. |
| `truthy?` / `next_position` / scheduled-ids duplication (Low) | **Fixed** | `base_controller.rb:57`, `entry_link.rb:30`, `schedule_item.rb:61`. |
| LIKE wildcards unescaped (Low) | Open | `entries_controller.rb:26`. |
| M0b — depth caps disagree; nested trips allowed | **Open** | `entry.rb:250` (`role_for` walks 10), `entry.rb:222` (`library?` walks 10) vs `VISIBILITY_DEPTH_CAP = 20`; `entries_controller.rb:65-73` still accepts `kind: "trip"` with a `parent_id`. |
| M4 — `swap_days!` parking collision | Open | `trip_day.rb:69`. Acceptable; see round 1. |
| M5 — vote / collaborator upsert races 500 | Open | `votes_controller.rb:6-8`, `collaborators_controller.rb:62`. |
| L0a — sign-in timing oracle | Open | `sessions_controller.rb:14-15` still `user&.authenticate`; `User.authenticate_by` unused. |
| L0c — `VotePolicy` dead code | Open | `vote_policy.rb` still exists; `votes_controller.rb:23` authorizes via `EntryPolicy#vote?`. |
| L0d — `entries#show` serializes twice | Open | `entries_controller.rb:47-49` calls `detail` (which builds `one`) then `one` again. |
| L1 — `DayVersions#create` no day range check | Open | `day_versions_controller.rb:13-15`; `trip_days_controller.rb:12-14` has the same gap. |
| L2 — `TripDateShift#shift!` row-at-a-time | Open | `trip_date_shift.rb:129-136`. Fine. |
| L4 — feedback `url`/`element_selector` unbounded | Open | `feedback.rb:48` caps `message` only. |
| L5 — `TodoPolicy::Scope` interpolates `to_sql` | Open | `todo_policy.rb:14-16`. |
| Deploy readiness (CORS, database.yml, hosts, force_ssl, seeds) | See §4 D | Verified per item below. |

### Frontend

Recorded in §5 under each item (F2, F4, F5, F6, F8–F21, F24 and the §2/§3 frontend
suggestions).

---

## 1. Architecture & Code Structure

### Backend

**What's good and new since round 1:**

- **`Session` as a row** (`app/models/session.rb`) with `has_secure_token`, a
  30-day `expires_at`, `Session.active` on every request and a fresh row per sign-in
  (`application_controller.rb:23-47`). This is exactly the M3 fix asked for, and
  revocation is real rather than cookie-deep.
- **`EntryPermanentDeletion`** (`app/services/entry_permanent_deletion.rb`) is the
  best-designed unit in the codebase: preview and destroy share one memoized walk, the
  survivor computation is a readable fixed-point pass, the audit row is written in the
  same transaction, and the cascade destroys only what the actor could destroy one at a
  time. Keep this as the template for future domain operations.
- **The foreign-key validations** on `ScheduleItem` (`schedule_item.rb:90-145`),
  `TripDay` (`trip_day.rb:29,139-152`) and `ScheduleItemMemberTime`
  (`schedule_item_member_time.rb:40-59`) close the whole H2/H3/M0a family at the model
  layer, gate on `will_save_change_to_*` so unrelated saves don't pay the walk, and
  deliberately return one message for "missing" and "someone else's" so ids are not an
  oracle. This is the right shape.
- **`Feedback`'s upload-inside-the-transaction dance** (`feedback.rb:53-62,125-156`)
  solves a real Active Storage footgun. It does reach into
  `attachment_changes["screenshots"].pending_uploads`, which is not public API — pin it
  with the existing model test so an Active Storage upgrade cannot silently reintroduce
  the after-commit double upload.
- **Admin bearer token as a `TokenPrincipal`** (`admin/base_controller.rb:32-35`)
  that only answers `admin?` is a nice way to make "the token is not a person" a
  runtime fact rather than a comment.

**Findings:**

- **Medium — the "trip" invariant is enforced in one controller out of six.**
  `CollaboratorsController#set_trip` scopes on `kind: "trip"`
  (`collaborators_controller.rb:116`); `ScheduleItemsController`, `ItinerariesController`,
  `TripDaysController`, `DayVersionsController#create` and `NearbyController` all do
  `policy_scope(Entry).find(params[:trip_id])` with no kind check
  (`schedule_items_controller.rb:46`, `itineraries_controller.rb:38`,
  `trip_days_controller.rb:24`, `day_versions_controller.rb:10`, `nearby_controller.rb:28`).
  `TripMembership` validates `trip_must_be_a_trip` (`trip_membership.rb:25-27`) but
  `ScheduleItem`, `TripDay` and `Todo` do not. Authorization still holds (the role
  resolves through the idea's trip), so this is integrity, not security — but it means
  an idea can own trip_days, versions and schedule items, and `absorb`
  (`entries_controller.rb:177-188`) demotes a trip to an idea while its `trip_days`,
  `schedule_items_as_trip` and `trip_todos` keep pointing at it. Fix once, in the
  models, and make the controllers uniform:

  ```ruby
  # app/models/concerns/belongs_to_trip.rb
  module BelongsToTrip
    extend ActiveSupport::Concern
    included do
      validate { errors.add(:trip, "must be a trip") if trip_id.present? && !trip&.trip? }
    end
  end
  # ScheduleItem, TripDay, Todo: include BelongsToTrip

  # every set_trip:
  @trip = policy_scope(Entry).where(kind: "trip").find(params[:trip_id])
  ```

  And decide what `absorb` does with the folded trip's plan: either destroy its
  `trip_days`/`schedule_items_as_trip` inside the same transaction (they are
  placements, so this is allowed by the architecture doc) or refuse to absorb a trip
  that has any.

- **Medium — `lift` rewrites `created_by`** (`entries_controller.rb:170`). It does so
  only to make `sync_owner_membership` mint the right owner, but `created_by_id` now
  has product meaning it did not have in round 1: `created_by_me` on the wire
  (`entry_serializer.rb:43`) and the authorship branch of
  `EntryPolicy#destroy_permanently?` (`entry_policy.rb:23`). A member lifting a
  co-traveller's idea silently takes authorship of it. Keep `created_by` and create
  the membership explicitly:

  ```ruby
  ActiveRecord::Base.transaction do
    @entry.parent_links.destroy_all
    @entry.update!(kind: "trip", category: nil)
    TripMembership.where(trip_id: @entry.id).delete_all
    TripMembership.create!(trip_id: @entry.id, user_id: current_user.id, role: "owner")
  end
  ```

  (`sync_owner_membership` would then need `find_or_create_by!` keyed on "any owner
  exists" rather than on `created_by_id`, or be dropped from the lift path.)

- **Medium — lift/absorb/fork still live in the controller** (round 1). Now that
  `EntryPermanentDeletion` exists as the template, `Entry#lift!(by:)`,
  `Entry#absorb_into!(target)`, `Entry#fork!(by:)` are a mechanical move that would
  also make the `created_by` and dangling-itinerary points above testable without HTTP.

- **Low — depth caps are still three different numbers.** `DEFAULT_DEPTH_CAP = 10`
  (`entry.rb:8`) is used by `role_for`, `library?`, `descendants`, the `?trip_id=`
  filter (`entries_controller.rb:17`), nearby (`nearby_controller.rb:35`) and todos
  (`todos_controller.rb:16`); `VISIBILITY_DEPTH_CAP = 20` by visibility and the three
  FK validations; `with_trip_ancestor_ids` hardcodes `20` (`entry.rb:188`). An entry at
  depth 11–20 is visible, placeable and lodging-eligible but never listed under
  `?trip_id=`, never counted in the checklist, and resolves to no role. One constant,
  used everywhere, closes M0b's first half. Forbidding `kind: "trip"` under a parent at
  create (`entries_controller.rb:65`) closes the second.

- **Low — `Entry` is now 299 lines and two concerns would pay for themselves.**
  `EntryGraph` (the four recursive-CTE class methods + instance walks,
  `entry.rb:152-224`) and `ProsCons` (`entry.rb:123-150,275-298`). Pure moves.

### DB schema

- **Good:** `schedule_item_member_times` is exactly right — `null: false` FKs, unique
  `[schedule_item_id, entry_id]`, real foreign keys (`schema.rb:120-129`). `sessions`
  has a unique token index. `entry_deletions` is append-only in the model and carries
  no FK to the destroyed entry by design.
- **Medium — `schedule_items.position` and `todos.position` are still nullable**
  (`schema.rb:139,165`; round 1). `todo_params` permits `:position`
  (`todos_controller.rb:69`), so `PATCH {position: null}` stores `NULL` and the next
  `GET /api/todos?trip_id=` 500s at `todos_controller.rb:21` on a `nil <=> Integer`
  comparison. One migration: `change_column_null :todos, :position, false, 0` and the
  same for `schedule_items`.
- **Low — no `ends_on >= starts_on` anywhere on the server.** `Entry` validates
  `title` only (`entry.rb:62`); the only guard is `DatesGate.tsx:100` in the client.
  `TripDateShift#in_range?` (`trip_date_shift.rb:110-114`) with an inverted range drops
  every planned day. Add `validate :ends_not_before_starts, if: :trip?`.
- **Low — a garbage date silently clears the date.** `starts_on: "not a date"` casts
  to `nil` in both `TripDateShift.cast_date` (`trip_date_shift.rb:32-34`) and
  `update!`, so a typo wipes a trip's start with a 200. Compare
  `Date.iso8601` in `ItinerariesController#parse_day` (`itineraries_controller.rb:47-51`),
  which 422s — do the same in `entry_params`.
- **Low — string enums without CHECK constraints.** `entries.kind`, `entries.category`,
  `trip_memberships.role`, `feedbacks.status` are all model-validated strings on SQLite,
  which supports `CHECK`. Cheap to add; protects against console/seed mistakes.
- **Low — `entry_deletions.entry_id` has no index** (`schema.rb:84-92`). The table's one
  stated purpose is "where did my trip go?", which is a lookup by `entry_id`.
- **Low — `from_entry_id`/`to_entry_id` remain the only writable FKs that are not
  validated** — see §4 B4 for why that now matters more than "dead columns".

### Frontend

**What's good and new since round 1:**

- **`<QueryGate>`** (`components/QueryGate.tsx`) was adopted everywhere it was
  suggested: eight routes plus `BundlePanel`, `isPending`-aware, multi-query, refetches
  only the failed query. F1 is closed as a class, with the stragglers noted in §5 FH2.
- **`Modal`** is fixed at the source (`Modal.tsx:49-51,65-72` ref pattern, F22) and
  **`useBundleMembers`** uses `combine` (F23). The mutation-cache `onError` for 401
  (`api/queryClient.ts:16-20`) and `useMutationState` for the in-flight fade are correct
  modern v5.
- **The optimistic link cache** (`api/linkCache.ts`, `api/links.ts`,
  `features/board/useLinkMutations.ts`) is sound: v5 runs `onSettled` before the success
  dispatch, so the "last mutation standing refetches" gate really is last-standing, and it
  is tested (`useLinkMutations.test.tsx:138-171`). Rollback breadth and the detail-only
  cancel are documented trade-offs.
- **`usePlaceSearch`** genuinely unifies both place searches (`MapSearch.tsx:79-82`,
  `AddressSearch.tsx:90-96`); F16's abort flash is gone (`usePlaceSearch.ts:167`).
- **`FeedbackComposer`'s object-URL hygiene** is correct and tested (one URL per file,
  revoked on remove/reset/unmount, StrictMode-safe).
- **Linkify is safe** (§5, "XSS / href").

**Findings:**

- **High — the route files are now the fat layer.** Five containers each hold a dozen
  mutation hooks, toast wiring, DnD sensors and screen state. This is the biggest
  structural debt in the frontend, and it is also what blocks `memo()` on the row
  components (every row gets fresh inline lambdas per container render). Concrete
  extractions, all mechanical:
  - `TripBoard.tsx` (826): `useBoardPath()` (search-param drill + `setPath`/`drillInto`/
    `openIdeaFromPlan`, `:226-306`); `useShiftSelect(orderedIds)` (`:380-394`, shared with
    `Library.tsx:66-80`); `useBoardComposer()` (`:144-148,193-212,440-529`);
    `<BoardBreadcrumbs>` (`:671-711`); `useBoardDnd(canEdit)` (`:372-378,531-564,807-813`).
  - `TripItinerary.tsx` (707): `useItineraryActions(tripId, show)` wrapping the 11 mutation
    hooks and the inline `mutate(…, {onSuccess: toast})` blocks (`:167-178,568-607,642-654`);
    `useItineraryDnd(days, canEdit)` (`:233-290,468-480,660-666`); `useTripDatesFlow(trip)`
    (`:147-165,432-466,486-523`); move `useEditItemHours` (`:695-707`) into
    `api/schedule.ts` with the id in the variables.
  - `TripMap.tsx` (742): `useMapCapture()` (dropMode/preview/pending state + every
    `handle*`, `:283-515`); `useViewRequests()` (`:120-125,219-230`); the three identical
    create payloads (`:372-382,400-410,486-495`) as `placeToEntry(place)`;
    `<MapCaptureCards>` (`:687-724`).
  - `AppLayout.tsx` (497): `<TripSidebarSection tripId>` owning `useEntry` /
    `useCollaborators` / sharing (`:299-432`) — today the layout fires both hooks on every
    route just to draw the sidebar (`:174,187`); `useDrawer()` (`:88-147`).
  - `EntryDetail.tsx` (517): `useEntryDraft(entry, updateEntry)` (`:196-249`),
    `<EntryFields>` (`:345-451`), `<EntryFacts>` (`:453-475`).
  - Feature components of the same shape: `BundleCard.tsx` (768) → `useMemberReorder()`
    (`:202-262,351-455`) + `<MemberRow>` (`:625-728`); `IdeaRow.tsx` (704) →
    `<PlansPopover>` (`:244-264,564-596`), `<IdeaEditForm>` (`:312-380`),
    `<IdeaRowActions>` (`:562-654`); `IdeaComposer.tsx` (538) → `<ParentPicker>`
    (`:294-305,452-519`), `<CategoryRadios>` (`:427-450`); `MapIdeaList.tsx` (473) →
    split `MapIdeaActions` (`:339-473`) into its own file.
- **Medium — id-bound mutation hooks force sentinels and forks.** `useUpdateEntry(id)` /
  `useUpdateScheduleItem(id)` bind the id at hook time, so callers write
  `useUpdateEntry(entryId ?? 0)` (`EntryDetail.tsx:178`), `useUpdateEntry(… : -1)`
  (`TripMap.tsx:141`) and fork `useEditItemHours` (`TripItinerary.tsx:695-707`).
  `api/admin.ts:50-53` and `useUpdateMemberTime` (`schedule.ts:72-83`) already use the
  v5-idiomatic `mutate({ id, ...payload })` shape. Eight callers, all mechanical; deletes
  the fork and both sentinels.
- **Medium — map filter state is local, not URL.** `TripMap.tsx:111-117` keeps
  filter/group/follow in `useState` while `mapFilters.ts:42-44` says it "can live in a
  URL" and `TripBoard` already persists `?path=`. Board→Map→Board drops the map's
  filters; no shareable filtered map. `planId` and `categories` belong in search params.
- **Medium — one `ErrorBoundary` above the router** (`App.tsx:26`). Any route crash
  unmounts the shell, and "Try again" (`ErrorBoundary.tsx:34`) only clears state, so a
  deterministic render error re-throws immediately. Bump a `key` on reset and add a
  boundary around `<Outlet>` in `AppLayout` (or a route-level `errorElement`).
- **Low — `TripLayout`'s outlet context still carries a dead payload** (F12):
  `TripLayout.tsx:140-148` passes `role/canEdit/canDelete/canShare`; all five consumers
  destructure only `trip`. Export a `useTrip()` from `TripLayout` that owns the context
  type, and the five `useOutletContext<{ trip: Entry }>()` assertions go with it.

---

## 2. Duplication & Simplification

### Backend

- **Low — five `set_trip` helpers.** The same three lines appear in
  `schedule_items_controller.rb:45-47`, `itineraries_controller.rb:37-39`,
  `trip_days_controller.rb:23-25`, `day_versions_controller.rb:10` and
  `nearby_controller.rb:28`; the sixth (`collaborators_controller.rb:115-117`) is the
  correct one. A `TripScoped` controller concern with one `set_trip` (with the kind
  check) removes four copies and fixes §1's invariant at the same time.
- **Low — `ends_not_before_starts` is copy-pasted** between `schedule_item.rb:147-152`
  and `schedule_item_member_time.rb:61-66`, together with the two identical
  `numericality` blocks (`0..1439`). A `MinuteRange` concern (or a shared validator)
  covers both and the future `Entry` date-order rule.
- **Low — the "ids from `select_values` are not guaranteed Integer" `.map(&:to_i)`
  incantation appears five times** with the same comment (`entry.rb:250`,
  `schedule_item.rb:126`, `trip_day.rb:146`, `entry_link.rb:58`,
  `entry_permanent_deletion.rb:112`). Do the cast once inside `ancestor_ids_of` /
  `descendant_ids_of` and delete the five comments.
- **Low — `DayVersion#copy_item!` runs one descendant walk per copied item.**
  `schedule_items.create!` (`day_version.rb:107`) is a new record with `entry_id`
  present, so `entry_fks_belong_to_trip` fires per item; a 15-item day forks with 15
  recursive CTEs. Memoize the walk per `trip_id` for the request
  (`RequestStore`-style thread-local, or pass `descendant_ids` in), or skip the
  validation on copies whose source row already passed it.
- **Low — `entries#show`** builds the same aggregate hash twice (round-1 L0d) —
  `detail` already contains everything `one` returns; render `detail` directly.

### Frontend

The round-1 duplication list is essentially untouched, and most items have grown a copy
or two. Ranked by lines saved and bugs closed together:

- **High — the popover contract now has nine copies** (round 1's five plus
  `MapFilterBar.tsx:126-145`, `MapIdeaList.tsx:351-367`, `MapSelectionBar.tsx:76-88`,
  `PlansDropdown.tsx:56-69`), and `PlacePreviewCard.tsx:95-129` has none of it (no
  Escape, no outside-click, no focus move). They drift three ways: document-mousedown vs
  catcher-button vs nothing; only `FilterBar`/`BulkBar` move focus in on open; `BulkBar`
  stops Escape propagation, the itinerary two don't. The `moveFocus` arrow walker is still
  byte-identical in `SwapDayMenu.tsx:88-115` / `UnplacedRail.tsx:167-194`. One
  `usePopover({ open, onClose, triggerRef, panelRef, focusFirst })` plus
  `useArrowWalk(menuRef, selector)` closes F19, the a11y drift in §3, and ~300 lines.
- **High — the inline-edit contract has six hand-rolled copies, and the bugs live in
  the differences.** BundleCard rename (`:273-302,521-555`), BundleCard add-idea
  (`:470-501,739-765`), TripCard title/description (`:119-164,175-188,257-269`), ProsCons
  add (`:71-85,138-155`), NewBundleForm (`:64-99`), `DeadlineField.tsx:121-162`. Same
  contract everywhere: Enter commits, Escape reverts, blur commits, focus returns,
  commit-once. Only ProsCons has the `settled` guard; BundleCard, TripCard and
  DeadlineField each double-commit or lose input (§5 FH3, F15a, FM10). Extract:

  ```ts
  function useInlineEdit({ initial, onCommit, onCancel }) {
    const settled = useRef(true);
    const [draft, setDraft] = useState(initial);
    const open = () => { settled.current = false; setDraft(initial); };
    const commit = () => { if (settled.current) return; settled.current = true; onCommit(draft.trim()); };
    const cancel = () => { settled.current = true; onCancel?.(); };
    return { draft, setDraft, open, commit, cancel,
             fieldProps: { value: draft, onChange, onBlur: commit, onKeyDown } };
  }
  ```

  One hook fixes F15a, F15c, FH3 and FM10, and removes ~120 lines.
- **Medium — `MapFilterBar` vs board `FilterBar` are ~85 % identical** (`activeFilters`
  `:53-65`/`:54-70`, the open/focus/Escape effect, the trigger + count badge + What/State
  chip popover `:166-258`/`:184-278`, the active-chip row `:292-310`/`:304-322`). Extract
  `<FilterPopover sections>` + `<ActiveFilterChips>`; each bar keeps its own reducer.
  `LibraryFilterBar.tsx:47-55` is a third copy of the category chip row.
- **Medium — `MapSelectionBar` vs `BulkBar`**: `linkAllTo`/`addAllTo`
  (`:123-138`/`:137-152`), the Escape effect, the catcher + panel + "New plan" row +
  `NewBundleModal` wiring (`:161-227`/`:204-271`) are byte-alike. Extract
  `<AddToPlanMenu selectedIds bundles tripId onDone>` owning the popover, the
  membership skip and the modal.
- **Medium — `parseTime` / `normalise` / `Problem` / `findProblem` are copied verbatim**
  from `TimeEditor.tsx:45-108` into `TimePrompt.tsx:42-95` (the comment at
  `TimePrompt.tsx:29-36` acknowledges it). Validation logic is not "private business";
  extract `features/itinerary/timeInput.ts` plus a `useTimePair(start, end)` hook for the
  `tried`/`showing` choreography both repeat.
- **Medium — invalidation lists are hand-copied and already disagree.**
  `[schedule, itinerary]` at `api/schedule.ts:22-28`, `api/itinerary.ts:41`,
  `TripItinerary.tsx:702-705`; `[entries, itinerary, schedule]` at `api/entries.ts:159-161`
  and `:327-329`. Some `return Promise.all`, most `void`. An `api/invalidate.ts` with
  `invalidatePlacements(qc)` / `invalidateTrip(qc)` is also the one place to fix F9.
- **Medium — three name dialogs** (`NewBundleModal`, `NewTripModal`,
  `TakeSomewhereModal`) share reset-on-open, `isPending` gate, Enter submits, Cancel
  disabled while working; the confirm dialog in `AdminFeedback.tsx:467-488` is
  `DateShiftWarningModal`'s shape again. `<NameDialog>` and `<ConfirmModal>`.
- **Low — round-1 duplicates still standing, now with more copies:**
  `SAVE_FAILED` literal in 23 non-test files, declared as a local const in seven
  (`TripBoard:57`, `TripItinerary:59`, `TripMap:35`, `BundleCard:31`, `IdeaRow:18`,
  `IdeaTodos:16`, `MapIdeaList:14`) — export it from `components/Toast.tsx` (F21);
  `useShiftSelect` still byte-identical (`TripBoard.tsx:380-394` / `Library.tsx:66-80`);
  `formatMinutes` still twice (`api/schedule.ts:86-93` null-tolerant,
  `lib/formatDates.ts:77-81` not) and `formatSpan` (`itineraryModel.ts:338-342`) =
  `formatTimeRange` (`formatDates.ts:83-91`); `sorted` (`itineraryModel.ts:184-191`) =
  `sortDayItems` (`scheduleModel.ts:73-80`); `patchTripDates`'s hand-rolled `fetch`
  (`api/entries.ts:104-143`) now has a twin in `deleteEntryPermanently` (`:260-311`) whose
  own comment says "the same fix applies to both" — add `body` to `ApiError`;
  `ideaCount()` ×3 (`MapSelectionBar:36`, `PlansDropdown:18`, `BulkBar:38`) and "N idea(s)"
  pluralising ×5 more; `(data ?? []).filter(e => !e.archived_at)` ×8 →
  `useEntries(q, { select: liveOnly })`; `todayIso` (`DatesGate.tsx:36-41`) re-implements
  `scheduleModel.ts:20-28`; label re-parsing (`dayPlan.ts:64-71` "Day N" regex,
  `DayCard.tsx:150` `label.split('·')[1]`) — put `index`/`dateLabel` on the day objects;
  `placeName()` twice (`TripMap.tsx:69-72`, `PlacePreviewCard.tsx:29-32`); the
  centered-spinner wrapper ×3; the sign-out handler ×2; delete-for-good toast wiring ×3.

---

## 3. Idiomatic Practices & Community Guidelines

### Backend

- **Good:** `rate_limit` (Rails 8 built-in) with an explicit store so it is testable
  (`sessions_controller.rb:7-10`, `application_controller.rb:8`); `has_secure_token`
  for sessions; `verify_authorized`/`verify_policy_scoped` still deny-by-default with
  empty exemption lists; `find_each(&:destroy!)` for cascades that must fire callbacks;
  `send_data` for CSV.
- **Sorbet is installed but unused.** `sorbet-static-and-runtime` and `tapioca` are in
  the Gemfile, `backend/sorbet/` holds 11 MB of RBIs (228 files), and there is not one
  `# typed:` sigil or `sig` in `app/`. This is pure carrying cost — the gems, the RBI
  churn on every `tapioca dsl`, and the `bundle install` time. Either adopt it (start
  with `# typed: true` on the three PORO objects: `TripDateShift`,
  `EntryPermanentDeletion`, the serializers) or remove it. For a side project, remove.
- **Acceptable:** raw SQL for the CTEs and haversine (unchanged, still documented and
  parameterized); the PORO serializers (still consistent, `summary` is now the one
  `EntrySummary` shape — good).
- **Low — `rate_limit` keyed on `[ip, email]` protects the wrong thing.**
  (`sessions_controller.rb:7-8`). The comment explains why (the test suite), but the
  result is that one IP can try 10 passwords against *each* of unlimited emails, and one
  email can be tried from unlimited IPs. Add a second, looser per-IP limit alongside it
  (Rails 8.1 `rate_limit` takes `name:` so two can coexist), e.g.
  `rate_limit to: 100, within: 1.minute, name: "per_ip"`. Note also the store is a
  per-process `MemoryStore` (`application_controller.rb:8`), so under Puma with N
  workers the effective limit is N×10.
- **Low — `User.authenticate_by`** replaces `user&.authenticate` and closes the
  timing oracle (L0a) in one line.
- **Low — `VotePolicy` is still dead** (L0c). Delete it; the rule lives in
  `EntryPolicy#vote?`.

### Frontend

- **Good:** `queryKeys` factory, `QueryGate`, `combine`, mutation-cache `onError` for
  401, `useMutationState`, the settle-once link cache, pure `*Model.ts` files with real
  suites. The api layer is in good shape; the debt is in the containers and the
  still-open round-1 list.
- **Effects that sync state — nine instances, all the same anti-pattern.**
  `TripCard.tsx:83-86` (resets both drafts on any prop change — this one loses data, §5
  FH3), `IdeaRow.tsx:238-240,268-270`, `NewBundleModal.tsx:51-53`,
  `IdeaComposer.tsx:238-262` (nine setters on the open flip), `EntryDetail.tsx:201-213`
  (with an eslint-disable), `DatesGate.tsx:87-88`, `TimeEditor.tsx:111-112`,
  `TimePrompt.tsx:111-113`, `TripSchedule.tsx:49-65` (`useIsNarrow` is
  `useSyncExternalStore`). The React 19 idiom is a `key` on the inner component
  (`<IdeaComposer key={nonce}>`, `<EntryForm key={entry.id}>`) or deriving
  (`const editing = expanded && editingRequested`). For a side project this matters
  exactly where it loses input: fix TripCard now, the rest as touched.
- **`onSuccess` returning `void` vs the promise** is inconsistent (`todos.ts:30-34`
  awaits, everything else doesn't). It matters once (§5 FM3); pick one.
- **`retry: 1` applies to 4xx** (`api/queryClient.ts:31-32`): a 404 trip sits on the
  spinner through a retry + backoff.
  `retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 1` — and this is
  the natural home for the F2 fix.
- **`AuthContext`'s `useMemo` is still a no-op and its comment still wrong** (round 1;
  `auth/AuthContext.tsx:25-39`): deps include the three `useMutation` results, which are
  new objects every render. Four consumers; delete the memo or depend on the stable
  pieces.
- **ARIA (round 1 still open, plus new):** `TabBar` is still `tablist/tab` as a
  value-picker (`TabBar.tsx:57,69`; used at `MapFilterBar.tsx:281`, `FilterBar.tsx:290`)
  — `radiogroup/radio`; `Drawer` still has no trap and its effect is keyed on `onClose`
  (`Drawer.tsx:24-32`, the F22 bug Modal fixed); only `DesignGallery.tsx:410` uses it —
  delete it. New: `aria-haspopup="true"` on `role="group"` popups (`SwapDayMenu.tsx:123`,
  `UnplacedRail.tsx:232`, `IdeaRow.tsx:248-264`) announces a menu that isn't one; every
  `GapRow` button is named "Fill it" (`GapRow.tsx:30-34`) — add the hours to the label;
  `BulkBar.tsx:209-215` is a focusable `aria-hidden` button; `AddressSearch.tsx:182,219`
  points `aria-activedescendant`/`aria-controls` at ids that only exist while open.
- **Modal has no focus restore and no scroll lock** (`Modal.tsx`; `Modal.module.css:6`),
  and nested overlays share one document `keydown` (`:73-106`), which is why
  `MapSelectionBar.tsx:82`, `PlansDropdown.tsx:63` and `BulkBar.tsx:109` all reach for
  `stopPropagation` in their own document listeners. Cure it in Modal: record
  `activeElement` on open, restore on close, only the top-most dialog handles Escape.
- **TypeScript:** `EntryDetail.save` is stringly typed (`:196` `Record<string,string>`,
  `:235`/`:242` casts) — a `DraftField` union removes the casts; `entriesWithCoordinates`
  (`features/map/pins.ts`) has a type guard but returns `Entry[]`, forcing casts at
  `TripBoard.tsx:346`, `Library.tsx:61`, `TripMap.tsx:151`;
  `useEntries(q, options?: Partial<UseQueryOptions>)` (`entries.ts:20-25`) lets callers
  override `queryKey` — narrow to `Pick<…, 'enabled' | 'staleTime'>`;
  `MapFilterBar.tsx:285` `key as MapGroupMode` defeats the narrowing
  `mapScreen.ts:113-118` exists for.
- **Design system:** `Switch` exists (`design/components/core/Switch.tsx:19-23`, "Follow
  the map is the first setting of this shape") but "Follow the map" is a hand-rolled
  `aria-pressed` button (`MapFilterBar.tsx:265-273`); `Button size="small"` is documented
  as never the only way to reach a primary action, yet it is in `DroppedPinCard.tsx:62`
  and `PlacePreviewCard.tsx:69,91`; no dark theme (`design/global.css:13`) and
  `--text-min-size: 15px` contradicts `--text-label-size: 12px`
  (`design/tokens/typography.css:22-26`). Responsiveness at ≤900 px is handled.
- **Fine as-is:** no data router (JSX routes) at this size; `NO_SENSORS` ×2;
  `queryClient.clear()` on sign-out; `my_role?`/`created_by_me?` optional only for
  fixtures (a `makeEntry` fixture with defaults would let both be required).

---

## 4. Bugs & Edge Cases (backend)

### A. Round-1 items confirmed fixed

H1 (kind create-only, `entries_controller.rb:237-245`), H2/H3/M0a (model validations
cited in §1), M1 (rate limit), M2 (`user.rb:24`), M3 (`Session`). The policy layer
again held up: every scope matches its model's `governing_entry_ids`, and no missing
`authorize` was found.

### B. New

- **B1 (Medium) — `schedule_items.day` can disagree with its version's day.**
  `ScheduleItemsController#update` (`schedule_items_controller.rb:28-32`) only nulls
  `day_version_id` when `day` changed *and* no version was named; when a PATCH names a
  `day_version_id` on another date and omits `day`, `resolve_day_version!` fills `day`
  only if blank (`:65`, `item.day ||=`), so the row keeps its old date while sitting in
  the new day's version. On create, an explicit `day` that disagrees with
  `day_version_id` is stored as given. Nothing on the model ties the two. Readers that
  trust `day` directly: `schedule_items#index` `where(day:)` (`:11`),
  `TripDay.swap_days!` (`trip_day.rb:80-83`), `TripDateShift#planned_days`/`drop!`
  (`trip_date_shift.rb:89-93,144`). The itinerary screen currently sends both keys
  consistently (`TripItinerary.tsx:331-334`), so this is latent, but it is a one-line
  invariant:

  ```ruby
  # schedule_item.rb
  validate :day_matches_version, if: -> { day_version.present? && (will_save_change_to_day? || will_save_change_to_day_version_id?) }
  def day_matches_version
    errors.add(:day, "must match the version's day") unless day == day_version.trip_day&.day
  end
  ```

  Or simpler: have the controller always overwrite `day` from the version when one is
  named (`item.day = item.day_version.trip_day.day`, not `||=`).

- **B2 (Medium) — the trip invariant** (§1, first finding): an idea can be the
  `trip_id` of schedule items, trip days and todos; `absorb` leaves a demoted trip's
  itinerary dangling. Same fix.

- **B3 (Medium) — `Entry.library` plucks every trip-descendant id in the database
  into Ruby.** `scope :library` (`entry.rb:71`) is
  `idea.where.not(id: with_trip_ancestor_ids)`, and `with_trip_ancestor_ids`
  (`:188-203`) returns `select_values` — a Ruby array of *every* entry under *any*
  trip of *any* user — which is then inlined as `NOT IN (1,2,3,…)`. The Library screen
  and `?unassigned=true` pay this on every load, and it scales with the whole table,
  not the caller's share of it. `VISIBLE_IDS_SQL`'s `in_any_trip` CTE (`:95-104`) has
  the same global shape but at least stays in SQL. Make `library` a subquery like
  `visible_to` already is:

  ```ruby
  TRIP_DESCENDANT_IDS_SQL = <<~SQL.freeze
    WITH RECURSIVE trip_descendants(entry_id, depth) AS (...) SELECT entry_id FROM trip_descendants
  SQL
  scope :library, -> { idea.where("entries.id NOT IN (#{TRIP_DESCENDANT_IDS_SQL})", depth_cap: VISIBILITY_DEPTH_CAP) }
  ```

  This is the first scalability wall together with the absent pagination; neither
  needs building today, both should be one-line-of-context in `doc/architecture.md`.

- **B4 (Medium) — `from_entry_id`/`to_entry_id` are the last unvalidated writable
  foreign keys.** Both are permitted on create and update (`entries_controller.rb:242`),
  the model declares them `optional: true` with no ownership check
  (`entry.rb:16-17`), and both are real FKs (`schema.rb:220-221`). Consequences: a
  nonexistent id raises `ActiveRecord::InvalidForeignKey`, which nothing rescues
  (`application_controller.rb:10-16`), so the caller gets a 500 — and a 500-vs-200
  difference over sequential ids is the existence oracle every other FK validation was
  carefully written to avoid. A real id from a stranger's trip is stored silently and
  echoed back. Nothing in the frontend writes or reads these beyond the type
  (`frontend/src/api/types.ts:65-66`). **Drop the two columns and the two
  associations** (`entry.rb:46-49`) — a migration, a serializer line, a type line — or,
  if transport legs are coming, validate them like `chosen_entry_id`.

- **B5 (Low) — `PATCH …/members/:entry_id` with empty strings stores a row of two
  nulls.** `clearing?` (`schedule_item_member_times_controller.rb:40-42`) uses `.nil?`;
  `{starts_at_minutes: "", ends_at_minutes: ""}` is not nil, so `update!` runs, casts
  both to `nil`, and persists a row the model header says should not exist
  (`schedule_item_member_time.rb:6-9`). Use `.blank?`, and add the invariant to the
  model (`validate :at_least_one_minute`) so no other path can create it either.

- **B6 (Low) — `GET /entries/:id/tree?depth=` is unbounded and un-defaulted at 0.**
  `(params[:depth] || 3).to_i` (`entries_controller.rb:154`) accepts `depth=1000000`
  (the DAG bounds the walk, so no hang, but it is the caller choosing the recursion cap)
  and `depth=abc` → 0 → empty. `.to_i.clamp(1, Entry::VISIBILITY_DEPTH_CAP)`.

- **B7 (Low) — `EntryLinksController#reorder` is 2N queries and tolerates partial
  lists.** `find_by` + `update!` per child (`entry_links_controller.rb:30-37`); ids not
  under the parent are silently skipped, and children absent from the list keep their
  old positions, so two links can end on the same position. Fine for the board's
  sizes; note it, and consider `upsert_all` with a single `WHERE parent_id = ?` if the
  bundle band grows.

- **B8 (Low) — no session pruning.** `Session.active` filters expired rows on read
  but nothing deletes them (`session.rb`); with a 30-day lifetime and a row per sign-in
  the table only grows. A `Session.where(expires_at: ..Time.current).delete_all` in a
  rake task or on `sign_in` is enough.

- **B9 (Low) — sign-up is open.** `POST /api/users` (`users_controller.rb:10-15`)
  mints an account for anyone with an email. That is a product decision, not a bug,
  but on a shared deploy with the seeded `password123` accounts (see D) it is the
  quickest route in. An `INVITE_CODE` env check is one line.

- **Round-1 Mediums still open:** M4 (`swap_days!` parking), M5 (vote/collaborator
  upsert races — `create_or_find_by` is the two-line fix in both places), L1 (day out
  of trip range on `day_versions#create` and now `trip_days#update`), L4 (feedback
  string lengths), L5 (`TodoPolicy` `to_sql`).

### C. Test coverage

Backend tests grew from ~3.6k to ~5.8k lines and now include the "hostile insider"
dimension round 1 asked for (see the config/test pass in §4 D for the exact files).
Gaps that match the findings above: nothing tests `absorb` of a trip that has an
itinerary, nothing posts a schedule item with an idea as `trip_id`, nothing tests a
`day`/`day_version_id` mismatch, nothing tests `from_entry_id` with a foreign id, and
nothing tests inverted trip dates on the server.

### D. Config, deploy readiness, tests, static analysis

**Tool output at `aea8da8`:**

| Check | Result |
|---|---|
| `bin/rails test` | 448 runs, 2615 assertions, 0 failures, 0 errors, 0 skips |
| `bundle exec brakeman` | 0 warnings (19 controllers, 15 models) |
| `bin/brakeman` (the wrapper CI calls) | exits 5 **without scanning** — see D1 |
| `bin/bundler-audit check --update` | 1 advisory: `sqlite3 2.9.5` GHSA-mwm8-39rw-8826, fix `>= 2.9.6` |
| `bin/rubocop` | 410 offenses, all the known `Layout/SpaceInsideArrayLiteralBrackets` baseline |

**Round-1 deploy items:** all **fixed** — CORS from `ENV["FRONTEND_ORIGIN"]`
(`config/initializers/cors.rb:10`), production `database.yml:29-31`, `config.hosts` from
`APP_HOST` (`production.rb:84`, `/up` excluded), `assume_ssl`/`force_ssl`
(`production.rb:22,25`), seeds guarded (`db/seeds.rb:5-8`).

- **D1 (Medium) — `bin/brakeman` never scans.** `bin/brakeman:5` unshifts
  `--ensure-latest`; with 8.0.5 installed and 8.0.6 released it prints the version line
  and exits 5 before analysing. `config/ci.rb:9` calls this wrapper, so "brakeman passes"
  is currently vacuous. `bundle update brakeman` and drop `--ensure-latest` (it fails CI
  on every upstream release).
- **D2 (Medium) — root CI runs no security gates.** `.github/workflows/ci.yml` runs
  `bin/rails test` + `bin/typecheck` only; brakeman, bundler-audit and rubocop are absent,
  which is why the sqlite3 advisory (D3) is live on `main`. Add `bin/brakeman --no-pager`
  and `bin/bundler-audit` to the backend job.
- **D3 (Medium) — `sqlite3 2.9.5` has a published use-after-free advisory.**
  `bundle update sqlite3`.
- **D4 (Medium) — the unauthenticated Active Storage direct-upload endpoint is live.**
  `POST /rails/active_storage/direct_uploads` is drawn (verified with `rails routes`) and
  Rails' `DirectUploadsController` has no auth. The app never uses direct uploads (no
  `DirectUpload` in `frontend/src` or `backend/app`), so an anonymous client can create
  blob rows and receive a presigned R2 PUT for arbitrary bytes and size, bypassing
  `Feedback`'s allow-list and 5 MB cap (`feedback.rb:170-186`, which only run on attach),
  and nothing purges unattached blobs. Fix, before the `api` namespace in
  `config/routes.rb` (app routes precede engine routes):

  ```ruby
  post "rails/active_storage/direct_uploads", to: proc { [404, {}, [""]] }
  ```

  Or `config.active_storage.draw_routes = false` and draw only the blob redirect route.
  Add a request test that asserts the 404, and consider a periodic
  `ActiveStorage::Blob.unattached.where(created_at: ..1.day.ago).find_each(&:purge)`.
- **Storage is otherwise right:** private R2 service (`config/storage.yml:29-38`, no
  `public: true`, creds from ENV); every served URL is signed and 15-minute
  (`feedback_serializer.rb:45`, `admin/screenshots_controller.rb:30`); the CSV export
  links through the auth-gated admin route rather than bucket URLs; content-type
  allow-list, 5-per-report, 5 MB cap; `variant_processor = :disabled`.
- **D5 (Low) — `backend/.github/workflows/ci.yml` is dead code** (GitHub reads only the
  repo-root `.github/`); it diverges from the real one and would fail on the rubocop
  baseline. Delete it.
- **D6 (Low) — production image ships every dev tool.** `Dockerfile:27`
  `BUNDLE_WITHOUT="development"`, but every tool is in `group :development, :test`
  (`Gemfile:40-63`) and Bundler excludes a gem only when *all* its groups are excluded.
  `BUNDLE_WITHOUT="development:test"`.
- **D7 (Low) — production's required env vars are written down nowhere.**
  `production.rb:84` `ENV.fetch("APP_HOST")` raises for every production process
  including `db:prepare` and `rails console`; `FRONTEND_ORIGIN`, `RAILS_MASTER_KEY`,
  `R2_*`, `ADMIN_API_TOKEN` likewise. `env/env.example` lists only `R2_*` and the admin
  token. Add a production section.
- **D8 (Low) — unused frameworks loaded.** `config/application.rb:10,14` require Action
  Mailer and Action Cable; no channels, skeleton mailers, `cable.yml:7-9` points
  production at a Redis whose gem is commented out. Drop both requires and `cable.yml`.
- **D9 (Low) — rate-limit store is per-process and non-persistent**
  (`application_controller.rb:8`); resets on deploy and is per-worker. Fine on a
  single-process Pi; back it with `Rails.cache` for a real deploy.
- **D10 (Low) — staging serves dev-mode error pages.** `scripts/staging/provision:134`
  `RAILS_ENV=development` → full backtraces to anyone on the tailnet. Documented as
  "not a production deploy"; flagged only.
- **D11 (Low) — `backend/README.md:24-27` is stale** (still says CORS is hardcoded and
  the cookie is `user_id`).
- **Schema housekeeping (Low):** five redundant single-column indexes fully covered by a
  composite on the same table — `day_versions.trip_day_id` (`schema.rb:51`),
  `entry_links.parent_id` (`:102`), `schedule_items.trip_id` (`:147`),
  `trip_days.trip_id` (`:182`), `votes.entry_id` (`:213`). Pure write overhead; the new
  `schedule_item_member_times` migration got this right (`index: false`). Index coverage
  for the app's actual `where`/`order` columns is otherwise complete.

**Test coverage:** 448 tests, and the "hostile insider" dimension round 1 asked for is
present (`authorization_test.rb:79-162` probes `entry_id`, `chosen_entry_id`,
`day_version_id` on create and update, and `lodging_entry_id`). Kind create-only,
`day_version_belongs_to_trip`, member-times cross-trip and non-member, rate limiting,
password length, permanent-deletion role split, admin 403 and bearer scoping, and all
three screenshot limits are tested. Every controller and model is exercised somewhere;
the naming gaps (`users`, `day_versions`, `trip_days`, `admin/screenshots` have no file
of their own, policies other than `EntryPolicy` and serializers other than
`EntrySerializer` are request-level only) are cosmetic. The four tests worth adding
match the findings: `PATCH /api/todos/:id {position: null}` then `GET /api/todos`;
`from_entry_id`/`to_entry_id` insider probes; `POST /rails/active_storage/direct_uploads`
→ 404; feedback `url`/`element_selector` length caps. Note: a local
`db:prepare RAILS_ENV=test` seeds the test DB; prefer `db:test:prepare` so row-count
assertions cannot drift on seed data.

---

## 5. Frontend Findings

### Status of round-1 frontend items

| Item | Status | Evidence |
|---|---|---|
| F2 transient `/api/me` failure signs out | **Open** | `auth/ProtectedRoute.tsx:18-20`; `api/session.ts:19-20` still `retry: false`, `me.isError` never read. |
| F4 silent mutation failures | **Open, more instances** | `TripsList.tsx:88,125`, `EntryDetail.tsx:305-307`; new: `TripMap.tsx:340,418-419` (Undo), `schedule/RowOptions.tsx:37-39`, `ProsCons.tsx:68`. |
| F5 unhandled boot promise | Open | `main.tsx:22`. |
| F6 error toasts auto-dismiss 4 s | **Open** | `Toast.tsx:72,106` — `durationMs` was added but errors aren't sticky; the stack (`:102`) is unbounded. |
| F8 itinerary write-back race | **Open** | `api/itinerary.ts:30-43` no `cancelQueries`; `useSwapDays` `:101-105` still set-then-invalidate. Repro: drop, then Fork before the refetch lands — the refetch overwrites the forked day, and `useApplyTripDay` only invalidates `schedule.all`, so it sticks for 10 s. |
| F9 schedule writes don't invalidate `entries` | **Open, worse** | `api/schedule.ts:22-28`; `TripChecklist.tsx:41-44` and `scheduleModel.ts:88-90` read stale `Entry.scheduled`; `createAndPlace` (`TripItinerary.tsx:397-412`) caches the new idea as `scheduled:false` because `useCreateEntry` invalidates before the placement lands. |
| F10 deep-linked `/entries/:id` can't close | Open | `EntryDetail.tsx:516` `navigate(-1)`. |
| F11 SignIn niggles | **Open, worse** | `SignIn.tsx:25,37`; the board now keeps drill state in `?path=` (`TripBoard.tsx:234-241`), so an expiry round-trip drops it. |
| F12 dead outlet payload / stale comment | Open | `TripLayout.tsx:140-148,60-63`; `AppLayout.tsx:187`. |
| F13 BundleCard concurrent reorder | **Fixed** | `BundleCard.tsx:334-349` one `reorderLinks`; asserted at `BundleCard.test.tsx:515-522`. |
| F14 ProsCons stale-props PATCH | **Open** | `ProsCons.tsx:64,84,90` still build from props; `removeNote` (`:87-92`) has the same race; no `onError` at all (`:68`). |
| F15a BundleCard double-commit rename | **Open** | `BundleCard.tsx:278-297` no `settled` guard; Enter (`:537`) then unmount-blur (`:527`). |
| F15b TripCard `skipTitleSave` reset | Fixed | `TripCard.tsx:121` (`cancelled`, reset in `startEditing`). |
| F15c TripCard refused rename sticks | Open | `TripCard.tsx:152,193-195`. |
| F16 aborted search clears results | **Fixed** | `usePlaceSearch.ts:167`; tested. |
| F17 TakeSomewhereModal partial failure | Open | `TakeSomewhereModal.tsx:52-59`. |
| F18 sub-items | Mostly open | BulkBar toast count (`:143`), false `stopPropagation` comment (`:105-110`), EntryTree chevron (`:42-44`), QuickAdd `source_url` (`:24`, still nothing renders it), `useGeolocation` (`schedule/useGeolocation.ts:37-39`). `NewIdeaModal` no longer exists (N/A). |
| F19 popover copies | **Open, 9 copies** | §2. |
| F20 bulk invalidation storms | Partial | Link adds settle once (`linkCache.ts:35-38`); `BulkBar.tsx:157,169` (lift/archive) and `AdminFeedback.tsx:177` (N deletes → N `admin.all` invalidations) still storm. |
| F21 toast string / sort comparator / "Day N" regex | Open | §2. |
| F22 Modal / Field | **Fixed** | `Modal.tsx:49-51,65-72`; `Field.tsx:41-49`. The caller-side `useCallback` workarounds it was meant to delete are still there (`TripBoard.tsx:193-197`, `AppLayout.tsx:192-193`, …). |
| F23 `useBundleMembers` combine | **Fixed** | `useBundleMembers.ts:40-57`. |
| F24 IdeaRow memo / Set | Open | `IdeaList.tsx:153`; blocked by the inline lambdas in `TripBoard.tsx:749,756-769`. |
| F26 cluster key churn | Open (accepted) | `MapView.tsx:442-445`. |
| Mocks: no role checks; `Object.assign` drift | **Partial / Open** | FH5 below. |
| Test gap: `useBundleMembers`/`useLinkMutations` | **Fixed** | `useBundleMembers.test.tsx`, `useLinkMutations.test.tsx`, `api/links.test.tsx`. |

### High

- **FH1 — Enter on "Leave it" / "Leave it loose" / ✕ saves instead of cancelling.**
  `TimeEditor.tsx:136-147` and `TimePrompt.tsx:145-156` put an Enter handler on the
  wrapper `div` that calls `preventDefault()` (which suppresses the button's own click
  activation) and then `save()`. The Cancel buttons (`TimeEditor.tsx:189-191`, `:152`
  CloseButton; `TimePrompt.tsx:211-213`) and the suggestion chips are inside that
  wrapper. A keyboard user who Tabs to "Leave it" and presses Enter gets the opposite
  action. Neither test presses Enter *on* the button (`TimeEditor.test.tsx:297`,
  `TimePrompt.test.tsx:144`). Only treat Enter as save when the target is an input:

  ```ts
  if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
    event.preventDefault(); save();
  }
  ```

- **FH2 — F1 regression on the itinerary: "nothing kept" renders while the entries
  queries are loading or failed.** `TripItinerary.tsx:526-530` gates only
  `itineraryQuery`; `kept` (`:187-190`) falls back to `[]`, so `UnplacedRail.tsx:78-79`
  says "Nothing kept for this trip yet…", the rail title says "0 to place", `AddPicker`
  says "Nothing kept", and `DatesGate` (`:494`) says "Nothing is kept for {trip} yet" —
  all affirmative claims on a pending or failed fetch. `QueryGate` already takes an
  array: gate `[itineraryQuery, ideasQuery, bundlesQuery]`. Same shape, smaller:
  `TripChecklist.tsx:50` gates only `todosQuery` while ordering depends on
  `entriesQuery` (`:30,41-43`); `EntryDetail.tsx:251,259-267` branches on `isLoading`
  and shows "That one isn't here" for a 500.

- **FH3 — `TripCard`'s prop-sync effect wipes an in-progress description edit.**
  `TripCard.tsx:83-86` resets *both* drafts whenever `trip.title` *or* `trip.description`
  changes. Its own comment says "without clobbering an in-progress edit", and it does
  exactly that: edit mode opens both fields, the title saves on blur (`:181`) → PATCH →
  list refetch → `trip.title` changes → `setDescriptionDraft(trip.description)` runs while
  the user is typing in the textarea. Drop the effect; seed drafts in `startEditing` and
  render `trip.*` when not editing. The drafts are displayed even when not editing
  (`:66-67,193,286`) to hide a refetch flicker, which is what makes F15c sticky and this
  possible — an optimistic `setQueryData` in `useUpdateEntry` is the right fix for both.

- **FH4 — No double-submit guards on create paths.** `IdeaComposer.tsx:307-320` `submit()`
  has no in-flight guard, the Submit button (`:524`) is never disabled, and `IdeaComposer`
  exposes no `busy` prop; `TripBoard.handleComposerSubmit` (`:475-529`) closes the
  composer only after `await createEntry.mutateAsync`, so Enter twice = two ideas plus two
  rounds of links. Same in `IdeaRow.save` (`:337-362`), `DayCard` Fork (`:194-197`,
  `TripItinerary.tsx:568-576` — a double-click forks Version B *and* C), `ArchivedPanel`
  restore (`:642-654`), and `BundleCard.removeBundle` (`:310-324`, the X stays enabled, a
  second click fires N more DELETEs that 404 and toast "didn't save"). `DatesGate` already
  does this right with `saving`; pass `isPending` down as `disabled`/`aria-busy` and
  early-return.

- **FH5 (mocks) — entry/link/todo/schedule/itinerary write handlers enforce neither
  auth nor role**, even though the role model now exists in `db.ts` (`roleFor`,
  `governingTripId`) and the collaborators/votes/feedback handlers use it.
  `mocks/handlers.ts:562` (POST entries, `created_by_id: db.currentUserId ?? 1`), `:614`,
  `:646` (its comment admits "archives for whoever asks"), `:664` (permanent delete —
  `mayDestroyPermanently` returns `true` when signed out, `:330`), `:702,713,727`
  (lift/absorb/fork), `:750-788` (links), `:847-875` (todos), `:892-946` (schedule),
  `:1023-1105` (itinerary). A viewer-path regression on any of these screens passes every
  MSW test while Rails 403s. One `requireEditor(entryId)` helper returning 403 for a
  viewer, applied to each write, closes it; `mocks/collaborators.test.ts:129,171,245`
  shows the test pattern. Alongside: `Object.assign(entry, patch)` still accepts anything
  (`:637,869,933`) — pick from an allow-list built from `EntryWritePayload` keys.

### Medium

- **FM1 — Member hours are display-only; every day-level computation ignores them.**
  `dayHours` (`itineraryModel.ts:349-355`), `versionSpan` (`:364-377`), `withGaps`
  (`:213-230`), `suggestSlots` (`:423-497`), `nextFreeSlot` (`:504-518`) read only the
  band's `starts/ends_at_minutes`. A member stored 11:00–15:00 inside an 11:00–13:00 band
  still yields "fits this hole" at 13:00, a gap row drawn over the member's own hours, and
  the next placement landing on top of it. Relatedly, nothing (client
  `BundleBand.tsx:104-114`, server `schedule_item_member_time.rb:23-29`) warns that a
  member is timed outside its band, and opening a member editor and pressing Set
  unchanged stores the derived split and flips every sibling to "No time yet"
  (`BundleBand.tsx:107-108`; `TimeEditor.tsx:127-133` has no unchanged check). Decide
  whether stored member extremes clamp or extend the band in the model, and diff against
  `slot.stored` before writing.
- **FM2 — Rule-1 gate is `member_times.length > 0`, not "any current member has a row"**
  (`itineraryModel.ts:299`). A row for an entry no longer in `members` (stale cache after a
  board unlink — link mutations invalidate only `['entries']`, `api/links.ts:21-24`, never
  `itinerary`) silences the proportional split for every real member. The server prunes on
  unlink, so it is a cache-window bug; make the model robust anyway.
- **FM3 — Changing trip dates flashes the old day list.** `api/entries.ts:157-163`
  `useChangeTripDates.onSuccess` fires `void invalidateQueries` and discards
  `result.entry`; `TripItinerary.tsx:444-462` closes the gate on success but `:183`
  `buildDayList(trip, tripDays)` reads `trip` from the outlet, updated only when the
  detail refetch lands. Write the returned entry into `entries.detail(id)` and return the
  `Promise.all` so `isPending` covers the refetch.
- **FM4 — Per-call `mutate` callbacks are dropped on rapid repeats in the itinerary.**
  `TripItinerary.tsx:330-352` `placeEntry` passes `onSuccess` (open day, set
  `promptItemId`, toast) as per-call options; a second drop before the first settles loses
  the first's callbacks (v5 keeps only the latest observer's). Same at `:596-605`
  (`promptItemId` never cleared) and every fork/keep/restore. `TripBoard.tsx:556-559`
  documents this exact hazard and uses `mutateAsync().then(...)`; the itinerary should too.
  Related: the prompt anchor (`:344`) depends on a refetch that isn't awaited — if it fails,
  the toast says "X is on Day N" with no row and no prompt.
- **FM5 — Optimistic member can be clobbered by any non-link refetch.**
  `linkCache.ts:129-135` cancels only the parent detail query at `onMutate`; a later active
  invalidation of `['entries']` while a link is in flight (`votes.ts:98,115`,
  `entries.ts:66,170`) refetches the bundle detail and paints it without the pending child
  until the link's own settle. Repro: drop an idea into a plan, immediately vote on it.
  Gate `['entries']` refetches on `isMutating({ mutationKey: LINK_MUTATION_KEY }) === 0`,
  or re-apply the optimistic edit in `onSuccess`. Also: `linkCache.ts:192` returns before
  `updateLists` when the parent detail isn't cached, so a visible bundle row's
  `children_count` isn't touched; move the list update above the guard.
- **FM6 — Stale `members` closure in BundleCard commit paths.** `commitReorder`
  (`:373-390`) and `moveMember` read `members` from the render closure while `dragRef` is
  deliberately synchronous; a refetch reordering `members` between the last `dragover` and
  `drop` posts an order computed against the new list with a gap index chosen against the
  old one. Keep a `membersRef` beside `dragRef`, or store `insertAfterId` rather than an
  index.
- **FM7 — 401 / re-sign-in leaves the previous user's cache intact.**
  `api/session.ts:29,38` `useSignIn`/`useSignUp.onSuccess` only `setQueryData(session,
  user)`; with `staleTime: 10_000` a different account signing in within 10 s of an expiry
  renders the prior user's trips from cache. Add the `queryClient.clear()` that
  `useSignOut` already has.
- **FM8 — Keyboard drag on the board is nominal, not usable.** `TripBoard.tsx:374-377`
  `KeyboardSensor` with the default 25 px `coordinateGetter`; the plans rail is a column
  away, so "arrow keys to carry it over a plan" (`dragAnnouncements.ts:57-58`) means
  dozens of presses through empty space. The itinerary already solved this
  (`useDayDrop.ts:190-217` custom getter jumping between droppables) — port it. The
  `TripBoard.test.tsx:1280-1314` keyboard test only lifts and drops in place.
- **FM9 — Partial-failure UX (F17 class), three places.** `IdeaRow.tsx:349-356` (PATCH
  succeeds, one link fails → form stays, retry re-PATCHes and diffs against
  already-mutated `parent_ids`); `BulkBar.tsx:154-176` lift/set-aside (some succeed, one
  rejects → `selectedIds` still holds ids no longer rendered, the bar says "N selected");
  `TakeSomewhereModal.tsx:52-59` (F17). `Promise.allSettled`, clear the succeeded ids,
  report the count.
- **FM10 — DeadlineField double-commit (F15 class).** `DeadlineField.tsx:131-137` Enter →
  `commit()` → `setOpen(false)` unmounts the input; the file's own comment (`:86-89`) says
  some browsers then fire blur, and `onBlur={commit}` (`:162`) runs again; the
  `next === value` guard (`:121`) compares against the not-yet-updated prop → two
  PATCHes. Same `committed` ref as `cancelled`.
- **FM11 — Feedback draft lost on Escape / backdrop click.** `Modal.tsx:76-78,113-114` →
  `FeedbackComposer.handleClose:119-124` → `reset()`, which also revokes every attachment.
  The component's own doc (`:57-60`) calls losing a half-written message "the worst
  possible bug in this feature"; "Not now" is disabled while sending (`:323`) but Escape
  isn't. Keep the draft in state and `reset()` only on success.
- **FM12 — Collapsed split day summarises Version A only.** `DayRow.tsx:56-58` reads
  `versions[0]`; `data-empty` (`:67`) marks the row empty when A is empty even if B has six
  things, while the tag says "2 versions".
- **FM13 — `24:00` is documented as legal but unrepresentable.** `TimeEditor.tsx:87-89`
  says an item "that runs to midnight" is a legal plan; `parseTime` (`:45-54`) refuses
  `24`/`24:00`, and `00:00` as an end fails "The end comes before the start" (`:104`). Fix
  the doc or map `24:00` → 1439 explicitly.
- **FM14 — `pendingIcon()` is called in render** (`MapView.tsx:462,465`), so the
  pending/you-are-here markers rebuild their DOM on every `moveend` (react-leaflet
  `setIcon`s when `props.icon !== prevProps.icon`). Hoist to a module constant — it takes
  no arguments.

### Low

- `retry: 1` on 4xx (`queryClient.ts:31-32`, §3); `/trips/abc` → three `GET /entries/NaN`
  requests before "isn't here" (`TripLayout.tsx:46`, `AppLayout.tsx:174,187`) — guard
  with `Number.isInteger`; non-JSON 2xx becomes `undefined as T` (`api/client.ts:76,88`)
  and surfaces as a `TypeError` that `instanceof ApiError` branches miss.
- `settleLinkMutation` counts every link mutation app-wide, not per parent
  (`linkCache.ts:36`), and refetches every active `['entries']` query per drop (`:37`) —
  N+2 requests per drag; scope by `parentId` if it ever hurts.
- Re-render hotspots (fine at current scale, all unblocked by the §1 extractions):
  `TripBoard.tsx:320-323` `subtreeCount` per visible row × `tree.ts:57-68` full-list
  `filter` per node — build a `childrenById` map once; `IdeaComposer.tsx:278,288-292`
  rebuilds maps per render; `TripItinerary.tsx:555-623` ~12 new closures per day per
  render with `DayCard`/`DayRow` unmemoised; `useDayDrop.ts:64-70` passes a fresh
  `useDndMonitor` object so every render re-subscribes days×versions listeners;
  `MapView.tsx:335-340,358-364` `eventHandlers` literals re-subscribe Leaflet events per
  marker per render; `renderPopup(pin.id)` for every pin per render (`:342-344`);
  `TripSchedule.tsx:145` `now = new Date()` per render defeats memoisation and never
  ticks.
- `useLinkMutations.ts:34-55` recreates `lifecycle` and both option objects per render
  (harmless in v5; `links.ts:30` shows the module-level shape).
- `VersionItems.tsx:96` vs `:120` switch the prompted row between a `div` and a
  `Fragment` with the same key, remounting `ItemLine`/`BundleBand` and dropping any open
  inline editor when the prompt opens or closes.
- `position: items.length` from the client's view (`TripItinerary.tsx:337`): two quick
  adds send the same position.
- `geocode.ts:25-30` `throttle1Hz` claims a 1 s slot even when the signal is already
  aborted; `usePlaceSearch.searching` doc (`:48-49`) says "or a debounce is waiting" but
  `setSearching(true)` fires only inside the timer (`:151`), so `MapSearch.panelOpen`
  (`:116-117`) stays closed for the 400 ms debounce; `search()` clears `results`
  synchronously per keystroke (`:134`), so the open list blinks for ≥400 ms per character.
- `MapIdeaList.tsx:392-398` success toasts go through an optional `onToast` (dropped if
  omitted) while errors always `show`; `Tag key={name}` (`:410`) collides when two plans
  share a title.
- `markerIcon.ts` escaping is complete for `title` and `category` is only ever an index —
  but an unknown category from the API renders the literal `undefined` in the aria-label
  (`:132`) and SVG (`categoryGlyph.ts:93`); add a `category in CATEGORY_GLYPH` guard.
- `AdminFeedback.tsx:236` CSV export via `window.location.assign` — a 401/403/500 JSON
  answer navigates the SPA to a raw JSON page. `FeedbackComposer.tsx:301` surfaces
  `ApiError.message` raw ("Request failed (500)").
- `Field.tsx:41-49` `cloneElement` overwrites the child's own `id`/`aria-describedby` and
  never forwards `error`, so a custom child never gets `aria-invalid`.
- `MapView.tsx:307-328` `open()` toggles `wend-pin--flip` but `close()` never clears it
  (cosmetic; the listener wiring itself is correct).
- `openIdeaFromPlan` scroll relies on one rAF + `querySelector` after `setSearchParams`
  (`TripBoard.tsx:298-306`), racing the URL-driven re-render; prefer an effect on
  `focusedId` inside the row. `BundleCard.tsx:521-540,739-755` `<Input autoFocus>` scrolls
  the rail when the card is off-screen (the composer avoids `autoFocus` for this reason,
  `IdeaComposer.tsx:185-189`).

### XSS / href — clean

No `dangerouslySetInnerHTML` anywhere in `src/` (grep-verified). The only user-derived
`href`s are `Linkify.tsx:37` (through `lib/linkify.ts:26,41,79-81`: `http(s)` allow-list
enforced twice, `www.` upgraded to https, `javascript:`/`data:` cannot match, trailing
punctuation and balanced parens handled, output is React children,
`rel="noopener noreferrer"` + `target="_blank"`, tested) and the server-signed
screenshot URL in `AdminFeedback.tsx:416-422`. `feedback.url`, `element_selector`,
`element_classes`, `user_agent` and `message` are all rendered as text nodes.
`markerIcon.ts` escapes titles in every HTML builder (`:135,141,200,231,281,304,334`).
`MapView.tsx:426` attribution is a static string.

### Mocks (contract fidelity)

- FH5 above is the one that matters.
- Serializer drift, minor: mock `isScheduled` ignores the `trip_id` scoping the serializer
  applies (`db.ts:247-249` vs `entry_serializer.rb:172-176`); mock `GET /entries/:id`
  returns parents/children without the `visible_to` filter (`handlers.ts:604-608` vs
  `entry_serializer.rb:77-85`). Feedback/admin shapes match exactly, including
  `user_agent` redaction.

### Frontend test coverage

Well covered now: `useBundleMembers`, `useLinkMutations`, `links`/`linkCache` helpers,
`reorderPreview`, `tree`, `filters`, `linkify`, `AddressSearch`, `IdeaComposer`,
`BundleCard` reorder paths, `FeedbackComposer` object URLs, `Modal`, `QueryGate`.

Gaps that match the findings above, in priority order:

- No test presses Enter *on* a Cancel button in `TimeEditor`/`TimePrompt` (FH1).
- No test that a failed or pending `ideas` query does not render "Nothing kept…" (FH2).
- No double-submit / call-count assertions anywhere: BundleCard rename Enter+blur
  (`BundleCard.test.tsx:93` asserts a rename happens, not that PATCH is called once),
  `IdeaComposer`/`IdeaRow.save`/`handleComposerSubmit`, DayCard Fork/Keep/Restore,
  `DeadlineField` Enter-then-blur (FH4, FM10).
- `ProsCons` has no test file (F14); `TripCard` has no refused-rename or
  refetch-mid-edit case (F15c, FH3).
- `api/schedule.ts` has no test at all (`useUpdateMemberTime`, `useCreateScheduleItem`,
  the invalidation list — the F9 fix would have nothing to fail against);
  `api/itinerary.test.tsx` has 3 cases and no in-flight-refetch race (F8).
- `bundleMemberSpans`: no case for a `member_times` row whose entry is not in `members`,
  none for stored hours outside the band, none for an end-only row (FM1, FM2).
- No component tests for `BundleBand`, `ItemLine`, `RowOptions` (round 1), `MapFilterBar`,
  `PlacePreviewCard`/`PlansDropdown` keyboard dismissal; `useGeolocation` still untested
  (round 1); the library trio (`QuickAdd`, `LibraryRow`, `LibraryFilterBar`), `EntryTree`,
  `NewBundleModal` untested.
- Mocks cannot test what they don't enforce: no "viewer is refused on entry/link/todo/
  schedule writes" case exists because the handlers accept everything (FH5).
- `Toast.test.tsx:119` pins the 4 s default rather than error persistence (F6); `Modal`
  has no focus-restore or scroll-lock test (because neither exists).

---

## Priority shortlist

If only eight things get done this round, do these, in this order:

1. **D4 + D1–D3 — close the unauthenticated direct-upload route and make the security
   gates real.** One route line, `bundle update brakeman sqlite3`, drop
   `--ensure-latest`, add brakeman + bundler-audit to the root CI job. Half a day, and
   the only items in this review that are reachable by an anonymous client.
2. **FH1 — Enter on "Leave it" saves.** A two-line guard in two files, plus the test that
   presses Enter on the button. The only finding that does the opposite of what the user
   asked.
3. **FH2 — gate the itinerary's entries queries.** One `QueryGate` array; also
   `TripChecklist` and `EntryDetail`. This is F1 coming back.
4. **§2 `useInlineEdit` + FH3.** One hook closes F15a, F15c, FH3 and FM10 and deletes
   the six hand-rolled copies. Do TripCard first — it loses typed text today.
5. **FH4 — double-submit guards.** Pass `isPending` down as `disabled`/`busy` on the
   composer, row edit, Fork, Restore and Remove-plan. Add one call-count assertion per
   path.
6. **B1 + B2 (backend) — the `kind: "trip"` invariant and `day` = version's day.** A
   `BelongsToTrip` concern on three models, `where(kind: "trip")` in five `set_trip`s, a
   `day_matches_version` validation, and a decision on what `absorb` does with the folded
   trip's itinerary. Add the four insider probes listed in §4 C.
7. **B4 + S1 (backend) — drop `from_entry_id`/`to_entry_id` (or validate them) and make
   both `position` columns `null: false`.** Two migrations; removes the last unvalidated
   writable FK and the one `PATCH` that 500s every checklist read.
8. **FH5 — mock role enforcement.** One `requireEditor` helper applied to every write
   handler, plus the allow-list on `Object.assign`. Until this lands, the MSW suite cannot
   catch a viewer-path regression on any screen.

Then, as touched: `usePopover` (§2, nine copies), the container extractions (§1
Frontend), `invalidatePlacements` with F9 folded in, `create_or_find_by` for M5,
`User.authenticate_by` for L0a, one depth-cap constant for M0b, and a decision on
Sorbet.
