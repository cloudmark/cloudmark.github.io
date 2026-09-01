---
layout: post
title: "Cats-Actors 2.2.0: Taking Control of Time"
image: /images/cats-actors/logo-small.png
---

<img class="title" src="{{ site.baseurl }}/images/cats-actors/logo-small.png"/>
Every actor test suite eventually grows a graveyard of sleeps. You schedule something for five seconds, so the test sleeps for six. You set a receive timeout of a minute, and quietly decide that particular branch is untestable. Then CI runs on a loaded machine, a sleep lands a few milliseconds early, and a test that was fine on your laptop goes red for reasons nobody can reproduce. Cats-Actors 2.2.0 fixes this by handing you the clock. Scheduled work, receive timeouts, supervision restart windows: all of it now runs in *simulated* time, which means an hour-long timeout can be tested in milliseconds and the result is the same every single run.

## The Problem With Waiting

Here is the test everyone writes at least once. An actor schedules some work for five seconds from now, and we want to prove it fires:

```scala
for {
  fired <- Ref[IO].of(false)
  _ <- system.actorOf(schedulingActor(fired), "scheduler-actor")
  _ <- IO.sleep(6.seconds)   // 😴 six real seconds of your life
  result <- fired.get
} yield result shouldBe true
```

It works. It also costs six seconds of wall-clock time, every run, forever. Multiply that by a suite of thirty timing tests and your feedback loop is measured in minutes. Worse, the six is a guess. It is "five plus a bit for luck", and the amount of luck required depends on how busy the machine is.

Cats Effect has had the answer to this for a while in `TestControl`: a runtime where `IO.sleep` does not sleep, it simply advances a simulated clock. What was missing was the plumbing to run an entire actor system inside it.

## Enter `ControlledTestKit`

2.2.0 ships `ControlledTestKit` in the companion testkit module:

```scala
resolvers += "jitpack" at "https://jitpack.io"

libraryDependencies += "com.github.cloudmark.cats-actors" %%% "cats-actors-testkit" % "2.2.0" % Test
```

Mix the trait into your spec and wrap the body in `withActorSystemIO`. It provisions an `ActorSystem[IO]`, runs your logic under `TestControl`, ticks the simulated clock, and hands back the result:

```scala
import cats.effect.{IO, Ref}
import cats.effect.testing.scalatest.AsyncIOSpec
import com.suprnation.actor.Actor.{Actor, Receive}
import com.suprnation.actor.test.ControlledTestKit
import org.scalatest.matchers.should.Matchers
import org.scalatest.wordspec.AsyncWordSpec

import scala.concurrent.duration._

class SchedulerSpec
    extends AsyncWordSpec
    with AsyncIOSpec
    with Matchers
    with ControlledTestKit {

  "An actor scheduling delayed work" should {
    "observe the task firing without waiting in real time" in
      withActorSystemIO { system =>
        for {
          fired <- Ref[IO].of(false)
          _ <- system.actorOf(
            new Actor[IO, String] {
              override def preStart: IO[Unit] =
                // scheduleOnce_ fires in the background (it `.start`s a fiber);
                // scheduleOnce would instead block preStart for the full delay.
                context.system.scheduler.scheduleOnce_(5.seconds)(fired.set(true)).void

              override def receive: Receive[IO, String] = { case _ => IO.unit }
            },
            "scheduler-actor"
          )
          // Written as a 6s wait, but ControlledTestKit advances simulated
          // time, so the test still completes instantly.
          _ <- IO.sleep(6.seconds)
          result <- fired.get
        } yield result shouldBe true
      }
  }
}
```

Same test, same six-second sleep, except now it finishes in the time it takes to allocate a `Ref`. The sleep is not skipped, mind you. It is *honoured* against a clock that we advance ourselves, so ordering is preserved: work scheduled for five seconds still happens strictly before the six-second mark.

The signature is small on purpose:

```scala
def withActorSystemIO[T](
    testCode: ActorSystem[IO] => IO[T],
    testTimeWindow: FiniteDuration = FiniteDuration(90, TimeUnit.SECONDS)
): IO[T]
```

`testTimeWindow` is how much *simulated* time to tick through, not how long you are prepared to wait. Ninety simulated seconds cost nothing, so feel free to raise it. The returned `IO` succeeds with your value, or fails: errors propagate as themselves, while a cancelled or unfinished test surfaces as a `ControlledTestException.Canceled` or `ControlledTestException.TimedOut`. It is framework agnostic, so any runner that can execute an `IO` will do. If you would rather inspect a failure than propagate it, `.attempt` the result.

`ControlledTestKit` extends `TestKit`, so every message assertion you already use (`expectMsgs`, `expectMsgType`, `awaitTerminated`, probes) works inside a controlled-time test.

## The Test That Was Impossible Before

Here is my favourite consequence. Receive timeouts now honour simulated time too, which makes this a perfectly reasonable thing to write:

```scala
_ <- system.replyingActorOf(constantFlowActor(1.hour, counter, buffer), "long-timeout-actor")
_ <- IO.sleep(65.minutes)   // an hour and five minutes, in about a millisecond
timeouts <- helloActor ? Get
```

An hour-long receive timeout, verified in a unit test, deterministically. Before 2.2.0 the only way to check that branch was to actually wait an hour, which is another way of saying nobody ever checked it.

## Why It Did Not Work Before

The reason receive timeouts ignored `TestControl` was mundane. `ReceiveTimeout` recorded when the last message arrived using `System.currentTimeMillis`. `TestControl` can advance an `IO.sleep`, but it has no power whatsoever over the system wall clock. So virtual time raced ahead an hour while the wall clock moved a fraction of a millisecond, the timeout never came due, and the test hung or silently proved nothing.

The fix was to read the clock through Cats Effect instead:

```scala
private def nowMillis: F[Long] = Clock[F].monotonic.map(_.toMillis)
```

Two details worth stealing if you are doing the same thing in your own codebase:

- **`Clock[F]`, not `Temporal[F]`.** `Temporal` only adds `sleep` on top of `Clock`, so `Clock` is the weaker (and therefore better) constraint. More often than not it is already in scope: `Sync` extends `Clock`, so the change frequently costs you no new typeclass bound at all.
- **`monotonic` for elapsed time, `realTime` for timestamps.** A timeout measures a *duration*, so it should be immune to the wall clock jumping under it (NTP corrections, someone changing the system time). `TestControl` advances both, so you lose nothing by picking the correct one.

## Supervision Windows Play Along Too

The same treatment went to supervision, which is where simulated time earns its keep a second time. Every strategy can be given a retry budget over a window:

```scala
OneForOneStrategy[IO](maxNrOfRetries = 2, withinTimeRange = 500.millis) { case _ => Restart }
```

"Restart the child up to twice in any 500ms window." Testing that honestly means arranging failures on either side of the window boundary, which used to mean sleeping through it for real. The window is now measured with the monotonic clock, so it moves with simulated time like everything else, and the test becomes something you would actually write: with `maxNrOfRetries = 2` and `withinTimeRange = 500.millis`, fire three failures a *virtual* second apart. Each one opens a fresh window, so all three children restart, and the whole thing runs in milliseconds.

Getting there without disturbing the public API took a small trick worth knowing. `ChildRestartStats` stays free of any effect type: the caller passes the timestamp in, and both strategies read the clock in `processFailure`, which already returns `F[Unit]`:

```scala
context.system.temporalF.monotonic.flatMap { now =>
  if (restart && stats.requestRestartPermission(retriesWindow, now.toNanos))
    restartChild(child, cause, suspendFirst = false)
  else
    context.stop(child)
}
```

The actor system already exposes a `Temporal[F]`, so `OneForOneStrategy` and `AllForOneStrategy` gained no new constraint at all.

## Also In This Release

A few smaller things came along for the ride:

- **`expectMsgTypeCountN` and `expectMsgTypeSingle`** in `TestKit`. These count messages of a given type in the buffer, and unlike `expectMsgType` they do not care *when* the message arrived relative to the call. `expectMsgType` snapshots the buffer on entry and requires exactly one new message after that snapshot, which makes it quietly unreliable when the message arrives quickly. It now carries a warning in its scaladoc, and `expectMsgTypeCountN` is the assertion you probably want.
- **Better failure output.** `expectMsgs` now prints the queue state when it fails, so you can see what the actor *did* receive.
- **The dead-letter mailbox idle check** moved to the monotonic clock as well.
- **`ActorSystem.uptime` is now `F[Long]`** rather than `Long`, measured against the monotonic clock. This is a breaking change, though a small one: `system.uptime.flatMap(...)` instead of `system.uptime`.

One deliberate omission: `LogEvent.timestamp` still reads the wall clock. It records *when an event was created*, which is a genuine timestamp rather than an elapsed measurement, so `realTime` semantics are the honest answer there and threading a clock through it would buy nothing in determinism.

## Upgrading

```scala
resolvers += "jitpack" at "https://jitpack.io"

libraryDependencies += "com.github.cloudmark.cats-actors" %%% "cats-actors" % "2.2.0"
libraryDependencies += "com.github.cloudmark.cats-actors" %%% "cats-actors-testkit" % "2.2.0" % Test
```

Scala 2.13 and 3, on JVM, Scala.js and Scala Native, as always. The only source-level break is `uptime`, plus `ChildRestartStats.requestRestartPermission` if you happen to call it directly from a hand-rolled `SupervisionStrategy`. The built-in strategies are unchanged.

# Conclusion :tada:

Deterministic tests are not a luxury feature for a concurrency library, they are the whole point. If you cannot test the timeout, the retry window, and the scheduled sweep without inserting real sleeps into your build, you end up not testing them at all, and those are precisely the paths that fail at three in the morning.

What I like most about this release is how it came about. Somebody read the source, noticed `System.currentTimeMillis` where a `Clock` belonged, and asked whether there was a reason for it. There was not, only inheritance from an older design. Following that thread turned a handful of untestable code paths into ordinary ones, and left the suite faster and steadier than it was last week. Good questions are worth more than good answers.

Grab [Cats-Actors 2.2.0](https://github.com/cloudmark/cats-actors), point `ControlledTestKit` at your slowest timing test, and enjoy watching an hour go by instantly.

As always, stay safe, keep hacking!
