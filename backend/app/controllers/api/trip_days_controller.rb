module Api
  class TripDaysController < Api::BaseController
    before_action :set_trip

    # Where you sleep that night. The row is created on demand: the client
    # PATCHes a date, not an id, because until now the day may not have existed.
    # Sending both keys as null clears the lodging.
    def update
      trip_day = TripDay.ensure!(trip_id: @trip.id, day: params[:day])

      if trip_day.update(trip_day_params)
        render json: { trip_day: TripDaySerializer.one(trip_day.reload) }
      else
        render json: { errors: trip_day.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    private

    def set_trip
      @trip = Entry.find(params[:trip_id])
    end

    def trip_day_params
      params.require(:trip_day).permit(:lodging_entry_id, :lodging_label)
    end
  end
end
