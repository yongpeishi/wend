module Api
  class TodosController < Api::BaseController
    before_action :set_todo, only: [:update, :destroy]

    # The unified checklist: GET /api/todos?trip_id=X returns both trip-level
    # todos and todos hanging off any entry that is inside the trip.
    def index
      scope = policy_scope(Todo)
      scope = scope.where(trip_id: params[:trip_id]) if params[:trip_id].present?
      scope = scope.where(entry_id: params[:entry_id]) if params[:entry_id].present?
      scope = apply_done_filter(scope)

      todos = scope.to_a

      if params[:trip_id].present? && params[:entry_id].blank?
        entry_ids_in_trip = Entry.descendant_ids_of(params[:trip_id])
        extra = apply_done_filter(policy_scope(Todo).where(entry_id: entry_ids_in_trip))
        todos = (todos + extra.to_a).uniq(&:id)
      end

      todos.sort_by! { |t| [t.position, t.id] }

      render json: { todos: TodoSerializer.list(todos, with_entry: true) }
    end

    def create
      todo = Todo.new(todo_params)
      # Built with its foreign keys already set, so governing_entry_ids resolves to
      # the trip and entry it will hang off rather than to nothing.
      authorize todo
      todo.save!
      render json: { todo: TodoSerializer.one(todo) }, status: :created
    end

    def update
      # trip_id and entry_id are writable here, so an update can move a todo into a
      # trip the caller cannot reach. set_todo checked where it is now; this checks
      # where it is being sent. Naming the policy class is what makes it a second
      # check rather than a repeat of the first: Pundit caches one policy per record,
      # and that cached one resolved its role before these attributes changed.
      @todo.assign_attributes(todo_params)
      authorize @todo, :update?, policy_class: TodoPolicy

      @todo.save!
      render json: { todo: TodoSerializer.one(@todo) }
    end

    def destroy
      @todo.destroy
      head :no_content
    end

    private

    # destroy here is the one true hard-delete in the app, so this find has to be
    # scoped rather than merely authorized afterwards.
    def set_todo
      @todo = policy_scope(Todo).find(params[:id])
      authorize @todo
    end

    def apply_done_filter(scope)
      return scope unless params[:done].present?

      truthy?(params[:done]) ? scope.done : scope.open
    end

    def todo_params
      params.require(:todo).permit(:title, :entry_id, :trip_id, :done_at, :due_on, :position)
    end
  end
end
