# Decentralized Evacuation Simulator

Browser-native TypeScript sandbox for population-protocol evacuation behavior.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## ASCII Floorplans

The default plan is `public/floorplans/default.txt` and is also editable in the
right-side panel at runtime.

Characters:

- `#` wall or blocked boundary
- `1`..`9`, `A`..`Z` room floor cells
- `D` door/opening cell; agents bounce off it until they commit to leaving
- space blocked void/outside the floorplan
- lines beginning with `# ` are comments

Agents are not encoded in the map. They always spawn randomly inside room `1`,
using the current agent-count control.

Committed agents teleport across their chosen door into the adjacent destination
room cell. On transition they reset to `vote = 0`, `timer = 0`, and `wandering`.

Example:

```text
#########
#111D222#
#111#222#
#########
```

Rooms do not store decision state. Room ids are used only for geometry,
diagnostics, spawning, door connectivity, and keeping local interactions inside
the room an agent is currently influencing.
