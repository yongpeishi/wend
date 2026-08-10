module Api
  class TodosController < Api::BaseController
    before_action :set_todo, only: [:update, :destroy]

    # The unified checklist: GET /api/todos?trip_id=X returns both trip-level
    # todos and todos hanging off any entry that is inside the trip.
    def index
      scope = Todo.all
      scope = scope.where(trip_id: params[:trip_id]) if params[:trip_id].present?
      scope = scope.where(entry_id: params[:entry_id]) if params[:entry_id].present?
      scope = apply_done_filter(scope)

      todos = scope.to_a

      if params[:trip_id].present? && params[:entry_id].blank?
        entry_ids_in_trip = Entry.descendant_ids_of(params[:trip_id])
        extra = apply_done_filter(Todo.where(entry_id: entry_ids_in_trip))
        todos = (todos + extra.to_a).uniq(&:id)
      end

      todos.sort_by! { |t| [t.position, t.id] }

      render json: { todos: TodoSerializer.list(todos, with_entry: true) }
    end

    def create
      todo = Todo.new(todo_params)
      if todo.save
        render json: { todo: TodoSerializer.one(todo) }, status: :created
      else
        render json: { errors: todo.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def update
      if @todo.update(todo_params)
        render json: { todo: TodoSerializer.one(@todo) }
      else
        render json: { errors: @todo.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def destroy
      @todo.destroy
      head :no_content
    end

    private

    def set_todo
      @todo = Todo.find(params[:id])
    end

    def apply_done_filter(scope)
      return scope unless params[:done].present?

      ActiveModel::Type::Boolean.new.cast(params[:done]) ? scope.done : scope.open
    end

    def todo_params
      params.require(:todo).permit(:title, :entry_id, :trip_id, :done_at, :due_on, :position)
    end
  end
end
