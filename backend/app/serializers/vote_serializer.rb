class VoteSerializer
  def self.one(vote)
    {
      "id" => vote.id,
      "entry_id" => vote.entry_id,
      "user_id" => vote.user_id,
      "score" => vote.score,
      "created_at" => vote.created_at.iso8601,
      "updated_at" => vote.updated_at.iso8601
    }
  end
end
