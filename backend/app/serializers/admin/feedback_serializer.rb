# The enduser shape plus what triage needs: the environment (`user_agent`) and who
# said it (nested `user`). Built on FeedbackSerializer.one so the two shapes cannot
# drift apart field by field.
module Admin
  class FeedbackSerializer
    class << self
      def list(feedbacks)
        Array(feedbacks).map { |f| one(f) }
      end

      def one(feedback)
        ::FeedbackSerializer.one(feedback).merge(
          "user_agent" => feedback.user_agent,
          "user" => {
            "id" => feedback.user.id,
            "name" => feedback.user.name,
            "email" => feedback.user.email
          }
        )
      end
    end
  end
end
