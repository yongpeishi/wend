module Api
  class ScheduleItemsController < Api::BaseController
    before_action :set_trip, only: [:index, :create]
    before_action :set_item, only: [:update, :destroy]

    # The Final schedule screen: one plan per day, never two stacked on top of
    # each other and never one the user rejected. `in_final_plan` is what draws
    # that line -- see ScheduleItem.
    def index
      scope = policy_scope(ScheduleItem).where(trip_id: @trip.id).in_final_plan
      scope = scope.where(day: params[:day]) if params[:day].present?
      items = scope.order(:day, :starts_at_minutes, :position).to_a
      render json: { schedule_items: ScheduleItemSerializer.list(items) }
    end

    def create
      item = @trip.schedule_items_as_trip.new(schedule_item_params)
      # trip_id is already set by the association, so the policy has a trip to
      # resolve against. Ask before resolving the day version, which creates the
      # trip_day as a side effect.
      authorize item
      resolve_day_version!(item)
      item.save!
      render json: { schedule_item: ScheduleItemSerializer.one(item) }, status: :created
    end

    def update
      @item.assign_attributes(schedule_item_params)
      # Moved to another date without being told which version: the old version
      # belongs to the old day, so drop it and resolve again.
      @item.day_version_id = nil if @item.day_changed? && !schedule_item_params.key?("day_version_id")
      resolve_day_version!(@item)

      @item.save!
      render json: { schedule_item: ScheduleItemSerializer.one(@item) }
    end

    def destroy
      @item.destroy
      head :no_content
    end

    private

    def set_trip
      @trip = policy_scope(Entry).find(params[:trip_id])
    end

    # PATCH and DELETE /api/schedule_items/:id carry no trip_id in the route, so the
    # only authority available is the row's own trip -- which is exactly what
    # ScheduleItemPolicy::Scope and governing_entry_ids resolve.
    def set_item
      @item = policy_scope(ScheduleItem).find(params[:id])
      authorize @item
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
