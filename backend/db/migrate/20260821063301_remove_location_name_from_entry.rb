class RemoveLocationNameFromEntry < ActiveRecord::Migration[8.1]
  def change
    remove_column :entries, :location_name, :string
  end
end
