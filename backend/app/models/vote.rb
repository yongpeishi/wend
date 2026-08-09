class Vote < ApplicationRecord
  belongs_to :entry
  belongs_to :user

  validates :score, presence: true, inclusion: { in: -2..2 }
  validates :user_id, uniqueness: { scope: :entry_id }
end
