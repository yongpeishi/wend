module Api
  # The itinerary screen's read: every day of this trip that has a row, with
  # its versions and everything placed on them. Days with nothing on them have
  # no row -- the client merges this against the trip's date range.
  class ItinerariesController < Api::BaseController
    def index
      trip = Entry.find(params[:trip_id])
      trip_days = TripDay.for_trip(trip.id)
                         .includes(:lodging_entry, day_versions: :schedule_items)
                         .to_a
      render json: { trip_days: TripDaySerializer.list(trip_days) }
    end
  end
end
