# One signed-in browser. The cookie carries only the token; the row is the
# authority, so destroying it revokes that browser server-side no matter what
# cookie it still holds. Every sign-in creates a fresh row (token rotation);
# sign-out destroys the current one.
class Session < ApplicationRecord
  # A cookie that never expired server-side was the M3 finding: the row's
  # expires_at bounds the credential's life regardless of the cookie's own.
  LIFETIME = 30.days

  belongs_to :user

  has_secure_token

  validates :expires_at, presence: true

  before_validation on: :create do
    self.expires_at ||= LIFETIME.from_now
  end

  scope :active, -> { where(expires_at: Time.current..) }

  def active?
    expires_at.future?
  end
end
