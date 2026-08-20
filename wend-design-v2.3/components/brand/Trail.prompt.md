A dotted trail of stops showing progress through a sequence of steps. Stop count is not fixed — pass as many as the flow needs. Never pair it with a second progress indicator.

```jsx
<Trail stops={['decided', 'open', 'waiting']} labels={['Explore', 'Shortlist', 'Day plan']} />
```

Selecting a completed stop returns to that step with everything the traveller kept. Nothing is ever struck through or deleted.
