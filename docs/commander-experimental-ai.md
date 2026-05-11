# Commander Experimental AI validation notes

The **Commander Experimental** difficulty routes AI teams through a persistent commander planner before falling back to the legacy AI. The top-level commander goal is always `DEFEAT_PLAYER`; the selected subgoal, plan, reservations, and world snapshot can be viewed in-game with `F9` while the experimental difficulty is active.

## Manual validation scenarios

1. **Baseline fallback smoke test**
   - Start a Player vs AI skirmish on Normal, Hard, and Expert.
   - Confirm behavior remains legacy-driven: units still build, research, and receive orders, with no commander overlay unless `Commander Experimental` is selected.

2. **Commander plan variety**
   - Start three `Commander Experimental` matches on the same map settings.
   - Open debug with `F9` and confirm games diverge by personality/seeded weighted selection: selected subgoals should vary among economy expansion, invasion assembly, SEAD, carrier hunting, and base rush depending on world state.

3. **Defense interruption**
   - Send player air or naval units toward the AI main base.
   - Confirm the commander changes or interrupts its active plan toward `DEFEND_BASE`, assigns AA/fighters/destroyers, and then later resumes another defeat-player subgoal.

4. **SEAD insertion**
   - Build or preserve visible SAM/SPAA coverage around player islands.
   - Confirm `BREAK_AIR_DEFENSE` or `RUSH_MAIN_BASE` plans can insert `sead` behavior before strike/invasion behavior when air defenses are observed.

5. **Transport recombination**
   - Destroy an AI transport or landing ship during an invasion attempt.
   - Confirm a subsequent planner tick can rebuild/replace transport capacity and retry invasion rather than permanently abandoning the goal.

6. **Reservation sanity**
   - With debug enabled, watch `Reservations` while multiple behaviors execute.
   - Confirm the same idle unit is not repeatedly assigned to conflicting plans in the same commander cycle, and reservations fall away when units die or complete orders.

7. **Spectator symmetry**
   - Start Spectator mode with `Commander Experimental`.
   - Confirm both teams can run the commander path and the debug overlay remains focused on the red AI state for readability.
