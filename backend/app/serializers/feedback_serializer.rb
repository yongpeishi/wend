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
        "screenshots" => screenshots(feedback),
        "created_at" => feedback.created_at.iso8601,
        "updated_at" => feedback.updated_at.iso8601
      }
    end

    private

    # Always an array, `[]` when there is nothing attached, so the client renders
    # a gallery the same way whether or not this report has pictures and never
    # has to distinguish "no screenshots" from "key absent".
    #
    # `filename`, `content_type` and `byte_size` come off the attachment rather
    # than being re-derived: they are what the blob recorded at upload, which is
    # also what the model's validation judged, so what the client is told matches
    # what was actually allowed in.
    #
    # The URL is signed and short-lived by design. A screenshot of someone's trip
    # can hold anything they had on screen, and it is served from a bucket with no
    # notion of who is asking -- so the link is the authorization, and fifteen
    # minutes is long enough to load a page and look at the pictures without the
    # link staying useful if it leaks out of a log or a forwarded response.
    def screenshots(feedback)
      feedback.screenshots.map do |attachment|
        {
          "id" => attachment.id,
          "filename" => attachment.filename.to_s,
          "content_type" => attachment.content_type,
          "byte_size" => attachment.byte_size,
          "url" => attachment.blob.url(expires_in: 15.minutes)
        }
      end
    end
  end
end
