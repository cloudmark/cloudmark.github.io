---
layout: post
title: Typed Actors in Action - Exploring Cats-Actors with Alice and Bob
image: /images/cats-actors/logo-small.png
---

<img class="title" src="{{ site.baseurl }}/images/cats-actors/transaction-2.png"/>
Today marks an exciting milestone with the release of Cats-Actors 2.0.0-RC1. This version introduces typed actors, a feature that the community has eagerly awaited. To showcase this new capability, we'll walk through a classic example of handling wallet transactions between two users, Alice and Bob.
So, sit back and relax as we explore how Alice sends money to Bob using typed actors in Cats-Actors. 

## Meet Alice and Bob

Alice and Bob are best friends and tech enthusiasts who often lend and borrow money from each other. Today, Alice needs to send some money to Bob to settle a shared expense. To handle this transaction, they decide to use the latest release of Cats-Actors, excited to explore its new typed actors feature.

Typed actors ensure type-checked message passing at compile time, reducing runtime errors. Alice and Bob will create wallet actors to manage their balances and use a transaction actor to coordinate the money transfer from Alice's wallet to Bob's. 


## Setting Up Your Project
To begin working with typed actors in Cats-Actors, you'll need to set up your Scala project to include the necessary dependencies and explore the framework's resources.

### Adding Dependencies

First, ensure your Scala project is configured to fetch dependencies from JitPack, a popular repository for GitHub-hosted projects. Add the following lines to your build.sbt file:

   ```scala
   resolvers += "JitPack" at "https://jitpack.io"

   libraryDependencies += "com.github.suprnation" % "cats-actors_2.13" % "2.0.0-RC1"
   ```

In the above snippet, `"2.0.0-RC1"` should be replaced with the latest version of Cats-Actors available on JitPack. These dependencies enable you to utilize Cats-Actors in your Scala application.

Visit the [Cats-Actors GitHub repository](https://github.com/suprnation/cats-actors/) to explore comprehensive documentation, examples, and community contributions related to the framework.

> Note to view and run all code samples discussed in this blog post, clone the [GitHub repository](https://github.com/cloudmark/cats-actor-sample).


## The WalletActor: Managing Alice and Bob's Wallets :bank:

The `WalletActor` is responsible for managing commands related to wallet operations, including retrieving balances, depositing funds, and withdrawing funds. It ensures robustness by strictly typing its `receive` operations to handle only `Command` messages, thereby preventing runtime errors. Let's delve into how it works.

```scala
package com.suprnation.samples

import cats.effect.{ExitCode, IO, IOApp, Ref}
import cats.implicits._
import com.suprnation.actor.Actor.{Actor, Receive}
import com.suprnation.actor.ActorRef.ActorRef
import com.suprnation.actor._

object WalletActor {
  sealed trait Command
  case class GetBalance(replyTo: ActorRef[IO, Balance]) extends Command
  case class Deposit(amount: BigDecimal, replyTo: Option[ActorRef[IO, Response]]) extends Command
  case class Withdraw(amount: BigDecimal, replyTo: Option[ActorRef[IO, Response]]) extends Command

  sealed trait Response
  case class TransactionFailed(reason: String) extends Response
  case class Balance(amount: BigDecimal) extends Response

  def create(walletId: String): IO[Actor[IO, Command]] =
    for {
      balance <- Ref[IO].of(BigDecimal.decimal(0.0))
    } yield new Actor[IO, Command] {
      override def receive: Receive[IO, Command] = {
        case Deposit(amount, replyTo) =>
          balance.update(_ + amount) >>
            balance.get.flatMap(newBalance =>
              IO.println(
                s"[${context.self.path.name}] Deposited $amount to $walletId. New balance: $newBalance"
              ) >>
                replyTo.fold(IO.unit)(_ ! Balance(newBalance))
            )

        case Withdraw(amount, replyTo) =>
          balance.get.flatMap { currentBalance =>
            if (currentBalance >= amount) {
              balance.update(_ - amount) >>
                balance.get.flatMap(newBalance =>
                  IO.println(
                    s"[${context.self.path.name}] Withdrew $amount from $walletId. New balance: $newBalance"
                  ) >>
                    replyTo.fold(IO.unit)(_ ! Balance(newBalance))
                )
            } else replyTo.fold(IO.unit)(_ ! TransactionFailed(s"Insufficient funds in $walletId"))
          }

        case GetBalance(replyTo) =>
          for {
            currentBalance <- balance.get
            _ <- replyTo ! Balance(currentBalance)
          } yield ()
      }
    }
}
```

### Breaking Down the WalletActor

The `WalletActor` handles three main commands:

1. **GetBalance**: This command is used to query the current balance of the wallet. It takes an `ActorRef` that will receive the balance as a response.

    ```scala
    case class GetBalance(replyTo: ActorRef[IO, Balance]) extends Command
    ```

2. **Deposit**: This command adds a specified amount to the wallet's balance. It also optionally takes an `ActorRef` to send a response indicating the new balance.

    ```scala
    case class Deposit(amount: BigDecimal, replyTo: Option[ActorRef[IO, Response]]) extends Command
    ```

3. **Withdraw**: This command deducts a specified amount from the wallet's balance if there are sufficient funds. It can also take an `ActorRef` for response purposes.

    ```scala
    case class Withdraw(amount: BigDecimal, replyTo: Option[ActorRef[IO, Response]]) extends Command
    ```

Responses include the current balance and a transaction failure message if something goes wrong:

- **TransactionFailed**: Indicates a failed transaction with a reason.
- **Balance**: Represents the current balance of the wallet.

The create method initializes the `WalletActor` with a starting balance of 0. Its `receive` method is strictly typed to handle only `Command` messages, ensuring type safety and minimizing runtime errors.

## The TransactionActor: Coordinating the Transfer :money_mouth_face:

With Alice and Bob's wallets all set, it's time to master the art of money transfer. The `TransactionActor` takes on the pivotal role of seamlessly managing transactions between them.

Before we dive into the code, let's explore the intricate workings of the transaction state machine.

### The Transaction State Machine 🤖

The `TransactionActor` takes charge of orchestrating the flow of a transaction between two wallets. The process involves the following states:

1. **PreStart**: Initialization phase where the actor sends a withdrawal request to the source wallet.
2. **awaitWithdraw**: Waits for confirmation of the withdrawal from the source wallet.
3. **awaitDeposit**: Waits for confirmation of the deposit to the destination wallet.
4. **Transaction Complete**: Indicates that the transaction was successful and the actor can be stopped.
5. **Transaction Failed**: Indicates that the transaction failed, either during withdrawal or deposit, and the actor can be stopped.

Here's a state machine diagram to visualize this flow:

<div class="mermaid">
stateDiagram
    PreStart: PreStart
    awaitWithdraw: awaitWithdraw
    awaitDeposit: awaitDeposit
    TransactionComplete: Transaction Complete
    TransactionFailed: Transaction Failed

    PreStart --> awaitWithdraw: Send withdraw request
    awaitWithdraw --> awaitDeposit: Withdraw successful
    awaitWithdraw --> TransactionFailed: Withdraw failed
    awaitDeposit --> TransactionComplete: Deposit successful
    awaitDeposit --> TransactionFailed: Deposit failed
    TransactionFailed --> [*]: Stop actor
    TransactionComplete --> [*]: Stop actor
</div>


### Implementing the TransactionActor
With the state machine as our guide, let's roll up our sleeves and bring the `TransactionActor` to life!

```scala
object TransactionActor {
  sealed trait Response
  case class TransactionSuccess(transactionId: String) extends Response
  case class TransactionFailed(reason: String) extends Response

  def create(
      transactionId: String,
      parent: ActorRef[IO, Response],
      fromWallet: ActorRef[IO, WalletActor.Command],
      toWallet: ActorRef[IO, WalletActor.Command],
      amount: BigDecimal
  ): Actor[IO, Nothing] = new Actor[IO, Nothing] {

    override def preStart: IO[Unit] = for {
      _ <- IO.println(
        s"~~~ [Tx: $transactionId] => Sending withdraw request to [${fromWallet.path.name}].  Awaiting confirmation.  ~~~"
      )
      _ <- fromWallet ! WalletActor.Withdraw(amount, context.self.widenRequest.some)
      _ <- context.become(awaitWithdraw)
    } yield ()

    def awaitWithdraw: Receive[IO, WalletActor.Response] = {
      case WalletActor.Balance(_) =>
        for {
          _ <- IO.println(
            s"~~~ [Tx: $transactionId] => Withdraw from [${fromWallet.path.name}] confirmed.  Depositing to [${toWallet.path.name}]. ~~~"
          )
          _ <- toWallet ! WalletActor.Deposit(amount, context.self.widenRequest.some)
          _ <- context.become(awaitDeposit)
        } yield ()

      case WalletActor.TransactionFailed(reason) =>
        parent ! TransactionFailed(s"Withdraw from source wallet failed: $reason")
        context.stop(context.self)
    }

    def awaitDeposit: Receive[IO, WalletActor.Response] = {
      case WalletActor.Balance(_) =>
        for {
          _ <- IO.println(
            s"~~~ [Tx: $transactionId] => Deposit to [${toWallet.path.name}] confirmed.  Killing actor - transaction complete! ~~~"
          )
          _ <- parent ! TransactionSuccess(transactionId)
          _ <- context.stop(context.self)
        } yield ()

      case WalletActor.TransactionFailed(reason) =>
        parent ! TransactionFailed(s"Deposit to destination wallet failed: $reason")
        context.stop(context.self)
    }
  }
}
```

# Lights, Camera, Action! :clapper:
It's showtime for our main application! Here, we'll orchestrate the entire ensemble: setting up the actor system, casting wallet actors for Alice and Bob, and kickstart a thrilling transaction between them. Plus, we've got a backstage reporter actor to capture all the action and reactions!

```scala
object Main extends IOApp {
  def run(args: List[String]): IO[ExitCode] =
    ActorSystem[IO]("actor-system").use { system =>
      for {
        auditor <- system.actorOf(new Actor[IO, Any] {
          override def receive: Receive[IO, Any] = { case response =>
            val sender: String = context.sender.map(_.path.name).getOrElse("N/A")
            IO.println(s"[From: $sender] => $response")
          }
        }, "reporter")

        alice <- system.actorOf(WalletActor.create("alice"), "alice-actor")
        _ <- alice ! Deposit(100, auditor.some)

        bob <- system.actorOf(WalletActor.create("bob"), "bob-actor")

        // The transaction actor does not receive any messages, it coordinates flow between two actors.
        _ <- system.actorOf[Nothing](
          TransactionActor.create("alice->bob::1", auditor, alice, bob, BigDecimal(100)), "tx-coordinator"
        )

        // Retrieve the new balances
        _ <- alice ! GetBalance(auditor)
        _ <- bob ! GetBalance(auditor)

      } yield ExitCode.Success
    }
}
```

### The Workflow: Step by Step :rocket:

1. **Initialization**: The `ActorSystem` is set up, and a `reporter` actor is created to log actions and results.
2. **Creating Wallets**: Wallet actors for Alice and Bob are created, and an initial deposit is made to Alice.
3. **Transaction Coordination**: A `TransactionActor` is created to manage the transfer of 100 units from Alice's wallet to Bob's. The coordinator sends a withdrawal request to Alice's wallet and, upon confirmation, sends a deposit request to Bob's wallet.
4. **Logging Results**: The `reporter` actor logs the balance of each wallet after the transaction is complete.

### Sample Output and Logs Explanation :log:
Below is a snapshot of what you might see when running the application, along with detailed explanations for each log entry:

```bash
[alice-actor] Deposited 100 to alice. New balance: 100.0
[From: alice-actor] => Balance(100.0)
[alice-actor] Withdrew 100 from alice. New balance: 0.0
~~~ [Tx: alice->bob::1] => Withdraw from [alice-actor] confirmed.  Depositing to [bob-actor]. ~~~
[From: alice-actor] => Balance(0.0)
[From: bob-actor] => Balance(0.0)
[bob-actor] Deposited 100 to bob. New balance: 100.0
~~~ [Tx: alice->bob::1] => Deposit to [bob-actor] confirmed.  Killing actor - transaction complete! ~~~
```

- `~~~ [Tx: alice->bob::1] => Sending withdraw request to [alice-actor].  Awaiting confirmation.  ~~~`: The transaction actor initiates the withdrawal from Alice's wallet.
- `[alice-actor] Deposited 100 to alice. New balance: 100.0`: Alice's wallet receives a deposit of 100 units.
- `[From: alice-actor] => Balance(100.0)`: The reporter logs the balance of Alice's wallet.
- `[alice-actor] Withdrew 100 from alice. New balance: 0.0`: Alice's wallet processes the withdrawal.
- `~~~ [Tx: alice->bob::1] => Withdraw from [alice-actor] confirmed.  Depositing to [bob-actor]. ~~~`: The transaction actor confirms the withdrawal and starts the deposit to Bob's wallet.
- `[From: alice-actor] => Balance(0.0)`: The reporter logs the updated balance of Alice's wallet.
- `[From: bob-actor] => Balance(0.0)`: The reporter logs the initial balance of Bob's wallet.
- `[bob-actor] Deposited 100 to bob. New balance: 100.0`: Bob's wallet receives the deposit.
- `~~~ [Tx: alice->bob::1] => Deposit to [bob-actor] confirmed.  Killing actor - transaction complete! ~~~`: The transaction actor confirms the deposit and completes the transaction.

# Conclusion :tada:
With the release of Cats-Actors 2.0.0-RC1, typed actors bring a new level of safety and clarity to actor-based programming in Scala. This example demonstrated a classic Alice-to-Bob transaction, showcasing the simplicity and effectiveness of typed actors. Whether you’re building simple applications or complex distributed systems, typed actors can help you write more reliable and maintainable code.

Try it out for yourself, and explore the possibilities that typed actors open up in your projects! :rocket:

As always, stay safe, keep hacking!
