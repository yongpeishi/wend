class Vote < ApplicationRecord
  include Governed

  belongs_to :entry
  belongs_to :user

  validates :score, presence: true, inclusion: { in: -2..2 }
  validates :user_id, uniqueness: { scope: :entry_id }

  def governing_entry_ids
    [ entry_id ]
  end
end
