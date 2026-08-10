module Api
  class VotesController < Api::BaseController
    before_action :set_entry

    def update
      vote = Vote.find_or_initialize_by(entry: @entry, user: current_user)
      vote.score = params[:score]
      if vote.save
        render json: { vote: VoteSerializer.one(vote), tally: tally_for(@entry.id) }
      else
        render json: { errors: vote.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def destroy
      Vote.where(entry: @entry, user: current_user).destroy_all
      head :no_content
    end

    private

    def set_entry
      @entry = Entry.find(params[:entry_id])
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
