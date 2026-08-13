module Api
  class ScheduleItemsController < Api::BaseController
    before_action :set_trip, only: [:index, :create]
    before_action :set_item, only: [:update, :destroy, :ungroup]

    def index
      scope = ScheduleItem.where(trip_id: @trip.id)
      scope = scope.where(day: params[:day]) if params[:day].present?
      items = scope.order(:day, :starts_at_minutes, :position).to_a
      render json: { schedule_items: ScheduleItemSerializer.list(items) }
    end

    def create
      item = @trip.schedule_items_as_trip.new(schedule_item_params)
      resolve_day_version!(item)
      if item.save
        render json: { schedule_item: ScheduleItemSerializer.one(item) }, status: :created
      else
        render json: { errors: item.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def update
      @item.assign_attributes(schedule_item_params)
      # Moved to another date without being told which version: the old version
      # belongs to the old day, so drop it and resolve again.
      @item.day_version_id = nil if @item.day_changed? && !schedule_item_params.key?("day_version_id")
      resolve_day_version!(@item)

      if @item.save
        render json: { schedule_item: ScheduleItemSerializer.one(@item) }
      else
        render json: { errors: @item.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def destroy
      @item.destroy
      head :no_content
    end

    # Replace a placed bundle with one item per member, inside the same
    # version. See ScheduleItem#ungroup! for why destroying the bundle row is
    # not a violation of "nothing is discarded".
    def ungroup
      resolve_day_version!(@item)
      @item.save! if @item.changed?

      unless @item.ungroupable?
        render json: { errors: { entry_id: ["must be a bundle with at least one member"] } },
               status: :unprocessable_entity
        return
      end

      trip_day = @item.day_version&.trip_day
      @item.ungroup!
      render json: { trip_day: TripDaySerializer.one(trip_day.reload) }
    end

    private

    def set_trip
      @trip = Entry.find(params[:trip_id])
    end

    def set_item
      @item = ScheduleItem.find(params[:id])
    end

    # The itinerary screen posts a `day_version_id`; the older final-schedule
    # screen posts only a `day` and knows nothing about versions. Both keep
    # working: with no version given the item lands on that day's first live
    # one, creating the trip_day and its "Version A" if this is the first thing
    # placed there.
    def resolve_day_version!(item)
      if item.day_version_id.present?
        # A version implies its date -- fill `day` in when the caller left it out.
        item.day ||= item.day_version&.trip_day&.day
        return
      end

      return if item.trip_id.blank? || item.day.blank?

      item.day_version = TripDay.ensure!(trip_id: item.trip_id, day: item.day).first_live_version
    end

    def schedule_item_params
      params.require(:schedule_item).permit(
        :entry_id, :chosen_entry_id, :day, :day_version_id,
        :starts_at_minutes, :ends_at_minutes, :note, :position
      )
    end
  end
end
