# Q1 — How multi-user is the MVP?

**Status:** answered by assumption, not blocking. Change the answer any time and I'll adjust.

The brief says desire ratings "should support multi users voting", which implies more
than one person touches a trip. But real collaboration (invites, sharing, permissions,
live sync) is a large chunk of work that competes with the planning features.

**What I assumed:** email + password accounts with a signed session cookie, and a
`votes` table already keyed by `user_id` so multi-user voting works at the data layer.
But **no sharing UI in the MVP** — no invites, no permissions model, no realtime.
Every signed-in user can see and edit every trip (a single household / travel party).

The seed data ships two users so vote tallies show more than one voice, and adding
invites later is additive rather than a rewrite.

**Options if you'd rather go a different way:**

- **(a) As assumed** — accounts + shared-by-default trips, no invite flow. *(current)*
- **(b) Single user, no auth at all** — fastest; drops the login screen and fakes a
  `current_user`. Voting becomes single-player, which costs the feature most of its point.
- **(c) Full collaboration** — trip membership, invite by email, per-trip roles.
  Roughly a phase of work on its own; I'd cut the map or the hourly schedule to pay for it.

**Answer here:**

- (a)

