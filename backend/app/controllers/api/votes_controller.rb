module Api
  class VotesController < Api::BaseController
    before_action :set_entry

    def update
      vote = Vote.find_or_initialize_by(entry: @entry, user: current_user)
      vote.score = params[:score]
      vote.save!
      render json: { vote: VoteSerializer.one(vote), tally: tally_for(@entry.id) }
    end

    def destroy
      Vote.where(entry: @entry, user: current_user).destroy_all
      head :no_content
    end

    private

    # A vote is a change to the trip, not a way of reading it, so this is write? and
    # a viewer gets a 404. Without it set_entry accepted any entry id in the database.
    def set_entry
      @entry = Entry.find(params[:entry_id])
      authorize @entry, :vote?
    end

    # Same shape as EntrySerializer's `vote_tally`, `voters` included, so the row the
    # board patches in after a vote matches the row the list handed it. One entry
    # here, so a plain includes(:user) is enough -- no bulk grouping needed.
    def tally_for(entry_id)
      votes = Vote.where(entry_id: entry_id).includes(:user).order(:user_id).to_a
      total = votes.sum(&:score)
      count = votes.size
      {
        "total" => total,
        "count" => count,
        "average" => count.zero? ? 0.0 : (total.to_f / count).round(2),
        "by_user" => votes.to_h { |vote| [ vote.user_id.to_s, vote.score ] },
        "voters" => votes.map { |vote| { "user_id" => vote.user_id, "user_name" => vote.user&.name, "score" => vote.score } }
      }
    end
  end
end
