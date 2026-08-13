Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

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

    get "trips/:trip_id/schedule", to: "schedule_items#index"
    post "trips/:trip_id/schedule", to: "schedule_items#create"
    patch "schedule_items/:id", to: "schedule_items#update"
    delete "schedule_items/:id", to: "schedule_items#destroy"
    post "schedule_items/:id/ungroup", to: "schedule_items#ungroup"

    # Itinerary. `:day` is a date, not an id: until the first write there is no
    # trip_day row to address, so these routes create one on demand.
    get "trips/:trip_id/itinerary", to: "itineraries#index"
    patch "trips/:trip_id/days/:day", to: "trip_days#update", constraints: { day: /\d{4}-\d{2}-\d{2}/ }
    post "trips/:trip_id/days/:day/versions", to: "day_versions#create", constraints: { day: /\d{4}-\d{2}-\d{2}/ }

    post "day_versions/:id/keep", to: "day_versions#keep"
    post "day_versions/:id/restore", to: "day_versions#restore"
    delete "day_versions/:id", to: "day_versions#destroy"

    get "trips/:trip_id/nearby", to: "nearby#index"
  end
end
