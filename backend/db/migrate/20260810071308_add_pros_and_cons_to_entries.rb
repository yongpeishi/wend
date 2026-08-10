# Qualitative "reasons for and against", a sibling of the numeric Vote. Lives on
# every kind (trip/idea/bundle), so it belongs on entries rather than in a join
# table -- the list is always read and written whole, never queried across rows.
# Each element is {"id" => String, "text" => String}; the id is client-supplied.
class AddProsAndConsToEntries < ActiveRecord::Migration[8.1]
  def change
    add_column :entries, :pros, :json, default: [], null: false
    add_column :entries, :cons, :json, default: [], null: false
  end
end
