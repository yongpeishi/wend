# Who may see and touch a trip. A "trip" is an Entry with kind: "trip", so
# trip_id is an entries FK -- same shape as todos.trip_id. This table is the
# single authority on trip access: there is no created_by fallback for trips.
class TripMembership < ApplicationRecord
  ROLES = %w[owner member viewer].freeze
  RANK  = { "viewer" => 1, "member" => 2, "owner" => 3 }.freeze

  belongs_to :trip, class_name: "Entry"
  belongs_to :user

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :trip_id }
  validate  :trip_must_be_a_trip

  scope :owners, -> { where(role: "owner") }

  # A trip with no owner is invisible to everyone (see Entry::VISIBLE_IDS_SQL, which
  # excludes kind:"trip" from the created_by branch) and nothing here is ever
  # hard-deleted, so it would linger forever with nobody able to reach it. Refuse
  # rather than clean up after the fact.
  before_destroy :refuse_last_owner

  private

  def trip_must_be_a_trip
    errors.add(:trip, "must be a trip") unless trip&.trip?
  end

  def refuse_last_owner
    return unless role == "owner"

    throw :abort if self.class.owners.where(trip_id: trip_id).where.not(id: id).none?
  end
end
