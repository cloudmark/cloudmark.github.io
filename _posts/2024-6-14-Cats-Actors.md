---
layout: post
title: A Logic Circuit Simulator with Cats-Actors
image: /images/cats-actors/logo-small.png
---

<img class="title" src="{{ site.baseurl }}/images/cats-actors/logo-small.png"/>
Functional programming and the actor model are two powerful paradigms in modern software development. They might seem like they're in opposition, but in reality, they complement each other beautifully. Scala, as a versatile language, allows multiple paradigms to coexist, and Cats-Actors, a functional programming-based actor system, exemplifies this harmony. Cats-Actors is a reimagining of the actor paradigm model married with the functional paradigm.

Imagine you're working at ACME Inc., where your task is to create a logic circuit verifier to ensure the reliability of their motherboards. These motherboards will be used in a mission to launch cats into space, and no one wants these feline astronauts to be at risk. You've been tasked with developing a logic circuit simulator that accounts for the internal delays of digital circuits, ensuring that all signals stabilize on each clock tick. We certainly don’t want a motherboard with AND gates still transitioning when it’s time to read the values. So, gear up, and let's embark on this Cats-Actors adventure to build a robust logic circuit simulator and ensure those kittens have a safe sendoff!

## Setting Up Your Project

To get started with Cats-Actors, you need to set up your Scala project with the necessary dependencies. Add the
following to your `build.sbt` file:

```scala
resolvers += "JitPack" at "https://jitpack.io"

libraryDependencies += "com.github.suprnation" % "cats-actors_2.13" % "1.0.1"
```

> For a complete listing of all code samples and to clone the project, visit the [GitHub repository](https://github.com/cloudmark/cats-actor-sample).

# Understanding the Actor Model
Before we dive into building our logic circuit simulator, let’s take a moment to understand the actor model. Imagine
actors as independent workers in a factory. Each worker has their own tasks and responsibilities, and they communicate
with each other by passing messages. This setup ensures that no one is stepping on anyone else's toes, making it easier
to build systems that are both concurrent and fault-tolerant.

In the Cats-Actors framework, these actors get an extra boost from functional programming principles. This means our
actors will use immutable data and pure functions, making our system more predictable and easier to maintain.

So, what can actors do in this model?

1. **Send Messages**: Just like sending a text, actors communicate by sending messages to each other. Each actor has a
   mailbox where it receives these messages.
2. **Create Actors**: Need more hands on deck? Actors can create new actors to help with tasks.
3. **Change Behavior**: Actors can switch up their behavior based on the messages they get, allowing them to adapt to
   different situations.

By combining the actor model with functional programming, we get the best of both worlds. This synergy helps us build
systems that are robust, scalable, and easy to maintain.

# Building Our Logic Circuit Simulator
In this section, we'll start building the core components of our logic circuit simulator using Cats-Actors. Our goal is to construct various logic gates and combine them to simulate complex circuits. Let's break down the components and build them step by step.

First, we'll start by creating the Wire actor, which will transport signals. After that, we'll create basic logic gates like AND, OR, and an alternative OR gate using De Morgan's laws. We'll then combine these gates into more complex components such as Half Adders and Full Adders, and finally, we'll build Demultiplexers.

Ready? Let's dive in.

## 1. Creating the Wire Actor
The Wire actor is responsible for transporting signals, which can be either true (high voltage) or false (low voltage). It allows component actors to subscribe to state changes and notifies them whenever its state changes.

Here's the code for the Wire actor:
```scala
def wire(_currentState: Boolean): IO[Actor[IO]] = {
      for {
        associationsRef <- Ref[IO].of(Map.empty[ActorRef[IO], String])
        currentStateRef <- Ref[IO].of(_currentState)
      } yield new Actor[IO] {
        override def receive: Receive[IO] = {
          case AddComponent(name: String, b: ActorRef[IO]) =>
            for {
              _ <- associationsRef.update(_ + (b -> name))
              currentState <- currentStateRef.get
              _ <- b ! StateChange(name, currentState)
            } yield ()

          case GetValue => currentStateRef.get

          case s: Boolean =>
            currentStateRef.get.map(_ != s).ifM(
              for {
                currentState <- currentStateRef.updateAndGet(_ => s)
                associations <- associationsRef.get
                _ <- associations.toList.parTraverse_ { 
                  case (ref: ActorRef[IO], name: String) =>
                     ref ! StateChange(name, currentState)
                }
              } yield (),
              IO.unit
         )
     }
   }
}
```
In this code, the Wire actor maintains its current state (`currentState`) and a map of associations where each entry maps a subscribing actor to a wire name. When it receives an `AddComponent` message, it adds the subscribing actor to its associations and sends the current state to the subscriber. When it receives a boolean value, it updates its state and notifies all subscribed components if the state has changed. Broadcasting state changes to all associations is done in parallel using `parTraverse_`.

# 2. Creating the Basic Logic Gates
Now, let's move on to creating the logic gates. We'll start with the NOT gate (Inverter). The Inverter actor will take an input and output the inverted result after a delay.

Here’s the code for the Inverter actor:

```scala
def inverter(input: ActorRef[IO], output: ActorRef[IO]): Actor[IO] = new Actor[IO] {
  override def preStart: IO[Unit] = {
    input ! AddComponent("in", self)
  }

  override val receive: Actor.Receive[IO] = {
    case StateChange(_, s: Boolean) =>
      (IO.sleep(inverterDelay) >> (output ! (!s))).start
  }
}
```

The `inverter` actor registers itself with the input wire, receiving updates under the name "in". When it receives a state change, it waits for the inverter delay before sending the inverted signal to the output. This process is run in the background using `start`, allowing the actor to continue processing other messages.

Next, we’ll create the AND gate. The And actor will take two inputs and output the result of their AND operation.

Here’s the code for the And actor:

```scala
def and(input0: ActorRef[IO], input1: ActorRef[IO], output: ActorRef[IO]): IO[Actor[IO]] = {
  for {
    in0 <- Ref[IO].of[Option[Boolean]](None)
    in1 <- Ref[IO].of[Option[Boolean]](None)
  } yield new Actor[IO] {
    override def preStart: IO[Unit] = {
      (input0 ! AddComponent("in0", self), 
       input1 ! AddComponent("in1", self)).parTupled.void
    }

    override val receive: Actor.Receive[IO] = {
      case StateChange("in0", b: Boolean) => in0.set(b.some) >> sendMessage.start
      case StateChange("in1", b: Boolean) => in1.set(b.some) >> sendMessage.start
    }

    private val sendMessage: IO[Unit] =
      (in0.get, in1.get).flatMapN {
        case (Some(first), Some(second)) =>
          IO.sleep(andDelay) >> (output ! (first && second))
        case _ => IO.unit
      }
  }
}
```

The AND actor listens for state changes from its two input wires. When either input changes, it checks if both inputs are true and sends the result to the output wire after a specified delay (`andDelay`). Note how the state changes are run in the background using `start`.

Similarly, we can create the OR actor, which outputs true if at least one input is true.

```scala
def or(input0: ActorRef[IO], input1: ActorRef[IO], output: ActorRef[IO]): IO[Actor[IO]] = {
  for {
    in0 <- Ref[IO].of[Option[Boolean]](None)
    in1 <- Ref[IO].of[Option[Boolean]](None)
  } yield new Actor[IO] {
    override def preStart: IO[Unit] = {
      (input0 ! AddComponent("in0", self), 
      input1 ! AddComponent("in1", self)).parTupled.void
    }

    override val receive: Actor.Receive[IO] = {
      case StateChange("in0", b: Boolean) => in0.set(b.some) >> sendMessage.start
      case StateChange("in1", b: Boolean) => in1.set(b.some) >> sendMessage.start
    }

    private def sendMessage: IO[Unit] = {
      (in0.get, in1.get).flatMapN {
        case (Some(first), Some(second)) =>
          IO.sleep(orDelay) >> (output ! (first || second))
        case _ => IO.unit
      }
    }
  }
}
```

The Or actor’s logic is very similar to the And actor’s logic. It registers with the input wires, listens for state changes, and sends the result to the output wire after the specified delay.

We can notice many commonalities between the And and Or actors. To eliminate redundancy, we can create a higher-order actor called `reducer`, which takes a reduction function and a delay as parameters. This actor will generalize the logic for creating gates with two inputs and one output.

Here’s the code for the `reducer`:

```scala
def reducer(reduceFn: (Boolean, Boolean) => Boolean, delay: Duration)
            (input0: ActorRef[IO],input1: ActorRef[IO], 
            output: ActorRef[IO]
): IO[Actor[IO]] = {
  for {
    in0 <- Ref[IO].of[Option[Boolean]](None)
    in1 <- Ref[IO].of[Option[Boolean]](None)
  } yield new Actor[IO] {
    override def preStart: IO[Unit] =
      (input0 ! AddComponent("in0", self), 
      input1 ! AddComponent("in1", self)).parTupled.void

    override val receive: Actor.Receive[IO] = {
      case StateChange("in0", b: Boolean) => in0.set(b.some) >> sendMessage.start
      case StateChange("in1", b: Boolean) => in1.set(b.some) >> sendMessage.start
    }

    private def sendMessage: IO[Unit] = {
      (in0.get, in1.get).flatMapN {
        case (Some(first), Some(second)) =>
          IO.sleep(delay) >> (output ! reduceFn(first, second))
        case _ => IO.unit
      }
    }
  }
}
```

Using this higher-order function, we can rewrite the AND and OR gates as follows:

```scala
val and = reducer(_ && _, andDelay)(_, _, _)
val or = reducer(_ || _, orDelay)(_, _, _)
```

This approach keeps the logic for the AND and OR gates intact while reducing redundancy.

Next, let's create an alternative implementation of the OR gate using De Morgan's laws, which, given the timings, will be more efficient. Chip manufacturers often specialize in certain gates to reduce production costs and make those gates super efficient. Other gates can be formed using De Morgan's laws or truth table deductions. According to De Morgan's laws:

$$
\begin{eqnarray*}
A \lor B &=& \neg(\neg A \land \neg B)
\end{eqnarray*}
$$

By using this transformation, we can create the `OrAlt` actor:

```scala
def orAlt(input0: ActorRef[IO], input1: ActorRef[IO], output: ActorRef[IO]): Actor[IO] =
  new Actor[IO] {
    override val preStart: IO[Unit] = for {
      notInput0 <- context.actorOf(PropsF[IO](wire(false)), "notInput0")
      notInput1 <- context.actorOf(PropsF[IO](wire(false)), "notInput1")
      notOutput0 <- context.actorOf(PropsF[IO](wire(false)), "notOutput0")

      _ <- context.actorOf(Props[IO](inverter(input0, notInput0)), "A")
      _ <- context.actorOf(Props[IO](inverter(input1, notInput1)), "B")
      _ <- context.actorOf(PropsF[IO](and(notInput0, notInput1, notOutput0)), "notAB")
      _ <- context.actorOf(Props[IO](inverter(notOutput0, output)), "notNotAB")
    } yield ()
  }
```

In the OrAlt actor, we first invert both inputs, then AND these inverted inputs, and finally invert the result. This approach leverages the efficiency of De Morgan's laws to potentially reduce the overall computation time, especially in complex circuits.

> Note how we are now dealing at a higher level of abstraction – we focus on the logical connections between components rather than the internal workings of the actors. A typical approach in the typelevel community is using FS2 and managing these wirings manually. Achieving the same level of abstraction with FS2 can be more challenging. This isn't to say FS2 is inferior, but Cats-Actors can simplify dynamic graph constructions and modifications at runtime, particularly when handling dynamic stream graphs.

By using De Morgan's transformation, we can optimize the OR gate, which typically has a delay of 10ms. In this alternative implementation, we use a NOT gate on each input, an AND gate to combine these negated inputs, and another NOT gate on top of everything. Given that all these components run in parallel, we would have a total delay of only 3ms from the input perturbations, significantly improving efficiency.


# 3. Creating More Complex Components

Now that we have created basic logic gates, let's move on to combining these gates into more complex components. We'll start with the Half Adder. A Half Adder is a digital circuit that performs addition of two binary digits. It has two inputs, `a` and `b`, and two outputs, `s` (sum) and `c` (carry). The sum output is the XOR of the inputs, and the carry output is the AND of the inputs.

Here’s the code for the Half Adder:

```scala
def halfAdder(a: ActorRef[IO], b: ActorRef[IO], s: ActorRef[IO], c: ActorRef[IO]): Actor[IO] = {
  new Actor[IO] {
    override val preStart: IO[Unit] = for {
      d <- context.actorOf(PropsF[IO](wire(false)), "d")
      e <- context.actorOf(PropsF[IO](wire(false)), "e")
      _ <- context.actorOf(PropsF[IO](or(a, b, d)), "Or")
      _ <- context.actorOf(PropsF[IO](and(a, b, c)), "And")
      _ <- context.actorOf(Props[IO](inverter(c, e)), "Inverter")
      _ <- context.actorOf(PropsF[IO](and(d, e, s)), "And2")
    } yield ()
  }
}
```

The Half Adder actor uses our previously defined gates to create the sum and carry outputs. It uses an OR gate, an AND gate, and an inverter to achieve this.

Next, let’s create the Full Adder, which adds three binary digits (two significant bits and a carry bit). The Full Adder outputs a sum and a carry. We’ll use two Half Adders and an OR gate to construct the Full Adder:

```scala
def fullAdder(a: ActorRef[IO], b: ActorRef[IO], cin: ActorRef[IO], sum: ActorRef[IO], cout: ActorRef[IO]): Actor[IO] = new Actor[IO] {
    override val preStart: IO[Unit] = for {
        s <- context.actorOf(PropsF[IO](wire(false)))
        c1 <- context.actorOf(PropsF[IO](wire(false)))
        c2 <- context.actorOf(PropsF[IO](wire(false)))
        _ <- context.actorOf(Props[IO](halfAdder(a, cin, s, c1)), "HalfAdder1")
        _ <- context.actorOf(Props[IO](halfAdder(b, s, sum, c2)), "HalfAdder2")
        _ <- context.actorOf(PropsF[IO](or(c1, c2, cout)), "OrGate")
    } yield ()
}
```

By leveraging the Half Adder, the Full Adder actor becomes simpler and more modular. This demonstrates the power of building higher-order components from simpler ones, enhancing our digital circuit simulation capabilities.

Next, let's build a 2-to-1 Demultiplexer (Demux2), which directs an input signal to one of the two output lines based on a control signal. Here’s the code for Demux2:

```scala
def demux2(in: ActorRef[IO], c: ActorRef[IO], out1: ActorRef[IO], out0: ActorRef[IO]): Actor[IO] = new Actor[IO] {
    override val preStart: IO[Unit] = for {
        notC <- context.actorOf(PropsF[IO](wire(false)), "not")
        _ <- context.actorOf(Props[IO](inverter(c, notC)), "InverterA")
        _ <- context.actorOf(PropsF[IO](and(in, notC, out1)), "AndGateA")
        _ <- context.actorOf(PropsF[IO](and(in, c, out0)), "AndGateB")
    } yield ()
}
```
Finally, let’s create a General Demultiplexer (Demux), which can handle multiple control signals and direct the input signal to one of the output lines. The Demux actor uses recursion to handle multiple control signals, dynamically creating a demux of any size by wiring Demux2 actors together. This approach illustrates the flexibility and power of combining actors and functional programming in Cats-Actors. Here's the code for Demux:

```scala
def demux(in: ActorRef[IO], c: List[ActorRef[IO]], out: List[ActorRef[IO]]): Actor[IO] = new Actor[IO] {
    override val preStart: IO[Unit] = c match {
        case c_n :: Nil =>
            context.actorOf(Props[IO](demux2(in, c_n, out.head, out(1)))).void

        case c_n :: c_rest =>
            for {
                out1 <- context.actorOf(PropsF[IO](wire(false)))
                out0 <- context.actorOf(PropsF[IO](wire(false)))
                _ <- context.actorOf(Props[IO](demux2(in, c_n, out1, out0)))
                _ <- context.actorOf(Props[IO](demux(out1, c_rest, out.take(out.size / 2))))
                _ <- context.actorOf(Props[IO](demux(out0, c_rest, out.drop(out.size / 2))))
            } yield ()

        case Nil => IO.unit
    }
}
```

Note how we can create a demux of any size by recursively wiring Demux2 actors. This exemplifies the power of Cats-Actors, allowing us to use actors and functional programming in unison, and even employ recursion to create dynamic structures.

> One key advantage of Cats-Actors is its ability to create dynamic stream graphs without needing to manage the intricate details of wiring these streams manually. Cats-Actors is particularly beneficial when dealing with dynamic graphs of streams that need to be constructed or modified at runtime. This approach simplifies the development of dynamic, evolving systems, making it an excellent choice for complex and adaptable applications.


# Putting It All Together
Now, let's put all our components together and create a Logic Circuit Simulator. This main application will set up a simulation board to test a demultiplexer with two control inputs and four outputs.

Here's the complete code for the Logic Circuit Simulator:
```scala
object LogicCircuitSimulator extends IOApp {
  override def run(args: List[String]): IO[ExitCode] = {
    ActorSystem[IO]("De-multiplexer Board Simulator").use(system =>
      for {
        in1 <- system.actorOf(PropsF(wire(false)), "in1")
        c1 <- system.actorOf(PropsF(wire(false)), "c1")
        c2 <- system.actorOf(PropsF(wire(false)), "c2")
        out1 <- system.actorOf(PropsF(wire(false)), "out1")
        out2 <- system.actorOf(PropsF(wire(false)), "out2")
        out3 <- system.actorOf(PropsF(wire(false)), "out3")
        out4 <- system.actorOf(PropsF(wire(false)), "out4")

        allActors = List(in1, c1, c2, out1, out2, out3, out4)
        printTruthTable =
          for {
            outputs <- allActors.parTraverse(_ ?[Boolean] GetValue)
            result = allActors.zip(outputs).map {
              case (actor, value) => s"${actor.path.name}::$value"
            }.mkString("\t")
            _ <- IO.println(result)
          } yield ()

        _ <- system.actorOf(Props(demux(in1, List(c2, c1), List(out4, out3, out2, out1))))

        _ <- in1 ! true
        _ <- printTruthTable.delayBy(1 second)

        _ <- c1 ! true
        _ <- printTruthTable.delayBy(1 second)

        _ <- c1 ! false
        _ <- c2 ! true
        _ <- printTruthTable.delayBy(1 second)

        _ <- c1 ! true
        _ <- printTruthTable.delayBy(1 second)

        _ <- in1 ! false
        _ <- printTruthTable.delayBy(1 second)
      } yield ()
    ).as(ExitCode.Success)
  }
}
```
In the main application, we first set up the board simulator to test a demultiplexer with two control inputs and four outputs. We create all the necessary wires for the input, control, and output signals. Notice how elegant it is to query all actors to retrieve their values in parallel using `allActors.parTraverse(_ ?[Boolean] GetValue)`.

We then create the demultiplexer, which routes the input signal based on the control signals. For instance, when we set `in1` to `true`, we expect `out4` to be `true`. Similarly, we can change the control signals `c1` and `c2` and observe the expected outputs. This dynamic manipulation and observation of the circuit's state showcase how state changes propagate through the circuit and how the outputs change accordingly.

By printing the truth table, the program shows the state of all wires at each step, demonstrating the robustness and efficiency of our logic circuit simulator built with Cats-Actors. This powerful approach allows us to dynamically create and modify our circuit, demonstrating the harmony between functional programming and the actor model in Cats-Actors.


# Conclusion
In this tutorial, we've explored the synergy between the actor model and functional programming by building a robust logic circuit simulator using Cats-Actors. We've created basic components like wires and logic gates, and combined them into more complex structures such as half adders, full adders, and demultiplexers. Through this process, we've demonstrated how Cats-Actors enables us to build dynamic, reliable systems with ease.

The power of Cats-Actors lies in its ability to manage concurrency and state in a highly predictable and maintainable manner. By leveraging functional programming principles, we've shown how to create a system that is both scalable and fault-tolerant. This approach simplifies the development of complex, evolving systems, making it an excellent choice for various applications.

If you're interested in learning more or contributing to the project, check out the [Cats-Actors GitHub repository](https://github.com/suprnation/cats-actors). This repository contains comprehensive documentation and additional examples to help you get started with building your own actor-based systems.

As always, stay safe, keep hacking!

