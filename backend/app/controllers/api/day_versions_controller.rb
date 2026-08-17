module Api
  # Alternate plans for a day. Every action answers with the whole affected
  # TripDay so the client replaces one day in its cache rather than refetching.
  class DayVersionsController < Api::BaseController
    before_action :set_version, only: [:keep, :restore, :destroy]

    # Fork: duplicate the day's last live version so two plans sit side by side.
    # The trip_day (and its "Version A") is created on demand.
    def create
      trip = policy_scope(Entry).find(params[:trip_id])
      # Same as TripDaysController#update: ask against the day the fork would
      # land on, before ensure! brings the row into being.
      authorize TripDay.new(trip_id: trip.id, day: params[:day]), :update?

      trip_day = TripDay.ensure!(trip_id: trip.id, day: params[:day])
      trip_day.fork!
      render json: { trip_day: TripDaySerializer.one(trip_day.reload) }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
    end

    # This is the one. Live siblings are archived rather than dropped -- see
    # DayVersion#keep!.
    def keep
      @version.keep!
      render json: { trip_day: TripDaySerializer.one(@version.trip_day.reload) }
    end

    def restore
      @version.restore!
      render json: { trip_day: TripDaySerializer.one(@version.trip_day.reload) }
    end

    # Archive, never destroy -- doc/architecture.md's "nothing is discarded"
    # covers versions as much as entries. Refused when it is the day's last
    # live version.
    def destroy
      if @version.archive!
        render json: { trip_day: TripDaySerializer.one(@version.trip_day.reload) }
      else
        render json: { errors: { base: ["a day must keep at least one live version"] } },
               status: :unprocessable_entity
      end
    end

    private

    # These routes carry no trip_id, so the only authority available is the
    # row's own day -- which is exactly what DayVersionPolicy::Scope and
    # governing_entry_ids resolve. A version on a trip you cannot see 404s.
    def set_version
      @version = policy_scope(DayVersion).find(params[:id])
      authorize @version
    end
  end
end
