# Project Overview
A travel planning app from day 0 brainstorm to hourly schedule on the road.

## High level usecases

The app supports the following usecases (non-exhaustive list):

* In Japan, mom wants to visit Daiso. There is many Daiso in japan, which ever one works with the schedule. The app should allow entering of different Daiso locations as idea, which can be form into bundle.
* Collection mode: I saw something cool on insta and want to save the idea for inspiration. 
* New trip based on inspiration: I have leaves accumulated but don't know where to go. I look at the app and saw there's many ideas saved for japan, I create a new trip with that as a starting point.
* When planning, I want a hour by hour plan so I know I can fit everything.
* I have a bundle of things to do in Japan, I want to bundle into outings to make actual scheduling into itinerary easier.
* The app provide a view of the plan, but allow flexibility when executing. For example, the plan might indicate 5 options for day 1 dinner, i choose which one to go on the day. Or when I have extra free time in an area, i want to see ideas that is outside the schedule but is near by. 
* I want checklist on Entry to indicate to do (eg: make booking, check opening time). I want a unified checklist view that includes Entry in the itinerary.
* I want maps that show Entry.
* I want to be able to reuse my research.
* I want a score base voting system on the Entry (-2 to +2).

## Core user flow

1. New trip -> Plan ideas
    1. Brainstorm where to go
      * Compare trip options: brief description, pros cons
      * From here, the decision enters the 2nd layer of planning.

    2. 2nd layer (active planning): All the interested things
      * Entering all the ideas for this trip
      * Each entry can have “desire rating”. This feature should support multi users voting.
      * Each entry can have linked todos (eg: make booking)  
      * Ability to filter ideas by location  
      * Assign/Remove ideas into bundle.
      * Transportation info is an Entry between two other Entry
      * Map view - filter by “scheduled” vs. “potential”

    3. Finally (getting ready for the trip)
      * Calendar view: this is hourly breakdown  
      * Overall todo list view for reminder of things to check off to be ready for the trip. There can be todo that is not tie to a particular idea (eg: apply for visa)

2. Ideas -> Trip
  * Use existing ideas as the starting point when create a new trip. Example: A way to see all ideas on the map on a page, zoom in on a cluster of ideas, create a new trip by selecting all or some of these ideas.
  * Combine a trip into another trip.


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

# Tech stack

Rails backend api, enable type check.
React frontend.

