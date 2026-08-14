module Api
  class ScheduleItemsController < Api::BaseController
    before_action :set_trip, only: [:index, :create]
    before_action :set_item, only: [:update, :destroy]

    def index
      scope = policy_scope(ScheduleItem).where(trip_id: @trip.id)
      scope = scope.where(day: params[:day]) if params[:day].present?
      items = scope.order(:day, :starts_at_minutes, :position).to_a
      render json: { schedule_items: ScheduleItemSerializer.list(items) }
    end

    def create
      item = @trip.schedule_items_as_trip.new(schedule_item_params)
      # trip_id is already set by the association, so the policy has a trip to
      # resolve against.
      authorize item
      if item.save
        render json: { schedule_item: ScheduleItemSerializer.one(item) }, status: :created
      else
        render json: { errors: item.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def update
      if @item.update(schedule_item_params)
        render json: { schedule_item: ScheduleItemSerializer.one(@item) }
      else
        render json: { errors: @item.errors.to_hash(true) }, status: :unprocessable_entity
      end
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

    def schedule_item_params
      params.require(:schedule_item).permit(
        :entry_id, :chosen_entry_id, :day, :starts_at_minutes, :ends_at_minutes, :note, :position
      )
    end
  end
end
