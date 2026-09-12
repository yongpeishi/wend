require "test_helper"

class DayVersionTest < ActiveSupport::TestCase
  setup do
    @user = create_user
    @trip = create_trip(created_by: @user)
    @trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    @version_a = @trip_day.first_live_version
  end

  test "name_for walks A..Z and then AA, so a day can be forked past 26 times" do
    assert_equal "Version A", DayVersion.name_for(0)
    assert_equal "Version B", DayVersion.name_for(1)
    assert_equal "Version Z", DayVersion.name_for(25)
    assert_equal "Version AA", DayVersion.name_for(26)
    assert_equal "Version AB", DayVersion.name_for(27)
  end

  test "keep! archives the live siblings and renames the survivor to Version A" do
    version_b = @trip_day.fork!
    version_c = @trip_day.fork!

    version_c.keep!

    assert_equal "Version A", version_c.reload.name
    assert_equal 0, version_c.position
    assert_nil version_c.archived_at
    assert_not_nil @version_a.reload.archived_at
    assert_not_nil version_b.reload.archived_at
    assert_equal [version_c.id], @trip_day.live_versions.reload.map(&:id)
  end

  test "keep! on the only live version is a no-op" do
    version_b = @trip_day.fork!
    @version_a.archive!

    assert_equal "Version B", version_b.reload.name
    version_b.keep!

    # Untouched: no siblings to choose between, so no renaming either.
    assert_equal "Version B", version_b.reload.name
    assert_not_nil @version_a.reload.archived_at
  end

  test "archive! refuses to leave a day with no live version" do
    assert_equal false, @version_a.archive!
    assert_nil @version_a.reload.archived_at

    version_b = @trip_day.fork!
    assert @version_a.archive!
    assert_not_nil @version_a.reload.archived_at
    assert_equal false, version_b.archive!
  end

  test "restore! appends at the end of the live list under the next free letter" do
    version_b = @trip_day.fork!
    version_b.keep!

    assert_equal "Version A", version_b.reload.name
    assert_not_nil @version_a.reload.archived_at

    @version_a.restore!

    assert_nil @version_a.reload.archived_at
    # "Version A" is taken by the survivor, so the freed-up letter is B.
    assert_equal "Version B", @version_a.name
    assert_equal 1, @version_a.position
    assert_equal [version_b.id, @version_a.id], @trip_day.live_versions.reload.map(&:id)
  end

  test "fork! copies the hours a plan's members were given, as rows of the copy's own" do
    bundle = create_bundle(created_by: @user)
    link!(parent: @trip, child: bundle)
    ramen = create_idea(title: "Ramen", created_by: @user)
    kaiseki = create_idea(title: "Kaiseki", created_by: @user)
    link!(parent: bundle, child: ramen, position: 0)
    link!(parent: bundle, child: kaiseki, position: 1)
    item = @version_a.schedule_items.create!(trip: @trip, entry: bundle, day: @trip_day.day,
                                             starts_at_minutes: 540, ends_at_minutes: 720)
    item.member_times.create!(entry: ramen, starts_at_minutes: 540, ends_at_minutes: 600)
    item.member_times.create!(entry: kaiseki, starts_at_minutes: 660, ends_at_minutes: nil)

    version_b = @trip_day.fork!
    copy = version_b.schedule_items.sole

    assert_not_equal item.id, copy.id
    assert_equal [[ramen.id, 540, 600], [kaiseki.id, 660, nil]],
                 copy.member_times.order(:id).map { |t| [t.entry_id, t.starts_at_minutes, t.ends_at_minutes] }

    # Its own rows, not shared ones: re-timing the copy leaves the source alone.
    copy.member_times.find_by!(entry_id: ramen.id).update!(ends_at_minutes: 630)
    assert_equal 600, item.member_times.find_by!(entry_id: ramen.id).ends_at_minutes
  end

  test "a fork after a keep keeps climbing the letters" do
    version_b = @trip_day.fork!
    version_b.keep!

    # Two versions have existed on this day, so the third is C even though the
    # survivor was renamed back to A.
    assert_equal "Version C", @trip_day.fork!.name
  end
end
