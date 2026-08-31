class UserSerializer
  def self.one(user)
    {
      "id" => user.id,
      "name" => user.name,
      "email" => user.email,
      "admin" => user.admin,
      "ical_url" => "/users/#{user.id}/ical?auth=#{user.calendar_token}",
      "created_at" => user.created_at.iso8601,
      "updated_at" => user.updated_at.iso8601
    }
  end
end
