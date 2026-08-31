class User < ApplicationRecord
  require "digest/sha1"

  has_secure_password

  # entries.created_by_id is NOT NULL, so :nullify could never work -- destroying a
  # user raised. Making the column nullable is the obvious alternative fix and is
  # exactly what would break owner integrity, so refuse instead: someone else has to
  # take over what this person made before the account can go.
  has_many :entries, foreign_key: :created_by_id, inverse_of: :created_by, dependent: :restrict_with_error
  has_many :votes, dependent: :destroy
  has_many :feedbacks, dependent: :destroy
  # delete_all, not destroy: TripMembership's last-owner guard exists to stop a trip
  # losing its owner one row at a time, and it would abort mid-cascade here. The trip
  # itself is already protected -- its creator cannot be destroyed at all (above).
  has_many :trip_memberships, dependent: :delete_all
  # Session tokens are just credentials -- nothing worth preserving or auditing on
  # the way out, so delete rather than destroy.
  has_many :sessions, dependent: :delete_all

  validates :name, presence: true
  validates :email, presence: true, uniqueness: { case_sensitive: false },
                     format: { with: URI::MailTo::EMAIL_REGEXP }
  # allow_nil: updates that don't touch the password (has_secure_password leaves it
  # nil) must stay valid; presence on create is already enforced by has_secure_password.
  validates :password, length: { minimum: 8 }, allow_nil: true

  before_save { self.email = email.downcase.strip if email.present? }

  # A password change rotates this without another credential column. The
  # password digest is already a salted secret, so the resulting URL cannot be
  # derived from the public user id alone.
  def calendar_token
    Digest::SHA1.hexdigest("#{id}#{password_digest}")
  end
end
