---
layout: post
title: "EventStore: One Ordered Log for Everything"
image: /images/eventstore/logo-small.png
date: 2026-10-13 00:01:00 +0200
tags: [eventstore]
theme: events
summary: "One index, one writer, and the exact delivery guarantee you get."
---

<img class="title" src="{{ site.baseurl }}/images/eventstore/logo-small.png"/>
Every system I have worked on eventually grows the same bit of plumbing. Something happens, an order is placed or a payment clears, and three other services need to know about it. Version one is a queue per consumer. Version two adds a table so a consumer that was down can catch up. Version three adds an ordering column, a "last processed" pointer per consumer, and a script that someone runs when the pointer and the table disagree :grimacing:. After building that plumbing one time too many, I wanted it done once, properly, and today [EventStore](https://github.com/fifteen02/eventstore) is open source :tada:! In this blog post I will introduce the idea behind it, show you how messages get in, what that costs, and be very precise about the guarantee you get. It is the first of three posts: the next one covers reading the log, and the last one turns the log into state and runs it in production.

> For a complete listing of all code samples and to clone the project, visit the [GitHub repository](https://github.com/fifteen02/eventstore/tree/main/samples).

# Meet ACME
Throughout this series we will follow ACME Corporation, purveyor of rockets, anvils and giant magnets. Wile E. Coyote is, by a comfortable margin, its best customer. Every time Wile orders something, three services need to know: **billing** has to charge him, **notifications** has to tell him his rocket has shipped (again), and a **dashboard** keeps a running tally of who is spending what.

Simple enough, until billing is down for five minutes. When it comes back, which orders did it miss? In what order did they happen? And how does it avoid charging Wile twice for the same rocket? Those three questions are what EventStore answers, and this is the shape of the answer:

<img class="center" style="width: 720px" alt="Producers write into one ordered log; billing and notifications get messages pushed, the dashboard pulls" src="{{ site.baseurl }}/images/eventstore/es-overview.png"/>

Messages come in over REST or an AMQP queue, every one of them gets the next number in a single log, and consumers read that log either by having it **pushed** to them over AMQP or by **pulling** it over HTTP from any point in history.

# One Log, One Index
That number is the **global index**: 1, 2, 3 and so on, across every type of message. Think of it as the ticket number at the deli counter. Everyone gets a number, the numbers only go up, and "where am I in the queue?" is answered by a single integer. That one number does three jobs at once:

 1. **Identity**: message 42 is message 42, forever.
 2. **Position**: "I have processed everything up to 41" fully describes a consumer's progress.
 3. **Idempotency key**: "have I already charged for 42?" is a primary-key lookup.

If you have used Kafka you might be wondering why there is only one counter. Kafka splits a topic into partitions and gives each partition its own offset, so a consumer's position is really a *vector* of numbers, one per partition. That buys a lot of write parallelism, but it costs you a total order:

<img class="center" style="width: 720px" alt="A partitioned topic has one offset per partition and no order across them; EventStore has one order for every reader" src="{{ site.baseurl }}/images/eventstore/es-partitions.png"/>

Offset 1 on partition 0 and offset 1 on partition 1 say nothing about which happened first, and two consumers can each be "ahead" of the other on different partitions. EventStore deliberately makes the opposite trade: one counter, so every consumer agrees on what happened before what, and progress is always a single number. The price is paid on the write path.

# Getting a Message In
Here is the heart of the ingestion code, trimmed slightly:

```java
public synchronized MessageTo ingest(MessageInput input) {
    var contentHash = contentHash(input.content());
    if (duplicateDetectionService.isDuplicate(contentHash)) {
        return null;                                            // -> 202 Accepted
    }
    var messageTo = transactionOperations.execute(_ -> {
        var message = buildMessage(input, contentHash, indexService.nextCandidate().value());
        return MessageTo.from(messageRepository.save(message));
    });
    indexService.markCommitted(messageTo.id());
    duplicateDetectionService.recordProcessedHash(contentHash);
    actorRegistry.tellRouter(new RouterActor.Route(messageTo));  // hand it to the consumers
    return messageTo;                                           // -> 201 Created
}
```

Three properties fall out of these few lines, and they matter far more than any feature list:

 - __No gaps, ever__: the next index is always "last committed + 1", and an index only counts as committed after the database transaction succeeds. If a save fails, the next message reuses the number. If you have seen 42, then 1 to 41 exist.
 - __Nothing is visible before it is durable__: a message is handed to consumers only after its row is committed.
 - __Order is paid for with serialization__: notice the `synchronized`. One message at a time reserves its index, commits and is routed.

How expensive is that last one? I measured it on my laptop (Apple M4 Max, PostgreSQL 16 in Docker), publishing 5,000 messages over REST from an in-process Java client:

```text
concurrency  1:   881 msg/s, 1.13 ms per message
concurrency  8:  1273 msg/s, 6.28 ms per message
concurrency 32:  1602 msg/s, 19.97 ms per message
```

Reading these line by line:

 - With one client, each publish takes about a millisecond, roughly one database commit.
 - With eight clients, throughput goes up by less than half, while each client waits six times longer.
 - With thirty-two clients, throughput is less than double the single-client figure.

Adding clients mostly adds queueing, exactly as you would expect from a single writer. A database across a network will be slower, but the shape will not change. If you need tens of thousands of events per second in one stream, this is the wrong tool; if you need hundreds to a couple of thousand, with an order you never have to think about, it fits comfortably.

## One Instance per Database
The single writer has one more consequence. EventStore hands out indices from memory: on startup it reads the highest index into a counter and counts up from there. Picture two deli counters handing out tickets from two rolls that both start at 42: two customers get ticket 43, and one of them is going to be disappointed (the second insert fails on the primary key). So the rule is **exactly one instance per database**, and that includes deployments:

<img class="center" style="width: 680px" alt="A rolling update briefly runs two writers; Recreate stops the old instance first" src="{{ site.baseurl }}/images/eventstore/es-deploy.png"/>

Use a `Recreate` deployment rather than a rolling update. During the short gap, REST producers retry, AMQP producers do not even notice (their messages wait in the queue), and readers reconnect from their bookmarks. One more thing to budget for: shutdown waits up to 30 seconds while streams are connected, because an open stream is a request that never finishes on its own. With a single stream connected I saw about 25 seconds. That is not a hang.

# Your First Message
Let's run it. You will need Docker, Java 25 and Maven:

```bash
docker compose -f samples/docker-compose.yml up -d --wait
mvn -q install -DskipTests
samples/bin/run-eventstore.sh
```

That starts PostgreSQL and an AMQP broker, builds EventStore and runs it on port 8083 with a development token. Wile orders a rocket:

```bash
curl -X PUT http://localhost:8083/api/events/message \
  -H 'Authorization: Bearer dev-eventstore-token' \
  -H 'Content-Type: application/json' \
  -d '{"messageType":"OrderPlaced","userId":"customer-1","content":{"orderId":"o-1001","total":49.90}}'
```

```json
{"id":2,"messageType":"OrderPlaced","body":{"orderId":"o-1001","total":49.9},"userId":"customer-1","contentHash":"3c5f5a66…", ...}
```

The response is the stored message, and `id` is its index. Why 2 and not 1? Every time EventStore starts it writes a `StartMarker` into the log, so restarts are recorded right there in the history. Reading it back is one request away, and the next post is all about that.

## Publishing Over AMQP
Producers that already sit on a broker can publish to an input queue instead of calling REST. The body is the content as JSON and everything else travels as headers; `messageType` is the one that is required:

```java
headers.put(MessageHeaders.MESSAGE_TYPE, "OrderPlaced");    // required
headers.put(MessageHeaders.USER_ID, "customer-1");
headers.put(MessageHeaders.METADATA, "{\"source\":\"order-form\"}");

channel.confirmSelect();
channel.basicPublish("", "eventstore.input", properties, json.writeValueAsBytes(content));
channel.waitForConfirmsOrDie(5_000);
```

Getting Wile's order from the form into the log involves two hand-offs, and each deserves a guarantee:

 1. __Producer to broker__: use **publisher confirms** (`confirmSelect` and `waitForConfirmsOrDie`). Without them, a message lost on the way to the broker is lost silently.
 2. __Broker to EventStore__: EventStore acknowledges an input message only **after** it is committed. If EventStore dies halfway, the broker re-delivers.

What you give up is the reply: an AMQP producer never learns the index it was given. And a message without a `messageType` is rejected without being re-queued. If you want to keep those for a post-mortem, give the input queue a dead-letter policy. I tried it with one untyped message and one valid one:

```text
WARN c.f.e.amqp.EventstoreInputHandler - Rejecting AMQP input without a messageType header (delivery tag 3)
```

```text
eventstore.input messages 0 consumers 1
eventstore.input.rejected messages 1 consumers 0
```

The bad message is parked in the dead-letter queue, the valid one was stored, and ingestion carried on.

# Duplicates
What happens if a producer sends the same thing twice? Let's try:

```bash
for i in 1 2; do curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:8083/api/events/message \
  -H 'Authorization: Bearer dev-eventstore-token' -H 'Content-Type: application/json' \
  -d '{"messageType":"OrderPlaced","content":{"orderId":"same"}}'; done
```

```text
201
202
```

The second one was accepted but not stored. It is tempting to read too much into this, so here is exactly what happens. On startup EventStore loads the hashes of the most recent messages (2,000 by default). For the next 2,000 messages it ingests, any message whose body hashes the same as a remembered one is skipped. After that the check switches itself off until the next restart.

Why such a narrow window? Because it targets one specific accident: a producer sends a batch, EventStore restarts before the responses arrive, and the producer helpfully sends the whole batch again. It is a safety net, not a deduplication layer:

 - Only the body is hashed, so give every real event a unique body. Two genuine `OrderPlaced` events that both just say `{"orderId":"o-1"}` collapse into one while the window is open.
 - Outside the window nothing is suppressed, so producers that need exactly-once writes bring their own idempotency key.

# The Guarantee
Let's be precise, because this one sentence shapes every consumer in this series. EventStore gives you **at-least-once delivery over a gap-free, totally ordered log**:

 - A committed message is never lost, and indices never repeat or skip.
 - A single stream delivers indices in increasing order, each at most once per connection.
 - A consumer *can* see the same message more than once, after a crash or a restart. The next post shows exactly when.

So every consumer we write is idempotent, and the index makes that cheap: it is unique, it never changes, and it arrives with every message.

# Conclusion :tada:
In this blog post we introduced EventStore and the decisions behind it. In summary:

 - **One index**: one number is a message's identity, a consumer's position and your idempotency key, and it gives every consumer the same order.
 - **One writer**: gap-free ordering and "visible means durable" come from a single serialized write path, which caps throughput and means one instance per database, deployed with `Recreate`.
 - **Two safe ways in**: REST if you want the index back, AMQP with publisher confirms (and a dead-letter queue) if you don't.
 - **At least once**: duplicate suppression covers producer retries after a restart; everything else is the consumer's job, keyed by the index.

Clone the [repository](https://github.com/fifteen02/eventstore), run sample 01, and send Wile a rocket of your own :rocket:. Next time, we read the log: pulling it, pushing it and sharding it.

As always, stay safe, keep hacking!
