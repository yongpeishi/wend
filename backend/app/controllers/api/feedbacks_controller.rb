module Api
  class FeedbacksController < Api::BaseController
    # Your own submissions, newest first -- so the floating panel can show
    # "you've said this before" rather than being a write-only void.
    # Deliberately NOT everyone's feedback: who may read the whole pile is a
    # product question, and scoping to the author is the answer that cannot be
    # wrong. See `.claude/interaction/wend-mvp/decisions.md` §8.
    # The screenshot preload is not an optimisation so much as a bound: the
    # serializer signs a URL per attachment, and without it every row would cost
    # two more queries (its attachments, then their blobs) on a list that can
    # return up to MAX_LIMIT rows.
    def index
      feedbacks = policy_scope(Feedback).newest_first.limit(limit).includes(screenshots_attachments: :blob)
      render json: { feedbacks: FeedbackSerializer.list(feedbacks) }
    end

    def create
      feedback = current_user.feedbacks.new(feedback_params)
      # Authorship and environment come from the request, never from the body.
      feedback.user_agent = request.user_agent
      # Feedback is not trip-scoped -- FeedbackPolicy asks only whose it is, and
      # user_id is already set by the association above.
      authorize feedback

      feedback.save!
      render json: { feedback: FeedbackSerializer.one(feedback) }, status: :created
    end

    private

    DEFAULT_LIMIT = 50
    MAX_LIMIT = 200

    def limit
      requested = params[:limit].presence&.to_i || DEFAULT_LIMIT
      requested.clamp(1, MAX_LIMIT)
    end

    # `status` is not permitted: triage is not the reporter's call, and there is
    # no update endpoint yet. `user_id` is not permitted either -- see create.
    #
    # `screenshots: []` is the array form strong params needs for a repeated
    # multipart field. Nothing else about create changes: a JSON body with no
    # screenshots key attaches nothing and behaves exactly as it did before.
    # What may be attached is Feedback's business, not the controller's -- the
    # count, size and content-type rules live in the model so they fail through
    # the shared RecordInvalid -> 422 path rather than being hand-rendered here.
    def feedback_params
      params.require(:feedback).permit(:message, :url, :element_selector, :element_classes, screenshots: [])
    end
  end
end
