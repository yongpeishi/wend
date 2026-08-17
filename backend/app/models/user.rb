class User < ApplicationRecord
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

  validates :name, presence: true
  validates :email, presence: true, uniqueness: { case_sensitive: false },
                     format: { with: URI::MailTo::EMAIL_REGEXP }

  before_save { self.email = email.downcase.strip if email.present? }
end
