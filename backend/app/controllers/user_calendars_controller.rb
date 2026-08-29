class UserCalendarsController < ApplicationController
  def show
    user = User.find(params[:id])
    supplied_token = params[:auth].to_s
    unless supplied_token.bytesize == user.calendar_token.bytesize &&
           ActiveSupport::SecurityUtils.secure_compare(supplied_token, user.calendar_token)
      return head :not_found
    end

    send_data UserCalendar.new(user).to_ical,
              type: "text/calendar; charset=utf-8",
              disposition: "inline",
              filename: "#{user.name.parameterize.presence || "wend"}-itinerary.ics"
  end
end