---
published: false
layout: post
title: "EventStore: Reading the Log by Pulling, Pushing and Sharding"
image: /images/eventstore/logo-small.png
date: 2026-10-13 00:02:00 +0200
tags: [eventstore]
theme: events
summary: "Pulling, pushing and sharding, and exactly when a message arrives twice."
---

<img class="title" src="{{ site.baseurl }}/images/eventstore/logo-small.png"/>
In the [first post]({{ site.baseurl }}/EventStore-Introducing/) we got Wile's orders into a single, ordered log. A log nobody reads is just an expensive diary, though :smirk:, so this post is all about getting messages *out*. There are two ways, and they differ in one question: who remembers how far a consumer has got? With **pull**, the consumer keeps its own bookmark and asks for the log from any point. With **push**, EventStore keeps the bookmark, delivers over AMQP and resumes after a restart. We will build a consumer for each, work out *exactly* when a message arrives twice, peek at the trick that joins history to live messages without a seam, and finish by splitting one log across several readers.

> For a complete listing of all code samples and to clone the project, visit the [GitHub repository](https://github.com/fifteen02/eventstore/tree/main/samples).

# Pull: A Bookmark, Not a Memory
Think about how you read a long book. You do not remember every page you have read; you keep a bookmark, and when you pick the book up again you open it on the page *after* the bookmark. Fall asleep mid-chapter and, worst case, you re-read a page.

A pull consumer works exactly like that. EventStore keeps **no state for a stream**: it does not know who you are or where you were last time. The consumer keeps one number, the index of the last message it processed, and the whole consumer is a loop around it:

 1. __Read the bookmark__: the last index processed, or 0 if there is none.
 2. __Open the book__: `GET /api/events/stream?startIndex=<bookmark + 1>`.
 3. __Read a page__: for each message, process it, **then** move the bookmark to its index.
 4. __Fell asleep?__: when the connection ends, for any reason, wait a moment and go back to 1.

```java
while (true) {
    long startIndex = readCheckpoint() + 1;
    try {
        if (consume(startIndex)) {
            return; // the server ended the stream at END_INDEX
        }
    } catch (Exception e) {
        System.out.println("stream: " + e.getMessage() + ", reconnecting in 2s");
    }
    Thread.sleep(2_000);
}
```

Notice what is missing: there is no special case for "my process restarted", "EventStore restarted" or "a proxy dropped the connection". They are all the same event, so there is no separate recovery path that only runs twice a year and turns out to be broken when it finally does.

The stream itself is plain Server-Sent Events: lines of `event:` and `data:` with a blank line between events, which the JDK's `HttpClient` and a `BufferedReader` handle in about twenty lines (no SSE library needed, see the sample). Four kinds of events arrive: `connected` (once, with where the log currently ends), `message` (one per log entry), `heartbeat` (every five seconds, so proxies don't close a quiet connection) and `stream-ended` (only if you asked for an `endIndex`).

## Move the Bookmark After, Never Before
The order of two lines decides what kind of consumer you have built:

```java
case "message" -> {
    long id = data.path("message").path("id").asLong();
    process(data.path("message"));
    writeCheckpoint(id);
}
```

Crash between `process` and `writeCheckpoint` and the next run asks for that index again, so the message is processed twice. Swap the two lines and a crash in between skips it forever. Twice is recoverable; never is not. That is at-least-once in a nutshell, and it is why `process` must be idempotent, keyed by the index. When the effect lives in the same database as the bookmark, write both in **one transaction** and the duplicate disappears altogether. Keep that thought for the last post.

Let's run it. Wile is `customer-1` in the samples:

```bash
samples/bin/run-eventstore.sh
mvn -q -f samples/02-pull-stream compile exec:java
samples/bin/publish-orders.sh 2
```

```text
stream: connected from 1, server is at 4
stream: #1 StartMarker    user=system     {}   (3 behind)
stream: #2 OrderPlaced    user=customer-1 {"total":49.9,"orderId":"order-1791800693-26411"}   (2 behind)
stream: #3 OrderShipped   user=customer-2 {"total":49.9,"orderId":"order-1791800693-19084"}   (1 behind)
stream: #4 OrderPlaced    user=           {"orderId":"same"}
stream: #5 OrderPlaced    user=customer-1 {"orderId":"order-1791800707-23589-1","total":10}
stream: #6 OrderShipped   user=customer-1 {"orderId":"order-1791800707-23589-1","carrier":"DHL"}
```

Line by line:

 - `connected from 1, server is at 4`: no bookmark yet, so we start at 1, and the log ends at 4.
 - `#1` to `#4` are history; the `(n behind)` counter counts down as we catch up.
 - `#5` and `#6` are live, arriving on the very same connection as `publish-orders` sends them.

Stop the consumer, have Wile order another rocket while it is down, start it again, and it carries on exactly where it stopped: `connected from 11, server is at 12`. Restart EventStore instead and you get the same result.

## Inside EventStore: Recorded, Then Live
Here is the tricky bit a pull API has to get right. Imagine you want to watch a football match that started an hour ago. Watch the recording first and then switch to live, and you miss whatever happened in between. Switch to live first and you see some goals twice. The trick is to start recording the live feed *before* you sit down with the recording, and skip what you have already seen. EventStore does exactly this for every stream:

<img class="center" style="width: 720px" alt="The stream replays 1 to 5 from the database while live messages queue up; 4 and 5 are skipped from the queue" src="{{ site.baseurl }}/images/eventstore/es-handoff.png"/>

 1. The router **registers** the stream first, so every newly committed message also lands in the stream's mailbox.
 2. It then **replays** from `startIndex` up to the newest committed index, loading from the database in batches of 1,000.
 3. Finally it works through the mailbox, and one check throws away the overlap:

```java
private boolean hasAlreadySeen(MessageTo messageTo) {
    return messageTo.id() <= lastObservedIndex;
}
```

Nothing can be missed, because registration comes before the replay plan; nothing can be sent twice, because anything at or below the replay's last index is dropped. That holds for one connection; across reconnects, your bookmark takes over.

## Hold Your Fire While Catching Up
A mistake I have seen more than once: a consumer sends an email whenever an order is cancelled. It is redeployed with an empty bookmark, replays history, and sends Wile forty emails about rockets he cancelled last month :scream:. Replaying should rebuild state, not repeat side effects. The `connected` event tells you where the log ended when you connected, so a consumer knows when it has caught up; until then, update state but hold back emails, alerts and webhooks. The last post builds exactly this, including its subtle catch.

Because the bookmark belongs to the client, a replay is also just a stream with a different bookmark. Want every `OrderPlaced` up to index 4 without touching the main consumer?

```bash
CHECKPOINT_FILE=/tmp/placed.cp END_INDEX=4 STREAM_TYPES=OrderPlaced mvn -q -f samples/02-pull-stream exec:java
```

Two sharp edges before you build one: EventStore ignores the SSE `Last-Event-ID` header (resume with `startIndex`), and browsers cannot use `EventSource` here because it cannot send an `Authorization` header, so use `fetch()` with a streaming body reader instead.

# Push: Let EventStore Keep the Bookmark
Pulling is perfect for dashboards and replays. For a fleet of backend services that already speak AMQP it means every team re-implements the same bookkeeping, so EventStore offers to keep the bookmark instead. A push consumer is called an **interface** and lives in configuration:

```yaml
eventstore:
  amqp:
    enabled: true
  interfaces:
    - name: billing
      type: replayable
      include-types: [OrderPlaced, OrderCancelled]
      sink: { amqp: { virtual-host: / } }
      ack:  { amqp: { virtual-host: / }, batch: 5 }
```

EventStore declares two queues named after the interface, `billing.sink` (EventStore publishes here) and `billing.ack` (billing answers here), and billing's bookmark becomes a row in EventStore's database. Messages billing does not care about are acknowledged on its behalf, so they never hold the bookmark back. Here is the round trip for one of Wile's orders:

<img class="center" style="width: 720px" alt="EventStore publishes #42 to billing.sink, billing processes it, acknowledges on billing.ack and signs for the delivery; EventStore moves its bookmark" src="{{ site.baseurl }}/images/eventstore/es-acks.png"/>

In code, steps 3 and 4:

```java
// 3. Acknowledge to EventStore.
var ackProperties = new AMQP.BasicProperties.Builder()
        .contentType("application/json")
        .headers(Map.of(MessageHeaders.SERVER_CORRELATION_UUID, serverCorrelationUuid))
        .build();
channel.basicPublish("", ACK_QUEUE, ackProperties,
        JSON.writeValueAsBytes(new AcknowledgeTo(index, serverCorrelationUuid)));

// 4. Remove the delivery from billing.sink.
channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
```

The two acknowledgements mean very different things. Think of a parcel courier: signing for the parcel at the door ("I have it, stop carrying it around") is step 4; telling the shop you have actually *used* what was inside ("tick order 42 off") is step 3. Forget step 4 and the queue fills with parcels you never signed for. Forget step 3 and the shop never ticks anything off, so every restart sends you everything again.

Why the `serverCorrelationUUID` header? Every EventStore run picks a fresh one, and acknowledgements whose header does not match the current run are dropped. After a restart EventStore decides where to resume from its own saved bookmark and re-sends everything after it, so an acknowledgement still in flight from the previous run refers to a delivery that has already been re-sent. One source of truth: the saved bookmark plus this run's acknowledgements.

## From Acknowledgements to a Bookmark
Acknowledgements can arrive in any order, especially with several consumers on one queue. EventStore keeps them in a sorted set and only moves the bookmark over a **contiguous** run of indices, and only in **whole batches**:

<img class="center" style="width: 720px" alt="Indices 16 to 24 and 26 are acknowledged; the bookmark is saved at 20 and 26 waits for the missing 25" src="{{ site.baseurl }}/images/eventstore/es-bookmark.png"/>

If 7 is acknowledged before 6, the bookmark waits at 5; it can never jump over a message nobody processed. And with the default batch of 1,000, the database sees one write per thousand messages rather than a thousand writes. That second rule is a deliberate trade, and it is exactly where duplicates come from.

## Exactly When Wile Gets Charged Twice
Start EventStore with that configuration on a log that already has some history:

```text
Interface [replayable] 'billing' started and ready to receive messages
Interface billing catch-up completed: processed 6 messages, skipped 7 messages, reached message ID 13
```

A brand-new interface starts at the very beginning of the log: it pushed the 6 matching messages and acknowledged the 7 it does not care about. Adding a service later never needs a backfill job, and it is quick: catching up past 19,502 messages took about three seconds in a test.

Now have Wile order two more things, so billing processes 21 to 24 while its saved bookmark stays at 20, and restart EventStore while billing keeps running:

```text
Interface billing catch-up completed: processed 2 messages, skipped 3 messages, reached message ID 25
```

```text
billing: #21 duplicate, skipped
billing: #23 duplicate, skipped
```

EventStore resumed from 20 and re-sent the two orders above it. Without the duplicate check, Wile would have paid for those rockets twice. So after a restart, an interface is re-sent everything after its saved bookmark: up to `batch - 1` processed messages that did not complete a batch, anything stuck behind a gap, and everything still waiting in the queue, which is now in it **twice**. The re-sent copies join the back of the queue, so a slow consumer can see something like `#9, #11, #6, #8, #9, #11`. Rely on the index, never on arrival order, and let your database do the bookkeeping, in the same transaction as the charge:

```sql
create table billing_processed (event_index bigint primary key);

-- inside the transaction that records the charge
insert into billing_processed (event_index) values (:messageId)
on conflict do nothing;   -- 0 rows: already processed, roll back the charge and just acknowledge
```

And acknowledge duplicates to EventStore too, otherwise the bookmark never moves past them.

## Realtime: Fire and Forget
ACME's notifications service tells Wile his rocket has shipped. Miss one and Wile finds out when the parcel lands on his head anyway. For that there is a `realtime` interface: no ack queue, no bookmark, no catch-up, each message published once as it is committed. "Fire and forget" is only a good choice if you know what gets forgotten:

| Situation | realtime | replayable |
|---|---|---|
| Consumer is down | messages wait in the queue | messages wait in the queue |
| Interface added later | never sees history | catches up from index 1 |
| EventStore restarts | nothing is re-sent | re-sends everything after the bookmark |
| Broker unreachable when publishing | lost | re-sent after the next EventStore restart |

That last row hides a rough edge I found while testing :warning:. A failed publish stops the interface's actor and nothing restarts it, so after a broker outage an interface stays silent until EventStore itself restarts. Replayable interfaces recover everything on that restart; realtime ones lose everything in between. It is a known issue with a clear fix, and until it ships, "broker outage" should be followed by "restart EventStore".

# Sharding: More Readers, One Rule
Sooner or later one pull consumer cannot keep up: the work per message gets heavier and ACME gets busier (Wile has discovered next-day delivery). The hard part of running more readers is splitting the work so that nothing is handled twice, nothing is dropped, and messages that belong together stay with the same reader, in order.

Picture a post office with three clerks: letters are shared out by surname, so every letter lands with exactly one clerk and all the Coyote family's letters land with the same one. EventStore's sharding is that rule, with the `userId` as the surname. Any stream can ask for its shard:

```text
GET /api/events/stream?startIndex=1&shardCount=3&shardIndex=0
```

```java
return Math.floorMod(shardHash(messageTo), shardCount) == shardIndex;   // murmur3 of the userId
```

<img class="center" style="width: 720px" alt="Six customers hashed onto three readers; each customer always lands with the same reader" src="{{ site.baseurl }}/images/eventstore/es-shards.png"/>

Each reader is otherwise exactly the pull consumer from above, with its own bookmark: no coordinator, no group membership, no rebalancing. Let's prove it with fifty customers and three readers, each replaying the whole log for its shard:

```bash
CUSTOMERS=50 samples/bin/publish-orders.sh 100
mvn -q -f samples/05-sharded-readers compile exec:java
```

```text
reading indices 1..292 with 3 shard readers

shard 0: 115 messages  {customer-0=..., customer-12=..., ...}
shard 1:  64 messages  {...}
shard 2: 113 messages  {...}

total 292 distinct of 292 stored, 0 delivered twice
```

Every one of the 292 messages was delivered exactly once, and every customer appears in exactly one shard. Notice, though, that 115, 64 and 113 are not equal: shards are balanced by **users**, not messages. With only three customers it gets silly, and one of three readers receives nothing at all. A single very busy user makes their shard busy however many shards you add.

How does this compare to Kafka partitions? Kafka sorts letters into bags **at the door**: the partition is chosen when a message is written, and the number of bags is fixed. EventStore sorts **at the desk**: there is one log, and each stream applies the hash as it reads. So you can pick any number of readers, change it whenever you like, and the split applies to history too. The cost is that every reader's stream reads the whole log inside EventStore; sharding spreads the *processing*, not the reading. To change the number of readers safely, stop all the old ones, start the new layout from the **lowest** of their bookmarks, and let idempotency absorb the overlap.

# Conclusion :tada:
In this blog post we read the log three ways. In summary:

 - **Pull**: the client owns one number; move it after processing, reconnect to recover, and hold side effects until you have caught up.
 - **No seam**: EventStore registers a stream first, replays, then drops what it has already sent, so a connection never misses or repeats a message.
 - **Push**: two acknowledgements, a bookmark that moves over contiguous indices in whole batches, and duplicates whose size you can predict; realtime is cheap for a reason.
 - **Shards**: a pure function of the user, so readers need no coordination, at the price of shards that are only as even as your users.

Grab samples [02](https://github.com/fifteen02/eventstore/tree/main/samples/02-pull-stream), [03](https://github.com/fifteen02/eventstore/tree/main/samples/03-push-replayable) and [05](https://github.com/fifteen02/eventstore/tree/main/samples/05-sharded-readers), restart things at awkward moments, and watch nothing get lost. In the last post we fold the log into state and take it to production.

As always, stay safe, keep hacking!
