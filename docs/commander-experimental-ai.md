# Commander Experimental AI validation notes

The **Commander Experimental** difficulty routes AI teams through a persistent commander planner before falling back to the legacy AI. The top-level commander goal is always `DEFEAT_PLAYER`; the selected subgoal, plan, reservations, and world snapshot can be viewed in-game with the tiny **AI** debug button while the experimental difficulty is active.

## Manual validation scenarios

1. **Baseline fallback smoke test**
   - Start a Player vs AI skirmish on Normal, Hard, and Expert.
   - Confirm behavior remains legacy-driven: units still build, research, and receive orders, with no commander overlay unless `Commander Experimental` is selected.

2. **Commander plan variety**
   - Start three `Commander Experimental` matches on the same map settings.
   - Open debug with the tiny **AI** debug button and confirm games diverge by personality/seeded weighted selection: selected subgoals should vary among economy expansion, invasion assembly, SEAD, carrier hunting, air superiority, economy disruption, naval screening, and base rush depending on world state.

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

8. **Carrier spawn guard**
   - Select a player carrier, then click ground-unit build buttons on maps where they are available.
   - Confirm ground units do not spawn on the carrier, while air and helicopter units can still use it as a spawner.

9. **Concurrent operation persistence**
   - Let the commander start a long-running objective such as `HUNT_CARRIER`, then pressure the AI base with aircraft.
   - Confirm debug shows multiple active goals over time and the prior carrier/naval operation resumes after the defense response instead of being forgotten.

10. **Team loadout isolation**
   - Change a player loadout, then let the AI research/auto-optimize or run Commander Experimental.
   - Confirm AI loadout changes do not alter the player's configured template, and player loadout changes do not alter AI templates.
