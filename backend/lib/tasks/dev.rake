# One command that leaves the development database usable whatever state it
# starts in, so `scripts/start-dev` can call it before booting the server.
#
# `db:prepare` on its own is not enough. It seeds only a database it created
# itself, and a Rails server pointed at a missing sqlite file does not fail --
# sqlite quietly creates an empty one on the first connection. The first
# request then 500s with "Migrations are pending. To resolve this issue, run:
# bin/rails db:migrate", and following that advice builds the schema without
# ever running the seeds. From then on `db:prepare` sees a populated
# schema_migrations, considers the database initialized, and never seeds it --
# so the app comes up empty, with no account to sign in as, until someone
# reaches for `db:reset`. Seeding an empty database closes that hole.
namespace :dev do
  desc "Create, migrate, and seed the development database if it has never been seeded"
  task prepare: :environment do
    unless Rails.env.development?
      puts "dev:prepare only touches the development database (RAILS_ENV=#{Rails.env}) -- nothing to do"
      next
    end

    Rake::Task["db:prepare"].invoke

    # No users means the seeds have never run here: either a fresh database, or
    # one migrated before it was seeded. Anything else is a database someone has
    # been working in, and re-seeding it would resurrect demo records they
    # deleted, so leave it alone.
    if User.exists?
      puts "Database ready (#{User.count} users, #{Entry.count} entries)."
    else
      puts "Database has no users -- seeding."
      Rake::Task["db:seed"].invoke
    end
  end
end
