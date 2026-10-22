# Tank Trouble 2 / Bomb It 2 server authority reconstruction

These modules are native TypeScript simulations. The server owns movement, collision, attacks, ammunition, deaths, respawns, timers and final results; clients draw snapshots. They do not run Flash, accept client positions, spawn bots or treat imported Flash code as trusted executable code. `Input.attack` and `Input.alt` are monotonic counters, with `consumeInput` handling expired transport commands. Both adapters use seeded xorshift RNG and have no DOM dependencies outside `render`.

## Source identities and retained evidence

All source SWFs remain unchanged. FFDec 26.4.0 exports and P-code are retained locally under `artifacts/swf-analysis/<id>/`. The exports are ordinary FFDec static observations; no REA Evidence IDs or runtime behavior are claimed. REA tools were absent from this agent session, and the existing portable FFDec was used for SWF-specific analysis. No unrelated tools were installed.

| Artifact | SHA-256 | Evidence location |
| --- | --- | --- |
| `games/137953/game.swf` | `8df6a2f9f19dc5f37abe3a7fef682ae0549481c54cbad99572cde969862e81cf` | `137953/scripts`, `pcode`, `source.xml`, `tags.txt` |
| `games/9109/game.swf` | `788c15ad1661e576cd004688785175ef62c2e0ef211db0fe83b5475625262ae1` | `9109/scripts`, `pcode`, `source.xml`, `tags.txt` |
| Tank Trouble v40 recovered main payload | `beb18e24794449acf1b94d2edec1afc9f9de21e360376440ad45704e75df1c50` | `137953/source-game.swf`, `game/scripts`, `game-pcode`, `game.xml`, `game-tags.txt` |
| Bomb It 2 embedded main payload | See `public/expanded/assets/bomb2/manifest.json` | `9109/embedded.swf`, `embedded/scripts`, `embedded-pcode`, `embedded.xml`, `embedded-tags.txt` |

Tank recovery was required because the local SWF is a 4399 shell. `L4399Main_gamefile` embeds a 1,913-byte second shell whose `shell_fla/MainTimeline.reset` loads relative `TankTroublev40.swf`. The original [4399 page](https://www.4399.com/flash/137953.htm) declares `/upload_swf/ftp14/cwb/20140611/y2/jifen3.htm`. That page loads `main.swf`; its directory provides the matching main payload at [the recovered URL](https://sda.4399.com/4399swf/upload_swf/ftp14/cwb/20140611/y2/TankTroublev40.swf). The exact fetched bytes, pages and hashes are retained in `137953/network-recovery.json`.

Four explicit main-SWF imports reference `Assets/Tank.swf`, `Assets/GameTank.swf`, `Assets/Crate.swf`, and `Assets/Laika.swf`. All those URLs and case/parent alternatives returned the same 23,832-byte unrelated 4399 fallback (`7ae5fab9d7c370babffa840557c4566a4d5cc8d89e4bdd6cc80f524eb52b1719`); official host alternatives returned 403/timeout. This is established by inspecting the fallback's `Main.as` and identical hashes, rather than treating HTTP 200 as success. They are retained as failed acquisition evidence in `imports-*-recovery.json`, not shipped as tank artwork. The tank hull and crate outline are reconstructed canvas drawings. Original main-file bitmap/vector art, weapon effects, audio and text are preserved.

Bomb It 2's outer `Ad_newgames.as` directly loads `Ad_newgames_AdSWF`; the original `1_Ad_newgames_AdSWF.bin` is the genuine embedded game. Both layers have full script/P-code/XML exports. Unlike Bomb It 1, this game has AS3 source, a 17×15 grid, a 40 Hz game engine, six themes and eighteen individually authored layouts.

## Observed rules and implemented behavior

| Game | Static source evidence | Implemented result |
| --- | --- | --- |
| Tank player capacity | `game/scripts/frame_31/DoAction.as:51`, `frame_43/DoAction.as:55` set `TANKS=3`; `frame_53/setupBattle` has 2/3-player branches | Three actual human seats, with sparse occupied seats retained |
| Tank maze | `frame_53/createMaze` generates an `(xsize+1)×(ysize+1)` `random(4)` grid, then horizontal/vertical edges; `setupStandardMaze` selects width 4–12, height 4–10 and reachable spawn cells | Seeded port of original edge construction and reachable component spawning; compact/large options choose fixed sizes using the same rule |
| Tank projectiles | `frame_53` constants and `DefineSprite_212_bullet/frame_1` show speed 4.5, lifetime 250, seven collision substeps, self damage and bounce; `frame_1` limits live ordinary bullets to five | Server ricochets, five-shot cap, self/opponent kills, idempotent fire, original bullet lifetime |
| Tank specials | `frame_1/settingsActiveWeapons`, `frame_53/fire*`: laser, fragment, gatling, homing, death ray, mine, remote; fragment count 40, gatling 20, homing startup 50, death ray warmup 15, lifetime 30 | All seven pickups have server logic: ricochet laser, remotely detonated fragments, gatling burst, homing startup, charged penetrating death ray, armed mine, steering remote missile |
| Tank result | `frame_53/NUMBEROFFRAMESBEFOREEND=125` | Surviving shots remain active during 125-frame result delay, allowing mutual destruction; score awarded once, immutable finished state; 180-second online time cap prevents abandoned indefinite rounds |
| Bomb2 grid/timing | `actionSprite/Map.as:init` = 17×15; `Game.as:dataInit` = 40 Hz, 30px cells, spawns `(1,1),(15,1),(1,13),(15,13)`; `Bomb.as` = 60-frame fuse plus counting boundary and 16-frame explosion effect | Distinct 17×15/40 Hz simulation, four occupied human character seats, 62-tick fuse, ray blasts blocked by fixed objects and terminated by destructible crates, chaining |
| Bomb2 themes/layouts | `actionSprite/mapData/{Mine,Beach,Snow,Disce,Factory,Center}MapData.as` has three `set*` methods each; `MapMaster.creatRow` combines empty/fixed/unfixed probabilities | All eighteen methods imported into generated `bomb2-maps.ts`, including probability values, special frames, center blocked cells and landmark visual |
| Bomb2 modes | `Game.as:init` selects `arcade`, `kill`, `collect`, `color`, goals 10/10/50; `killGameEnd` respawns non-arcade characters; `Player.killSelfHandle` subtracts kill score | Survival with three lives; endless respawn in goal modes; kill score 10, coins 10, owned cells 50; suicide penalty; timer ranking and ties |
| Bomb2 pickups | `mapPropInit`, each `*Prop.setNum` identifies source sprite frame | Capacity/range/speed/life, kick, shield, timed invincibility, weapons (hammer, launcher, remote, mine, shotgun, laser, thrower), vehicles, coins |
| Bomb2 map mechanics | `QuickSand.robotTransfer`, `SpringBoard.robotJump`, `Transmittal.robotTrans`, `IceFace.setResistance`, `Rail.railArr`, `Tramcar`, `TurnTable` | Source-paired beach portals; two-cell disco jumps; factory conveyor movement; ice sliding; mine tram follows original rail order and blocks cells; city turntable drops two pickups per 23-second cycle |

Online adaptations and precision limits are explicit: the original Bomb2 two human + up to two AI arrangement becomes four human seats; survival is free-for-all. Cardinal movement is expressed as deterministic interpolated cell transitions rather than reproducing Flash's continuous resistance solver. Weapon animation and projectile physics use the documented gameplay behavior and source constants with simplified collision geometry; vehicle shields and timers are standardized for online play. Bomb2 crate cosmetics currently choose three destructible variants rather than reproducing the original difficulty-dependent five-frame distribution; every original frame remains exported. Tank's unavailable `GameTank` import prevents source confirmation of its exact hull collision polygon and forward/turn speeds; the implementation uses 10px hull radius, 2px forward, 1.4px reverse and 0.085rad turn per server tick. These are reconstruction choices, not claims of byte-for-byte original physics. Sound files are preserved; current adapter rendering does not schedule audio playback.

## Art import and verification

`scripts/import-expanded-bomb2.py` imports all exported original images, vector shapes, morph shapes, sounds, text and symbol mapping, six backgrounds, sixty brick frames with authored registration offsets, four characters in four animated directions, vehicles, projectiles, props, rails and map mechanisms. `scripts/import-bomb2-kill.py` adds 18 original kill-mode timelines from retained `kill-preview` exports, with stable union bounds and frame metadata. Run it after the general importer. `scripts/import-expanded-tank.py` imports all available main-file bitmap/vector/effect/audio/text resources. Per-file hashes and provenance are in the two public asset manifests; current counts are 3,850 Bomb2 assets and 270 Tank assets.

The local importers are reproducible after FFDec exports. Example commands (repository root, paths quoted if needed):

```powershell
java -jar artifacts/tools/ffdec/ffdec.jar -export script,image,shape,morphshape,sound,text,binaryData,symbolClass artifacts/swf-analysis/9109/embedded artifacts/swf-analysis/9109/embedded.swf
java -jar artifacts/tools/ffdec/ffdec.jar -format script:pcodehex -export script artifacts/swf-analysis/9109/embedded-pcode artifacts/swf-analysis/9109/embedded.swf
java -jar artifacts/tools/ffdec/ffdec.jar -ignorebackground -selectid 4086,3669,3671,3684,3687,3690,3693,2936,2958,3947,3030,3032,3044,3046,3168,3177,3185,3194,3253,3259,3266,3272,3334,3347,3355,3365,638,392,351,339,3453,3436 -export sprite artifacts/swf-analysis/9109/runtime-preview artifacts/swf-analysis/9109/embedded.swf
python scripts/import-expanded-bomb2.py
python scripts/import-expanded-tank.py
node --test tests/expanded-tank.test.cjs tests/expanded-bomb2.test.cjs
```

Additional vehicle sprite IDs are read from `embedded/symbolClass/symbols.csv` (`_rN_{Car,Bulldozer,Frog}_{Left,Up,Right,Down}`); all are exported in the retained runtime preview. Both importers require existing Pillow/Java and do not acquire software or mutate raw SWFs.

Validation: seventeen focused Node tests pass, covering seeded replay, capacity, attack and special retransmission, expired-input consumption, collision/bounce/self kill, all tank weapon families, Bomb2 chain blasts/crate shielding/killer credit, life and respawn, remote detonation, all mode goals, portals/springs/tram, time-limit completion, clean fresh-round state and malformed snapshots. Both adapters pass strict standalone TypeScript checking. A headless Chromium probe rendered Tank and every Bomb2 theme; `artifacts/expanded-tests/*-*.png` retains screenshots. It reported no script errors or missing gameplay assets (only an irrelevant favicon request). Broader room/network/reconnect integration belongs to the shared authority client/registry tests.

## Kill-mode completion, 2026-10-21

Four independent modes combine with all 18 layouts (72 choices). Controller-only options validate mode and map atomically and persist across automatic rematches. `Game.as` sets the kill target to 10, warning at 8 and time limit to 180 seconds. `Player.as`/`BaseWeapon.as` restore the effectively infinite base hammer; kill mode starts without rockets or ordinary bomb attacks. `Game.mapPropInit` gives the weighted pool `[16,16,21,21,21,20,20,20,19,19,19,17,17,18,18,7]`, with no vehicle/stat-upgrade drops.

| Source classes/timelines | Implemented rule |
| --- | --- |
| `SinkerProp`, `BaseWeapon`, four 25-frame sinker timelines | Base hammer repeats indefinitely; pickup hammer has 2 uses, hits same/adjacent cell enemy and adjacent crate/bomb at animation end |
| `LauncherProp`, four 14-frame timelines | 2 uses, 14 tick startup, 10px/tick rocket with cross blast |
| `ShotgunProp`, four 8-frame timelines | 2 uses, 8 tick startup, one straight 12px/tick bullet as in source |
| `LaserGunProp`, 12-frame `lasergun_Play`, `Laser.lasterEnd` | 2 uses, 12 tick startup + 11 active ticks; beam created once and stops at first fixed wall, crate or bomb |
| `ThrowerProp`, nested 24-frame `fire_Play` | 2 uses, 24 tick action, directional flame up to three cells, no thrown bomb, caster excluded from direct flame damage |
| `TelecontrolProp`, `MineProp`, `MineBomb.startDetonate`/`blast` | 1 use each; unsuccessful placement preserves ammo. Remote detonation after exhaustion; mine waits for owner departure then senses all players, plus four diagonal blast cells |
| Four 64-frame death timelines, `AbstractRobot.init`, `containerMove` | Death resets inventory/stats, drops at most 2 collected weapons with restored ammo, 64 tick respawn and 80 tick spawn protection; scores survive |

Killed/dead-period inputs are consumed instead of firing on recovery. Enemy death adds one point/kill; self-death subtracts one point down to zero and adds no kill. First to 10 wins; timeout compares points. Equal simultaneous winning scores and timeout ties produce a draw (explicit online fairness choice). All scoring/respawn/rematch and lifetime record totals run on the server.

Online reconstruction choices remain: cell collision/interpolation and rocket/beam hit geometry, flame growth in eight-tick stages, 8 tick trap-placement debounce, immediate weapon drops at death rather than after the animation, standardized vehicle timers, and approximate hand/feet placement of original timelines. Mine diagonal fire respects fixed walls. Laser world destruction is applied once when its beam appears. Original sounds are retained but adapter audio playback is unfinished. Other modes' coin drop/ownership and advanced original detail are still pending; this release does not claim complete original-game parity.

Verification: `npm run test:expanded` 84/84, `npm run test:authority` 34/34 and strict typecheck pass. `tests/expanded-bomb2-kill.test.cjs` includes ten real server attacks with natural respawn/protection, one settlement, persistent records and rematch options. `npm run test:expanded:kill:e2e` uses four real Chrome contexts and Space inputs for ten kills with nine natural respawns, settlement and rematch, plus snapshot recovery and original animation loading. A child-process IPC fixture sets deterministic arena positions only; it never writes scores/damage/timers and adds no production debug endpoint. Evidence: `artifacts/expanded-kill-e2e/results.json` and screenshots. Public room verification and release identity belong to `DEPLOYMENT_STATUS.md`.
