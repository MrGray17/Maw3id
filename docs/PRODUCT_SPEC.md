# Maw3id product specification

Maw3id is a real-time queue visibility and ticketing platform for Moroccan private medical cabinets.

The main problem is not only appointment booking. In many Moroccan cities, patients arrive very early and wait outside crowded cabinets without knowing whether another verified doctor nearby has a shorter queue. Maw3id makes clinic load visible, lets patients join the right queue, and gives doctors or secretaries a controlled dashboard to run the queue fairly.

## V1 outcome

V1 must prove one production-critical workflow:

1. a verified cabinet opens a queue session for a doctor;
2. patients can discover nearby doctors by specialty and current queue status;
3. a patient can reserve one active ticket in a queue without exceeding capacity;
4. doctor staff can call, finish, mark absent, pause, or close the queue;
5. patients see their position and estimated waiting time update in near real time;
6. every queue-changing action is attributable and auditable.

Video consultation is intentionally outside V1. It can be added later after the queue product is reliable and legal/privacy requirements are clearer.

## Users and roles

| Role | Purpose | Core permissions |
| --- | --- | --- |
| Patient | Finds doctors, joins queues, tracks ticket status | Manage own profile and own tickets |
| Doctor | Owns medical cabinet profile and queue policy | Manage own cabinet, schedules, queue sessions, tickets |
| Secretary | Operates the queue for a doctor | Call/finish/mark tickets for assigned cabinet only |
| Admin | Verifies doctors and monitors platform health | Verify cabinets, suspend unsafe accounts, inspect audit records |

## Core concepts

| Concept | Meaning |
| --- | --- |
| Cabinet | Verified physical practice location with address and map coordinates |
| Doctor | Medical professional attached to one or more cabinets |
| Queue session | A doctor/cabinet queue for a specific date and service window |
| Ticket | A patient's place in a queue session |
| Queue status | Derived public state shown on the map: available, moderate, busy, full, paused, closed, unknown |
| Audit event | Immutable record of who changed what and when |

## Queue session states

| State | Meaning | Patient can join? | Map status |
| --- | --- | --- | --- |
| draft | Created but not public | No | Closed |
| open | Accepting patients | Yes | Available, moderate, busy, or full |
| paused | Temporarily not accepting new tickets | No | Paused |
| closed | Ended for the day/session | No | Closed |
| cancelled | Cancelled by staff/admin | No | Closed |

## Ticket states

| State | Meaning |
| --- | --- |
| waiting | Patient is in queue |
| called | Staff called the patient |
| in_consultation | Patient is being seen |
| completed | Consultation completed |
| absent | Patient did not respond/appear |
| cancelled_by_patient | Patient cancelled |
| cancelled_by_staff | Staff cancelled |

Allowed state transitions must be enforced in the backend, not only the UI.

## Production invariants

These are non-negotiable correctness rules:

1. a patient cannot hold two active tickets for the same queue session;
2. a queue session cannot exceed its configured capacity;
3. ticket numbers inside a queue session are unique and monotonically increasing;
4. all ticket creation and queue movement operations are transactional;
5. every state change records actor, timestamp, old state, new state, and reason when relevant;
6. public map status is derived from queue/session data and freshness, not manually faked;
7. patient private data is never exposed in public doctor search or map responses;
8. doctors and secretaries can only operate queues they are assigned to;
9. location permission is optional; patients can search manually by city/neighborhood;
10. stale queue data becomes `unknown` or `closed`, never silently displayed as live.

## V1 public map statuses

| Status | Rule |
| --- | --- |
| available | Queue open and estimated wait is low |
| moderate | Queue open and estimated wait is acceptable |
| busy | Queue open and estimated wait is high |
| full | Queue open but capacity reached |
| paused | Staff paused new tickets |
| closed | Cabinet is not accepting patients for the selected session |
| unknown | Data is stale or the cabinet has not updated queue state recently |

Thresholds must be configurable per specialty later. V1 can start with platform defaults.

## Security baseline

V1 is not production-ready until it has:

1. secure multi-provider identity linking and revocable browser sessions;
2. role-based and resource-level authorization;
3. input validation at API boundaries;
4. rate limiting for auth and ticket creation;
5. audit logs for sensitive operations;
6. no secrets committed to the repository;
7. HTTPS-only deployment configuration;
8. database backups and migration discipline;
9. health checks and structured logs;
10. tests for the queue race conditions.

Google sign-in is optional, not the only login path. Patient phone verification, privileged-user MFA, secure account linking, and session rules are defined in `docs/AUTH_AND_SECURITY.md`.
