---
published: false
layout: post
title: "EventStore: From Log to State, and Into Production"
image: /images/eventstore/logo-small.png
date: 2026-10-13 00:03:00 +0200
tags: [eventstore]
theme: events
summary: "Fold the log into state, then run it in production."
---

<img class="title" src="{{ site.baseurl }}/images/eventstore/logo-small.png"/>
In the [first post]({{ site.baseurl }}/EventStore-Introducing/) we built a single ordered log, and in the [second]({{ site.baseurl }}/EventStore-Reading/) we read it every way we could. Sooner or later, though, somebody asks a question about *all* the messages at once. ACME's sales team wants a dashboard showing, for every customer, how many orders they placed, how many they cancelled and how much they actually spent (Wile E. Coyote is, unsurprisingly, top of the chart). Nobody stores that number; it is *derived* from the log. In this final post we will build a projection that folds the log into exactly that state, crash it with `kill -9` and check it lands on the right numbers, serve it to every dashboard that asks, and then cover what it takes to run the whole thing in production.

> For a complete listing of all code samples and to clone the project, visit the [GitHub repository](https://github.com/fifteen02/eventstore/tree/main/samples/07-projection).

# A Fold Is a Tally Sheet
Think of a bank statement. Nobody stores your balance as a fact of nature; the bank starts from zero, goes through every transaction in order, and keeps a running total. That is a **fold**: a starting state, plus a step that takes "the state so far and the next event" and returns "the new state". Our projection keeps one row per customer, and the step is three small rules:

```java
switch (type) {
    case "OrderPlaced" -> {
        long total = body.path("total").asLong();
        openOrders.put(orderId, new OpenOrder(customer, total));
        s = new Stats(s.placed() + 1, s.shipped(), s.cancelled(), s.spent() + total);
    }
    case "OrderShipped" -> s = new Stats(s.placed(), s.shipped() + 1, s.cancelled(), s.spent());
    case "OrderCancelled" -> {
        // Order-sensitive: a cancellation refunds a total we learned from an earlier event.
        OpenOrder order = openOrders.remove(orderId);
        long refund = order == null ? 0 : order.total();
        s = new Stats(s.placed(), s.shipped(), s.cancelled() + 1, s.spent() - refund);
    }
    default -> { return null; }
}
```

Look closely, because those rules come in two flavours. Counting orders does not care about order: three rockets are three rockets in any sequence. The cancellation rule does: it refunds a total it learned from an *earlier* `OrderPlaced`, so feed it the cancellation first and the refund is zero. Most interesting business logic looks like this, and this is where the single index from the first post pays for itself. EventStore's log has one order, the same for every reader and every replay, so an order-sensitive fold lands on the same state every single time. Over a partitioned log you would first have to agree how to interleave the partitions, forever.

# Snapshots: Don't Re-Read the Whole Statement
Folding the whole log works, but after a crash you would start again from index 1, and with a few million messages that is a long coffee break :coffee:. The fix is the one your bank uses: a monthly statement with a closing balance. A **snapshot** is the pair *(index, state)*, "this is the state after folding events 1 to index", and the important word is *pair*: index and state are saved together, atomically, or they will eventually disagree:

```java
void save(Path file) throws Exception {
    ObjectNode snapshot = JSON.createObjectNode();
    snapshot.put("index", index);
    snapshot.set("customers", JSON.valueToTree(customers));
    snapshot.set("openOrders", JSON.valueToTree(openOrders));
    Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
    Files.writeString(tmp, JSON.writeValueAsString(snapshot));
    Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
}
```

On restart the projection loads the snapshot and asks EventStore for `startIndex = index + 1`, so it folds only what happened since, and as a belt-and-braces measure the fold ignores anything at or below its own index. Save the state without the index and you do not know where to resume; save them separately and a crash in between leaves them disagreeing; both mean double counting or skipping. How often to snapshot is the `ack.batch` question from the last post wearing a different hat: often means fast recovery and lots of writes, rarely means the opposite.

Let's give the projection some history and start it:

```bash
CUSTOMERS=4 samples/bin/publish-orders.sh 12
mvn -q -f samples/07-projection compile exec:java
```

```text
projection: loaded snapshot at index 0 from …/projection.snapshot.json
projection: connected from 1, log is at 29
projection: snapshot at index 20
projection: caught up at index 29 (4 alerts suppressed during catch-up)
projection: snapshot at index 29
```

Line by line: no snapshot yet, so we start at 1; the log ends at 29, which is our "caught up" target; we snapshot after 20 events as configured; at 29 we have caught up, holding back 4 alerts (more on those in a moment), and snapshot again. A quick sanity check by hand: `customer-0` placed orders 4, 8 and 12 at 40, 80 and 120, and order 12 was cancelled, which leaves 120 spent, exactly what `GET /state` reports.

## The Crash Test
Talk is cheap, so let's break it. I published 150 more orders and killed the projection with `kill -9` halfway through: no shutdown hooks, no last-minute snapshot. Then I started it again:

<img class="center" style="width: 720px" alt="Snapshots at 29, 69 and 109; a kill -9 after 109; the restart loads 109 and folds 110 to 411" src="{{ site.baseurl }}/images/eventstore/es-snapshots.png"/>

```text
projection: loaded snapshot at index 109 from …/projection.snapshot.json
projection: connected from 110, log is at 411
…
projection: caught up at index 411 (8 alerts suppressed during catch-up)
```

To check the result, I ran a second instance with no snapshot at all, folding the entire log from index 1, and compared the two:

```text
resumed:    index 411 {'placed': 176, 'shipped': 176, 'cancelled': 58, 'spent': 75990}
recomputed: index 411 {'placed': 176, 'shipped': 176, 'cancelled': 58, 'spent': 75990}
identical customers: True
```

Same totals, every customer identical. No double counting, nothing skipped.

## Holding Your Fire, and Its Catch
The projection raises an alert when a customer becomes a VIP, that is, when their spend crosses 100. During catch-up it is replaying the past, and an alert about last month is noise, so it keeps quiet until it has caught up; after that, alerts fire as they should:

```text
projection: ALERT customer-1 is now a VIP (spent 150)
projection: ALERT customer-4 is now a VIP (spent 140)
```

Now look again at the crash test: *8 alerts suppressed during catch-up*. Those were customers who crossed 100 while the projection was dead, so on restart they are "the past" and nobody is ever told. Holding your fire is the right default, but it is not free. If every crossing must produce exactly one alert, either make "alerted" part of the snapshot and send the missing ones once caught up, or give alerts their own consumer with its own bookmark (a replayable interface from the last post).

## Fold Once, Serve Many
Who should run this fold? There are two shapes:

<img class="center" style="width: 720px" alt="Every client folding for itself versus one projection service folding once and serving views" src="{{ site.baseurl }}/images/eventstore/es-fold.png"/>

**Every client folds for itself**: the dashboard streams from EventStore, folds in the browser and keeps its bookmark in `localStorage`. No service to deploy, perfect for one team and one view. But every new tab replays history, and when five teams build five dashboards on the same numbers, the same fold runs five times in five codebases that slowly drift apart.

**One service folds for everyone**: that is the sample. The projection does the folding once, and its clients never replay anything; on connect they get the **current state**, then one update per change:

```text
event:snapshot
data:{"index":29,"customers":{…},"totals":{"placed":12,"shipped":12,"cancelled":4,"spent":480},"caughtUp":true}

event:update
data:{"index":30,"customer":"customer-1","stats":{"placed":4,"shipped":3,"cancelled":1,"spent":70},"totals":{…,"spent":490}}
```

There is no bookmark on this side: a dashboard that reconnects simply gets a fresh snapshot, and the `caughtUp` flag lets it say "still loading history" instead of presenting half the picture as the truth. Notice `totals`, too: it is not folded from events at all but added up from the per-customer rows, so coarser views come for free when the rule is "add things up". Start with every client folding for itself, because it is the cheapest thing that works, and move the fold into a service when a view is shared, when catching up takes long enough that people notice, or when the logic matters enough to live in exactly one place. The price is simple: you now own a service.

# Into Production
Running EventStore well is mostly a matter of respecting the single writer from the first post: one instance per database and `Recreate` deployments. The rest is hygiene.

**Watch the lag.** Every 30 seconds EventStore compares each acknowledged interface's bookmark with the newest index and logs an error when the gap exceeds `max(ack.lag-alert-min-messages, ceil(ack.batch × ack.lag-alert-batch-ratio))`, which is 1,500 messages with the defaults. A real one, from an interface with `batch: 5`:

```text
ERROR c.f.e.monitor.InterfaceLagMonitor - [INTERFACE_BEHIND] Interface 'billing' is behind: lag=19501 messages (current=19501, lastAck=0, threshold=8, batch=5, ratio=1.5)
```

Alert on `[INTERFACE_BEHIND]`, with two caveats: the first check runs the moment EventStore starts, so an interface still catching up raises one alert before it has had a chance (that one caught up three seconds later), and a healthy interface can sit up to `batch - 1` behind. A steady stream of `Waiting for missing index` warnings is the other signal worth an alert: a consumer is dropping messages without acknowledging them. And as we saw last time, put "restart EventStore" in your broker-outage runbook until the interface restart fix ships.

**Archive the old stuff.** By default every message stays in PostgreSQL forever. For large logs EventStore can archive to Google BigQuery and trim PostgreSQL, built from the same push machinery as billing: a `persister` interface named `google-big-query`, an archiver service of yours that writes each message to BigQuery and acknowledges it, and a retention job. The retention job is cautious by design:

<img class="center" style="width: 680px" alt="The BigQuery archive covers 1 to 9,000; PostgreSQL rows 5,001 to 7,000 are trimmed because the archive covers them" src="{{ site.baseurl }}/images/eventstore/es-archive.png"/>

It deletes PostgreSQL rows older than the cutoff **only if the archive covers that entire range**; if the archiver is behind or has a gap, it logs a warning and deletes nothing. Replays then read old ranges from BigQuery and recent ones from PostgreSQL. Two edges to know: aggregate fields are not archived, so replays from the archive return them empty, and a row whose content is not valid JSON is skipped on replay, so validate in the archiver.

**Lock the doors.** One bearer token protects publishing and streaming (there are no per-client scopes, so put a gateway in front if you need them); `/actuator/**` and the `/debug/events` page are unauthenticated and served in every profile, so block them at your ingress; TLS is terminated in front; and `changeme` is a password for your laptop. Outside Google Cloud, run the `dev` profile with overrides (`staging` and `live` assume Google Cloud Logging), and never invent a profile name: logging is only configured for the known ones, so `prod` starts in eerie silence :warning:.

Here is all of that on one card:

 - one instance, `Recreate` deployments, a grace period longer than 30 seconds;
 - publisher confirms on AMQP producers and a dead-letter policy on the input queue;
 - a real token and database password; `/actuator` and `/debug/events` blocked at the edge;
 - alerts on `[INTERFACE_BEHIND]` and on bursts of `Waiting for missing index`;
 - "restart EventStore" in the broker-outage runbook;
 - idempotent consumers, always: restarts re-deliver, by design.

# Conclusion :tada:
In this blog post we turned the log into state and took it to production. In summary:

 - **Folds**: state plus the next event gives the new state; order-sensitive folds are safe because EventStore's log has exactly one order.
 - **Snapshots**: save index and state together, resume from index + 1, and a `kill -9` costs you only the events since the last snapshot.
 - **Hold your fire**: no side effects during catch-up, and if every alert matters, put "alerted" in the state or give alerts their own consumer.
 - **Fold once, serve many**: when a view is shared, one service folds and every client gets the current state on connect.
 - **Run it with care**: one writer, lag alerts, a cautious archive and locked doors.

That wraps up the series :tada:. We started with one index and ended with snapshots, sharded readers and an archive, and along the way Wile has been charged exactly once for every rocket. The [repository](https://github.com/fifteen02/eventstore) has all seven samples, the documentation and the known issues, which are great places to start contributing. Issues and pull requests are very welcome.

As always, stay safe, keep hacking!
