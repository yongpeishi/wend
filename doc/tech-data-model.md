# Tech stack

- Rails backend api, enable type check.
- React frontend.

# Core data model

The core data model is "Entry"

A new trip starts out as an entry with name and description, optional dates.

In a trip, user can create idea. An idea is an "Entry". An idea can be one of the following category: 'place', 'food', 'activity', 'lodging', 'transport', 'other'. An idea can have a location.

Entry has a M:M self-referencing relationship.

## Example
I have a trip to Malaysia, but i not yet know how many days the trip would be. I would enter Malaysia as a new trip.

In the trip planning, I'm considering Penang, Melaka, and/or Bali as an idea. I'll add ideas (activity, food, etc) to each location idea as I come across things. 

Sometimes it make sense to introduce another layer in between, eg: Bali > Ubud/Seminyak/Cangga > things to do in each. 

I should be able to drag and drop ideas to form a bundle. A bundle represent a bucket of ideas that goes together, for example a half day outings or a draft multi days itinerary. An idea can be in many bundle, eg: Disneyland is across many days, but each day we might choose different dinner option. This concept also help with visualise and compare different bundle combo.

I can lift an idea out of a trip. Example: When i decide not to include Bali or Penang in this trip, I can move each one out as a new trip idea for future.

I can include a trip idea into another trip. Example, I have a singapore trip drafted last time, I can move to combine it into the malaysia trip this time.
