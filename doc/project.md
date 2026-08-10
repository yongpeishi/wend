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


