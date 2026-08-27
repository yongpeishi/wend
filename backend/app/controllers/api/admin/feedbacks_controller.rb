require "csv"

module Api
  module Admin
    class FeedbacksController < Api::Admin::BaseController
      # Everyone's feedback, newest first, no pagination: the whole pile is the
      # point of the admin view, and its size is bounded by how much feedback a
      # small app actually gets. includes(:user) because the serializer nests the
      # reporter on every row.
      def index
        render json: { feedbacks: ::Admin::FeedbackSerializer.list(all_feedbacks) }
      end

      # Triage only: `status` is the single permitted field. Invalid statuses fall
      # through update! to the shared RecordInvalid -> 422 rendering.
      def update
        feedback = Feedback.find(params[:id])
        authorize [:admin, feedback]

        feedback.update!(feedback_params)
        render json: { feedback: ::Admin::FeedbackSerializer.one(feedback) }
      end

      # The same pile as index, as a file. CSV via the stdlib; nils come out as
      # empty cells, which is what a spreadsheet wants.
      def export
        authorize [:admin, Feedback], :export?

        csv = CSV.generate do |rows|
          rows << %w[id created_at user_name user_email status message url element_selector element_classes user_agent]
          all_feedbacks.each do |f|
            rows << [f.id, f.created_at.iso8601, f.user.name, f.user.email, f.status,
                     f.message, f.url, f.element_selector, f.element_classes, f.user_agent]
          end
        end

        send_data csv, type: "text/csv", filename: "wend-feedback-#{Date.current.iso8601}.csv"
      end

      private

      def all_feedbacks
        policy_scope([:admin, Feedback]).newest_first.includes(:user)
      end

      def feedback_params
        params.require(:feedback).permit(:status)
      end
    end
  end
end
