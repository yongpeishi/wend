module Api
  class TripDaysController < Api::BaseController
    before_action :set_trip

    # Where you sleep that night. The row is created on demand: the client
    # PATCHes a date, not an id, because until now the day may not have existed.
    # Sending both keys as null clears the lodging.
    def update
      # Asked against the day this write would land on, before ensure! creates
      # it: a viewer must not be able to bring a row into being by PATCHing a
      # date nobody has touched yet.
      authorize TripDay.new(trip_id: @trip.id, day: params[:day]), :update?

      trip_day = TripDay.ensure!(trip_id: @trip.id, day: params[:day])

      trip_day.update!(trip_day_params)
      render json: { trip_day: TripDaySerializer.one(trip_day.reload) }
    end

    private

    # A trip you cannot see must 404 rather than 403.
    def set_trip
      @trip = policy_scope(Entry).find(params[:trip_id])
    end

    def trip_day_params
      params.require(:trip_day).permit(:lodging_entry_id, :lodging_label)
    end
  end
end
