# Behavioral contract — version 1

Domain: one browser session holds an engineering discussion and proposed tasks.
Inputs are untrusted JSON and model responses. Units are UTF-16 code units for
text limits and bytes for HTTP limits. Invariants belong to the component below.

| ID  | Stable obligation                                                                                         | Owner / rung                      | Witness                   |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------- |
| I1  | Model output never accepts or completes a task                                                            | domain / R1 schema, R2 transition | approval tests            |
| I2  | Same committed request ID and text creates exactly one turn; different text refuses                       | domain / R2                       | retry/property tests      |
| I3  | Invalid input or failed inference leaves durable state unchanged                                          | Agent / R2                        | runtime failure tests     |
| I4  | Distinct session capabilities cannot address another session                                              | Worker / R2                       | runtime isolation tests   |
| I5  | A pending task may be accepted or dismissed; accepted may be completed; terminal decisions cannot reverse | domain / R2                       | transition/property tests |
| I6  | Concurrent mutations cannot overwrite committed state                                                     | Agent / R2                        | in-flight conflict test   |
| I7  | No hidden context truncation or unbounded session growth                                                  | domain + model / R2               | boundary tests            |
| I8  | Errors expose codes and safe messages, never raw model/provider details                                   | server / R2                       | failure tests             |

Limits: 24 turns, 3 proposals per turn, 1,500 user characters, 2,000 reply
characters, 100 title characters and 400 acceptance-criteria characters per
proposal. Each model call includes all prior turns and task decisions; the full
serialized prompt is limited to 18,000 UTF-8 bytes, conservatively below the
model's 24,000-token context even for byte-oriented tokenization. The next call
refuses before inference if the complete prompt exceeds this budget. The UI
explains session limits and offers a new session. Requests are limited to 12 KiB
(enough for worst-case JSON escaping of a 1,500-character prompt plus envelope).
Inference has a 45-second response deadline and at most 1,400 output tokens;
truncated or malformed output refuses, never produces a partial turn.

Every successful turn is one durable state replacement. Request IDs are UUIDs;
proposal IDs derive from request ID and index. Retries after a lost response do
not repeat a committed inference. Eviction during uncommitted inference may
repeat model cost but cannot duplicate a committed turn. Restart recovery reads
last committed state. No guarantee of exactly-once external inference is made.

Calibrated judgments: model advice, prompt wording, resource limits and task
quality. These are not formal laws. No external task is executed by this app.
Cookie possession is session authority, not an account identity. A new session
leaves the old record stored but inaccessible through the new cookie.
