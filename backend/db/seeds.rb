# Demo data per doc/assumptions.md A10. Idempotent: `bin/rails db:seed` twice
# produces the petere records (everything is found-or-created by a natural key,
# never blindly appended).

puts "Seeding..."

# --- Users -------------------------------------------------------------

sarah = User.find_or_create_by!(email: "sarah@example.com") do |u|
  u.name = "Sarah"
  u.password = "password123"
end

peter = User.find_or_create_by!(email: "peter@example.com") do |u|
  u.name = "Peter"
  u.password = "password123"
end

# --- Helpers -------------------------------------------------------------

def entry!(kind:, title:, created_by:, **attrs)
  Entry.find_or_create_by!(kind: kind, title: title, created_by: created_by) do |e|
    attrs.each { |k, v| e.public_send("#{k}=", v) }
  end
end

def link!(parent:, child:, position: 0)
  EntryLink.find_or_create_by!(parent: parent, child: child) do |l|
    l.position = position
  end
end

def vote!(entry:, user:, score:)
  vote = Vote.find_or_initialize_by(entry: entry, user: user)
  vote.score = score
  vote.save!
  vote
end

def todo!(title:, entry: nil, trip: nil, **attrs)
  Todo.find_or_create_by!(title: title, entry: entry, trip: trip) do |t|
    attrs.each { |k, v| t.public_send("#{k}=", v) }
  end
end

def member!(trip:, user:, role:)
  membership = TripMembership.find_or_initialize_by(trip: trip, user: user)
  membership.role = role
  membership.save!
  membership
end

# --- Japan trip ------------------------------------------------------------

japan = entry!(
  kind: "trip", title: "Japan", created_by: sarah,
  description: "Two weeks, Tokyo to Kyoto.", starts_on: "2026-11-02", ends_on: "2026-11-16"
)

# The ideas first, then the bundles that group them. A bundle here is a group
# of ideas that go WELL TOGETHER -- one corner of one city at one time of day,
# in the order you would actually do them -- not a pile of interchangeable
# options. Grouping by area and time is what makes a bundle placeable on the
# schedule in one move, and it is what the mockups
# (temp-design-files/ui-mockups-for-wend) seed too.

daiso_harajuku = entry!(
  kind: "idea", title: "Daiso Harajuku", category: "place", created_by: sarah,
  location_name: "Daiso Harajuku", address: "1-19-24 Jingumae, Shibuya City, Tokyo",
  lat: 35.6702, lng: 139.7016, duration_minutes: 45
)
daiso_shibuya = entry!(
  kind: "idea", title: "Daiso Shibuya", category: "place", created_by: sarah,
  location_name: "Daiso Shibuya", address: "20-14 Udagawacho, Shibuya City, Tokyo",
  lat: 35.6595, lng: 139.7005, duration_minutes: 45
)
daiso_kyoto = entry!(
  kind: "idea", title: "Daiso Kyoto Kawaramachi", category: "place", created_by: peter,
  location_name: "Daiso Kyoto Kawaramachi", address: "556 Nakanocho, Nakagyo Ward, Kyoto",
  lat: 35.0038, lng: 135.7681, duration_minutes: 45
)
yoyogi = entry!(
  kind: "idea", title: "Yoyogi Park, late afternoon", category: "activity", created_by: sarah,
  location_name: "Yoyogi Park", lat: 35.6720, lng: 139.6949, duration_minutes: 60,
  notes: "Ten minutes from the Harajuku shops -- somewhere to sit once the bags are heavy."
)

nanzenji = entry!(
  kind: "idea", title: "Nanzen-ji", category: "place", created_by: peter,
  location_name: "Nanzen-ji", address: "Nanzenji Fukuchicho, Sakyo Ward, Kyoto",
  lat: 35.0116, lng: 135.7931, duration_minutes: 60,
  notes: "Free to enter the grounds; the Sanmon gate and Hojo garden charge separately."
)
gion_walk = entry!(
  kind: "idea", title: "Gion, walking slowly", category: "activity", created_by: peter,
  location_name: "Gion", lat: 35.0036, lng: 135.7752, duration_minutes: 60,
  notes: "No plan needed. Down Hanamikoji from Yasaka, stopping when something looks good."
)
ramen_dinner = entry!(
  kind: "idea", title: "Ramen at Gion Ramen Koji", category: "food", created_by: peter,
  location_name: "Gion Ramen Koji", lat: 35.0037, lng: 135.7752, duration_minutes: 60,
  source_url: "https://instagram.com/p/example-ramen"
)
kaiseki_dinner = entry!(
  kind: "idea", title: "Kaiseki at Giro Giro Hitoshina", category: "food", created_by: sarah,
  location_name: "Giro Giro Hitoshina", lat: 35.0068, lng: 135.7714, duration_minutes: 120,
  notes: "Needs a reservation -- see todo."
)

# Lodging, activity, transport, and "other" categories, to round out all six.
hotel = entry!(
  kind: "idea", title: "Hotel Granvia Kyoto", category: "lodging", created_by: sarah,
  location_name: "Hotel Granvia Kyoto", lat: 34.9858, lng: 135.7588,
  notes: "Attached to Kyoto Station, easy for early Shinkansen mornings."
)
teamlab = entry!(
  kind: "idea", title: "teamLab Planets", category: "activity", created_by: peter,
  location_name: "teamLab Planets TOKYO", lat: 35.6467, lng: 139.7930, duration_minutes: 90,
  source_url: "https://instagram.com/p/example-teamlab"
)
link!(parent: japan, child: teamlab)

pocket_wifi = entry!(
  kind: "idea", title: "Pocket wifi rental", category: "other", created_by: sarah,
  notes: "Pick up at Narita arrivals, return at departure."
)
link!(parent: japan, child: pocket_wifi)

shinkansen = entry!(
  kind: "idea", title: "Shinkansen: Tokyo to Kyoto", category: "transport", created_by: sarah,
  from_entry_id: daiso_harajuku.id, to_entry_id: nanzenji.id, duration_minutes: 140
)

# --- Japan bundles: ideas that go well together -----------------------------

# Shibuya and Harajuku are one walk apart, so the two Daiso branches and the
# park are an afternoon, not three separate errands. Daiso Harajuku carries an
# open to-do, so this bundle shows the plum "1 to-do" on a member row.
shibuya_afternoon = entry!(
  kind: "bundle", title: "Shibuya afternoon", created_by: sarah,
  description: "Harajuku down to Shibuya on foot, then the park. Half a day, no bookings."
)
link!(parent: japan, child: shibuya_afternoon)
link!(parent: shibuya_afternoon, child: daiso_harajuku, position: 0)
link!(parent: shibuya_afternoon, child: daiso_shibuya, position: 1)
link!(parent: shibuya_afternoon, child: yoyogi, position: 2)

# East Kyoto from morning to dinner: the temple, then Gion at dusk, then
# somewhere to eat ten minutes away. The dinner is itself a small bundle of
# alternatives, which is why a bundle can hold a bundle.
higashiyama_day = entry!(
  kind: "bundle", title: "Higashiyama day", created_by: peter,
  description: "One side of Kyoto, in order: Nanzen-ji in the morning, Gion at dusk, dinner nearby."
)
link!(parent: japan, child: higashiyama_day)

dinner_options = entry!(
  kind: "bundle", title: "Kyoto dinner options", created_by: peter,
  description: "Two places within a few minutes of Gion. Pick on the night."
)
link!(parent: dinner_options, child: ramen_dinner, position: 0)
link!(parent: dinner_options, child: kaiseki_dinner, position: 1)

link!(parent: higashiyama_day, child: nanzenji, position: 0)
link!(parent: higashiyama_day, child: gion_walk, position: 1)
link!(parent: higashiyama_day, child: dinner_options, position: 2)

# The move between cities, with the things that only make sense on that day:
# the station Daiso on the way to the platform, and the hotel it is attached
# to. Everything here is already settled -- this is the bundle that reads
# "0 open to-dos".
travel_day = entry!(
  kind: "bundle", title: "Travel day: Tokyo to Kyoto", created_by: sarah,
  description: "Midday train, the station Daiso on the way through, and the hotel it is attached to."
)
link!(parent: japan, child: travel_day)
link!(parent: travel_day, child: shinkansen, position: 0)
link!(parent: travel_day, child: daiso_kyoto, position: 1)
link!(parent: travel_day, child: hotel, position: 2)

# Votes from both users -- a mix of enthusiasm, indifference, and a pass.
vote!(entry: teamlab, user: sarah, score: 2)
vote!(entry: teamlab, user: peter, score: 2)
vote!(entry: nanzenji, user: sarah, score: 1)
vote!(entry: nanzenji, user: peter, score: 2)
vote!(entry: ramen_dinner, user: sarah, score: 0)
vote!(entry: ramen_dinner, user: peter, score: 1)
vote!(entry: kaiseki_dinner, user: sarah, score: 2)
vote!(entry: kaiseki_dinner, user: peter, score: -1)
vote!(entry: pocket_wifi, user: sarah, score: 1)
vote!(entry: gion_walk, user: sarah, score: 1)
vote!(entry: gion_walk, user: peter, score: 1)
vote!(entry: yoyogi, user: sarah, score: 1)

# Todos: trip-level (no single entry), entry-level, and one on a bundle itself.
# The spread is deliberate -- it is what the bundle cards read out. Two bundles
# have open work sitting on a member idea (Daiso Harajuku, Nanzen-ji), one has
# work of its own that belongs to no single idea in it (Higashiyama day), and
# Travel day has nothing outstanding at all, so one card in the rail always
# shows the "0 open to-dos" state.
todo!(title: "Apply for visa", trip: japan, due_on: "2026-10-01")
todo!(title: "Buy JR pass", trip: japan, due_on: "2026-10-15")
todo!(title: "Reserve Kaiseki dinner table", entry: kaiseki_dinner, due_on: "2026-10-25")
todo!(title: "Check Nanzen-ji Hojo garden opening hours", entry: nanzenji)
todo!(title: "Ask mom for her Daiso list", entry: daiso_harajuku)
todo!(title: "Decide the Higashiyama order before Monday", entry: higashiyama_day)
booked_hotel = todo!(title: "Confirm hotel booking", entry: hotel, due_on: "2026-10-10")
booked_hotel.update!(done_at: Time.current) unless booked_hotel.done?

# A scheduled day with real times: the Higashiyama day, with the nested bundle
# of dinner options placed and one option chosen.
ScheduleItem.find_or_create_by!(trip: japan, entry: nanzenji, day: "2026-11-10") do |s|
  s.starts_at_minutes = 9 * 60 + 30 # 09:30
  s.ends_at_minutes = 10 * 60 + 30  # 10:30
end
ScheduleItem.find_or_create_by!(trip: japan, entry: dinner_options, day: "2026-11-10") do |s|
  s.starts_at_minutes = 18 * 60 + 30 # 18:30
  s.ends_at_minutes = 20 * 60        # 20:00
  s.chosen_entry_id = kaiseki_dinner.id
  s.note = "Kaiseki won the vote."
end
ScheduleItem.find_or_create_by!(trip: japan, entry: shibuya_afternoon, day: "2026-11-05") do |s|
  s.starts_at_minutes = 14 * 60 # 14:00
  s.note = "Harajuku first, then down to Shibuya, then sit in the park."
end

# --- Malaysia trip: lift/absorb exercise ------------------------------------

malaysia = entry!(kind: "trip", title: "Malaysia", created_by: peter, description: "Not yet sure how many days.")

penang = entry!(kind: "idea", title: "Penang", category: "place", created_by: peter, lat: 5.4141, lng: 100.3288)
melaka = entry!(kind: "idea", title: "Melaka", category: "place", created_by: peter, lat: 2.1896, lng: 102.2501)
bali = entry!(kind: "idea", title: "Bali", category: "place", created_by: sarah, lat: -8.3405, lng: 115.0920)
[penang, melaka, bali].each { |sibling| link!(parent: malaysia, child: sibling) }

vote!(entry: penang, user: peter, score: 2)
vote!(entry: penang, user: sarah, score: 1)
vote!(entry: melaka, user: peter, score: 1)
vote!(entry: bali, user: sarah, score: 2)
vote!(entry: bali, user: peter, score: -2)

todo!(title: "Check Malaysia visa-free entry length", trip: malaysia)

# --- Who is on each trip ---------------------------------------------------
#
# Without these rows the demo has no trips anyone can see. Peter created five of
# the ideas inside Sarah's Japan trip and votes on eight of its entries, so he
# has to be on it -- the two-voice vote tally is the stated reason the second
# seeded account exists. Sarah reads Malaysia but does not touch it, which is
# the one seeded read-only case. (The owner rows already exist: creating a trip
# grants its creator one. Named here anyway so the picture is in one place.)

member!(trip: japan,    user: sarah, role: "owner")
member!(trip: japan,    user: peter, role: "member")
member!(trip: malaysia, user: peter, role: "owner")
member!(trip: malaysia, user: sarah, role: "viewer")

# --- Library: saved inspiration not yet attached to any trip ---------------

saigon_idea = entry!(
  kind: "idea", title: "Saigon street food crawl", category: "food", created_by: sarah,
  notes: "Saw this on Instagram, no trip planned yet.",
  source_url: "https://instagram.com/p/example-saigon"
)
vote!(entry: saigon_idea, user: sarah, score: 2)

puts "Seeded #{Entry.count} entries (#{Entry.trip.count} trips, #{Entry.bundle.count} bundles, " \
     "#{Entry.idea.count} ideas), #{EntryLink.count} links, #{Vote.count} votes, " \
     "#{Todo.count} todos, #{ScheduleItem.count} schedule items, " \
     "#{TripMembership.count} trip memberships, #{User.count} users."
