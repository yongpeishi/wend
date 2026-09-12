module Api
  # The hours of one member of a placed plan. One member per call, addressed by
  # the placement it sits in and the entry it is:
  #
  #   PATCH /api/schedule_items/:schedule_item_id/members/:entry_id
  #         { member_time: { starts_at_minutes, ends_at_minutes } }
  #
  # Both minutes null means "no time yet" again, which is the absence of a row,
  # not a row of nulls -- the table stays sparse. Every success answers with the
  # whole item in its itinerary shape, so the screen can swap the band in place
  # without a second read.
  class ScheduleItemMemberTimesController < Api::BaseController
    before_action :set_item

    def update
      member_time = @item.member_times.find_or_initialize_by(entry_id: params[:entry_id])

      if clearing?
        # A row that exists goes; one that does not is still asked whether it
        # could have, so clearing a non-member answers the same 422 as timing
        # one would, and clearing a member nobody timed is a quiet no-op.
        member_time.persisted? ? member_time.destroy! : member_time.validate!
      else
        member_time.update!(member_time_params)
      end

      render json: { schedule_item: ItineraryItemSerializer.one(@item.reload) }
    end

    private

    # The route carries no trip_id, so the row's own trip is the only authority
    # there is -- exactly what ScheduleItemPolicy::Scope resolves. Anything
    # outside the caller's trips is a 404, never a 403 (see ApplicationController).
    def set_item
      @item = policy_scope(ScheduleItem).find(params[:schedule_item_id])
      authorize @item, :update?
    end

    def clearing?
      member_time_params[:starts_at_minutes].nil? && member_time_params[:ends_at_minutes].nil?
    end

    def member_time_params
      params.require(:member_time).permit(:starts_at_minutes, :ends_at_minutes)
    end
  end
end
