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

    def tally_for(entry_id)
      rows = Vote.where(entry_id: entry_id).pluck(:user_id, :score)
      total = rows.sum { |_, score| score }
      count = rows.size
      {
        "total" => total,
        "count" => count,
        "average" => count.zero? ? 0.0 : (total.to_f / count).round(2),
        "by_user" => rows.to_h { |user_id, score| [user_id.to_s, score] }
      }
    end
  end
end
