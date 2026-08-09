class EntryLinkSerializer
  class << self
    def list(links)
      Array(links).map { |l| one(l) }
    end

    def one(link)
      {
        "id" => link.id,
        "parent_id" => link.parent_id,
        "child_id" => link.child_id,
        "position" => link.position,
        "created_at" => link.created_at.iso8601,
        "updated_at" => link.updated_at.iso8601
      }
    end
  end
end
