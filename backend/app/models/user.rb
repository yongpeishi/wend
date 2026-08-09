class User < ApplicationRecord
  has_secure_password

  has_many :entries, foreign_key: :created_by_id, inverse_of: :created_by, dependent: :nullify
  has_many :votes, dependent: :destroy
  has_many :feedbacks, dependent: :destroy

  validates :name, presence: true
  validates :email, presence: true, uniqueness: { case_sensitive: false },
                     format: { with: URI::MailTo::EMAIL_REGEXP }

  before_save { self.email = email.downcase.strip if email.present? }
end
