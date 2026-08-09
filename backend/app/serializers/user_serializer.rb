class UserSerializer
  def self.one(user)
    {
      "id" => user.id,
      "name" => user.name,
      "email" => user.email,
      "created_at" => user.created_at.iso8601,
      "updated_at" => user.updated_at.iso8601
    }
  end
end
