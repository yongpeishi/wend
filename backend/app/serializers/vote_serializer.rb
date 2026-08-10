class VoteSerializer
  def self.one(vote)
    {
      "id" => vote.id,
      "entry_id" => vote.entry_id,
      "user_id" => vote.user_id,
      # The per-user breakdown in the entry drawer names the voter. Without
      # this the multi-user vote reads as anonymous scores, which is most of
      # the point of the feature.
      "user_name" => vote.user&.name,
      "score" => vote.score,
      "created_at" => vote.created_at.iso8601,
      "updated_at" => vote.updated_at.iso8601
    }
  end
end
