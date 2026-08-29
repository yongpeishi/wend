Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Calendar clients cannot carry Wend's session cookie, so this deliberately
  # lives outside /api and authenticates with the user's derived feed token.
  get "users/:id/ical", to: "user_calendars#show"

  namespace :api do
    resource :session, only: [:create, :destroy], controller: "sessions"
    get "me", to: "sessions#me"
    resources :users, only: [:create]

    resources :entries, only: [:index, :create, :show, :update, :destroy] do
      member do
        post :restore
        get :tree
        post :lift
        post :absorb
        post :fork
      end
    end

    post "entries/:entry_id/links", to: "entry_links#create"
    post "entries/:entry_id/links/reorder", to: "entry_links#reorder"
    patch "entries/:entry_id/links/:child_id", to: "entry_links#update"
    delete "entries/:entry_id/links/:child_id", to: "entry_links#destroy"

    put "entries/:entry_id/vote", to: "votes#update"
    delete "entries/:entry_id/vote", to: "votes#destroy"

    resources :todos, only: [:index, :create, :update, :destroy]

    resources :feedbacks, only: [:index, :create]

    namespace :admin do
      resources :feedbacks, only: [:index, :update] do
        collection { get :export }
      end
    end

    get "trips/:trip_id/schedule", to: "schedule_items#index"
    post "trips/:trip_id/schedule", to: "schedule_items#create"
    patch "schedule_items/:id", to: "schedule_items#update"
    delete "schedule_items/:id", to: "schedule_items#destroy"

    # Itinerary. `:day` is a date, not an id: until the first write there is no
    # trip_day row to address, so these routes create one on demand.
    get "trips/:trip_id/itinerary", to: "itineraries#index"
    # Exchange two dates of the trip; both arrive in the body, not the path,
    # because neither is the thing being addressed.
    post "trips/:trip_id/itinerary/swap_days", to: "itineraries#swap_days"
    patch "trips/:trip_id/days/:day", to: "trip_days#update", constraints: { day: /\d{4}-\d{2}-\d{2}/ }
    post "trips/:trip_id/days/:day/versions", to: "day_versions#create", constraints: { day: /\d{4}-\d{2}-\d{2}/ }

    post "day_versions/:id/keep", to: "day_versions#keep"
    post "day_versions/:id/restore", to: "day_versions#restore"
    delete "day_versions/:id", to: "day_versions#destroy"

    get "trips/:trip_id/nearby", to: "nearby#index"

    # Who is on a trip. Keyed by user_id rather than membership id: the client knows
    # who it is looking at, never which row says so. hand_over is a verb endpoint for
    # the same reason lift/absorb/fork are -- it is one act, not an edit to a field.
    get "trips/:trip_id/collaborators", to: "collaborators#index"
    post "trips/:trip_id/collaborators", to: "collaborators#create"
    patch "trips/:trip_id/collaborators/:user_id", to: "collaborators#update"
    delete "trips/:trip_id/collaborators/:user_id", to: "collaborators#destroy"
    post "trips/:trip_id/collaborators/:user_id/hand_over", to: "collaborators#hand_over"
  end
end
