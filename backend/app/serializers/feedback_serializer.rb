class FeedbackSerializer
  class << self
    def list(feedbacks)
      Array(feedbacks).map { |f| one(f) }
    end

    def one(feedback)
      {
        "id" => feedback.id,
        "message" => feedback.message,
        "user_id" => feedback.user_id,
        "url" => feedback.url,
        "element_selector" => feedback.element_selector,
        "element_classes" => feedback.element_classes,
        "status" => feedback.status,
        "created_at" => feedback.created_at.iso8601,
        "updated_at" => feedback.updated_at.iso8601
      }
    end
  end
end
