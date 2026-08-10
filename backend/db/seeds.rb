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

# --- Japan trip ------------------------------------------------------------

japan = entry!(
  kind: "trip", title: "Japan", created_by: sarah,
  description: "Two weeks, Tokyo to Kyoto.", starts_on: "2026-11-02", ends_on: "2026-11-16"
)

# A bundle of interchangeable Daiso branches -- "whichever one works with the
# schedule" (doc/project.md's own example).
daiso_bundle = entry!(kind: "bundle", title: "Daiso (any branch)", created_by: sarah)
link!(parent: japan, child: daiso_bundle)

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
[daiso_harajuku, daiso_shibuya, daiso_kyoto].each { |d| link!(parent: daiso_bundle, child: d) }

# A Kyoto day bundle with two dinner options.
kyoto_day = entry!(kind: "bundle", title: "Kyoto: temples and dinner", created_by: peter)
link!(parent: japan, child: kyoto_day)

nanzenji = entry!(
  kind: "idea", title: "Nanzen-ji", category: "place", created_by: peter,
  location_name: "Nanzen-ji", address: "Nanzenji Fukuchicho, Sakyo Ward, Kyoto",
  lat: 35.0116, lng: 135.7931, duration_minutes: 60,
  notes: "Free to enter the grounds; the Sanmon gate and Hojo garden charge separately."
)
link!(parent: kyoto_day, child: nanzenji)

dinner_options = entry!(kind: "bundle", title: "Kyoto dinner options", created_by: peter)
link!(parent: kyoto_day, child: dinner_options)

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
[ramen_dinner, kaiseki_dinner].each { |d| link!(parent: dinner_options, child: d) }

# Lodging, activity, transport, and "other" categories, to round out all six.
hotel = entry!(
  kind: "idea", title: "Hotel Granvia Kyoto", category: "lodging", created_by: sarah,
  location_name: "Hotel Granvia Kyoto", lat: 34.9858, lng: 135.7588,
  notes: "Attached to Kyoto Station, easy for early Shinkansen mornings."
)
link!(parent: japan, child: hotel)

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
link!(parent: japan, child: shinkansen)

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

# Todos: trip-level (no single entry) and entry-level.
todo!(title: "Apply for visa", trip: japan, due_on: "2026-10-01")
todo!(title: "Buy JR pass", trip: japan, due_on: "2026-10-15")
todo!(title: "Reserve Kaiseki dinner table", entry: kaiseki_dinner, due_on: "2026-10-25")
todo!(title: "Check Nanzen-ji Hojo garden opening hours", entry: nanzenji)
booked_hotel = todo!(title: "Confirm hotel booking", entry: hotel, due_on: "2026-10-10")
booked_hotel.update!(done_at: Time.current) unless booked_hotel.done?

# A scheduled day with real times: the Kyoto temple + dinner day, with the
# bundle of dinner options placed and one option chosen.
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
ScheduleItem.find_or_create_by!(trip: japan, entry: daiso_bundle, day: "2026-11-05") do |s|
  s.starts_at_minutes = 14 * 60 # 14:00
  s.note = "Whichever branch is on the way."
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

# --- Library: saved inspiration not yet attached to any trip ---------------

saigon_idea = entry!(
  kind: "idea", title: "Saigon street food crawl", category: "food", created_by: sarah,
  notes: "Saw this on Instagram, no trip planned yet.",
  source_url: "https://instagram.com/p/example-saigon"
)
vote!(entry: saigon_idea, user: sarah, score: 2)

puts "Seeded #{Entry.count} entries (#{Entry.trip.count} trips, #{Entry.bundle.count} bundles, " \
     "#{Entry.idea.count} ideas), #{EntryLink.count} links, #{Vote.count} votes, " \
     "#{Todo.count} todos, #{ScheduleItem.count} schedule items, #{User.count} users."
