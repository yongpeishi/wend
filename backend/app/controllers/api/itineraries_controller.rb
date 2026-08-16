module Api
  # The itinerary screen's read: every day of this trip that has a row, with
  # its versions and everything placed on them. Days with nothing on them have
  # no row -- the client merges this against the trip's date range.
  class ItinerariesController < Api::BaseController
    before_action :set_trip

    def index
      render json: { trip_days: TripDaySerializer.list(trip_days) }
    end

    # "Move Day 2 to be Day 3" -- an exchange, not a reorder: Day 3 comes back
    # to Day 2 rather than being pushed along. Either date may be empty. The
    # whole trip comes back because a swap can renumber how the client labels
    # both days.
    def swap_days
      a = parse_day(params[:a])
      b = parse_day(params[:b])
      return render(json: { error: "invalid_day" }, status: :unprocessable_entity) if a.nil? || b.nil?

      unless in_trip?(a) && in_trip?(b)
        return render(json: { error: "day_outside_trip" }, status: :unprocessable_entity)
      end

      TripDay.swap_days!(trip_id: @trip.id, a: a, b: b)
      render json: { trip_days: TripDaySerializer.list(trip_days) }
    end

    private

    def set_trip
      @trip = Entry.find(params[:trip_id])
    end

    def trip_days
      TripDay.for_trip(@trip.id)
             .includes(:lodging_entry, day_versions: :schedule_items)
             .to_a
    end

    def parse_day(value)
      Date.iso8601(value.to_s)
    rescue ArgumentError, TypeError
      nil
    end

    # A trip with no dates set has no range for a day to be inside of.
    def in_trip?(day)
      return false if @trip.starts_on.blank? || @trip.ends_on.blank?

      day.between?(@trip.starts_on, @trip.ends_on)
    end
  end
end
