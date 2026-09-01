require "csv"

module Api
  module Admin
    class FeedbacksController < Api::Admin::BaseController
      # Everyone's feedback, newest first, no pagination: the whole pile is the
      # point of the admin view, and its size is bounded by how much feedback a
      # small app actually gets. The admin screen filters in the browser and
      # sends no `status` param, so it still gets everything; the param narrows
      # the list for callers with no browser to filter in, the same way it
      # narrows the export -- see Feedback.with_statuses for what an unknown or
      # empty value does. includes(:user) because the serializer nests the
      # reporter on every row, and the screenshot attachments and their blobs
      # because it signs a URL for each one -- with no pagination to hide it, an
      # N+1 here would scale with the whole table rather than with a page.
      def index
        render json: { feedbacks: ::Admin::FeedbackSerializer.list(narrowed_feedbacks) }
      end

      # Triage only: `status` is the single permitted field. Invalid statuses fall
      # through update! to the shared RecordInvalid -> 422 rendering.
      def update
        feedback = Feedback.find(params[:id])
        authorize [:admin, feedback]

        feedback.update!(feedback_params)
        render json: { feedback: ::Admin::FeedbackSerializer.one(feedback) }
      end

      # A hard delete, like todos: the find is scoped rather than merely
      # authorized afterwards, so an id outside the scope 404s before anything
      # irreversible can be asked of it. Only feedback that has reached an
      # ending -- done or rejected -- may go; anything still in triage answers
      # 422 and stays. The model removes the screenshots from the bucket after
      # the row is gone; see Feedback#destroy_and_remove_screenshots! for the
      # ordering and why a failed file delete only logs.
      def destroy
        feedback = policy_scope([:admin, Feedback]).find(params[:id])
        authorize [:admin, feedback]

        unless feedback.deletable?
          return render json: { error: "Only done or rejected feedback can be deleted" }, status: :unprocessable_entity
        end

        feedback.destroy_and_remove_screenshots!
        head :no_content
      end

      # The same pile as index, as a file, and narrowed the same way:
      # `?status[]=new&status[]=rejected` exports exactly what those two chips
      # leave on the table, so the file matches what the admin was looking at
      # when they pressed the button. No param is the whole pile. See
      # Feedback.with_statuses for what an unknown or empty value does.
      #
      # CSV via the stdlib; nils come out as empty cells, which is what a
      # spreadsheet wants.
      #
      # `screenshots` is one cell per row holding every picture's link, space
      # separated -- a URL cannot contain a bare space, so the cell splits back
      # into links unambiguously, and a row with no pictures is an empty cell
      # like any other nil. The links are this app's own screenshot route, not
      # the bucket's signed URLs: the file outlives those by days, and a link
      # that lasts that long has to be checked at the door rather than trusted
      # on sight. See Admin::ScreenshotsController. Absolute, on the host the
      # caller reached us through, since a file has no page to resolve a path
      # against.
      def export
        authorize [:admin, Feedback], :export?

        csv = CSV.generate do |rows|
          rows << %w[id created_at user_name user_email status message url element_selector element_classes user_agent screenshots]
          narrowed_feedbacks.each do |f|
            rows << [f.id, f.created_at.iso8601, f.user.name, f.user.email, f.status,
                     f.message, f.url, f.element_selector, f.element_classes, f.user_agent,
                     screenshot_links(f)]
          end
        end

        send_data csv, type: "text/csv", filename: "wend-feedback-#{Date.current.iso8601}.csv"
      end

      private

      # nil rather than "" for a row with no pictures, so the CSV writes the
      # same empty cell it writes for a missing selector or user agent.
      def screenshot_links(feedback)
        links = feedback.screenshots.map { |shot| api_admin_feedback_screenshot_url(feedback, shot) }
        links.join(" ").presence
      end

      def all_feedbacks
        policy_scope([:admin, Feedback]).newest_first.includes(:user, screenshots_attachments: :blob)
      end

      # `params[:status]` arrives as an array from `status[]=`, and as a bare
      # string from `status=`; Array() flattens the difference so both work.
      def narrowed_feedbacks
        all_feedbacks.with_statuses(params[:status])
      end

      def feedback_params
        params.require(:feedback).permit(:status)
      end
    end
  end
end
