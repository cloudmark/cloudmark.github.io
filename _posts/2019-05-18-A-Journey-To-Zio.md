---
layout: post
title: Performant Functional Programming to the max with ZIO
image: /images/zio/zio.png
---

<img class="title" src="{{ site.baseurl }}/images/zio/zio.png"/> I have been doing functional programming for quite some time in the small - `map`, `filter`, `flatMap`, `for` comprehensions, catz etc.  While I was sold on the great benefits of FP I've struggled to transition to doing FP in the large without hitting runtime overheads.  This is where [ZIO](https://github.com/scalaz/scalaz-zio) comes in the picture.  ZIO makes programming in the large simple and provides the ability to interop with other parts of the broader functional ecosystem.  In this blog post I will describe a fictitious business problem, implement it in an imperative way and rewrite the application in a functional "equivalent" using ZIO.

# Acme Corp
Acme Corporation is a company that sells a variety of items - for a full catalogue [click here ](http://www.acme.com/catalog/acme.html).  Customers log in via their email address and order products.  Wile E. Coyote, the Product Owner, also wants customers to be able to retrieve a summary of their product purchases via their email address.

Throughout our code samples, we will model our domain using these case classes: `User`, `Product` and `PurchaseHistory`.  `User` represents a logged in user, `Product` represents a purchased product and `PurchaseHistory` represents the product purchase summary for a logged in user.

```scala
case class User(id: Long, email: String, name: String)
case class Product(id: Long, description: String)
case class PurchaseHistory(email: String, name: String, purchases: List[Product])
```


# Imperative Solution
Wile's product vision can be implemented imperatively as follows


```scala
object ImperativeApp {
  private[this] def getProductsForUser(userId: Long): List[Product] = {
    userId match {
      case 1 => List(Product(1L, "Bird Seeds"), Product(2L, "Artificial Rock"))
      case _ => List.empty[Product]
    }
  }

  private[this] def searchUserAccount(email: String): User = {
    email match {
      case "wile@acme.com" => User(1L, "wile@acme.com", "Will")
      case _ =>
        Logger.log(s"User $email is not in the database")
        throw new RuntimeException("User not found!")
    }
  }

  def getAllUserData(email: String): PurchaseHistory = {
    Logger.log(s"Searching For User Account $email")
    val user = searchUserAccount(email)
    val products = getProductsForUser(user.id)
    PurchaseHistory(user.email, user.name, products)
  }
}
```

The method `getAllUserData` is a method which given a user's email address will first search for the user in the Acme database - `searchUserAccount` - and if present, loads all the purchased products for the user - `getProductsForUser`. We can run our program as follows


```scala
def main(args: Array[String]): Unit = {
  try {
    val PurchaseHistory = getAllUserData("wile@acme.com")
    Logger.log(s"Retrieved $PurchaseHistory")
  } catch {
    case e: Throwable => Logger.log(s"Error Occurred $e")
  }
}
```

Note that we have to wrap our calls with a `try/catch`, because our implementation throws exceptions.  Try `beepbeep@acme.com` and see what happens - as always Acme products explode! :boom: :fire:


# What's the problem doc?
Imperative programming is all about procedures.  Procedures are

- **Partial** - Procedures do not return values for some inputs (e.g. at times they throw exceptions).
- **Non-Deterministic** - Procedures return different outputs for the same input. This typically implies share state.
- **Impure** - Procedures perform side-effects which mutate data or interact with the outside world.

In the imperative implementation, `searchUserAccount` is partial and impure. Partial since it throws exceptions for any email which is not `wile@acme.com` and impure since it interacts with the logging environment which can have additional side-effects (e.g. transfer logs to a remote server). Compare this with `getProductsForUser` which is total (not partial), deterministic and pure.

Imperative programs are harder to reason about since it is impossible to determine from the signature what is happening inside.  In the implementation above, `searchUserAccount` declares that it always returns a `User` given an `email` which is clearly not the case.


Functional programming is all about pure functions.  Pure functions have three properties:

- **Total** - Return a value for every possible input.
- **Deterministic** - Return the same value for the same input.
- **Inculpable** - No (direct) interactions with the world or program state.

Together these properties give us an incredible ability to reason about programs. [Functional Programming for Mortals](https://leanpub.com/fpmortals) is an excellent resource if you are interested in learning further about the benefits of these properties.   Let's see how we can refactor our program to get these desired properties.

# Modelling Effects with Monad Transformers
One approach which has been recommended in Scala community is to model such problems using [Monad Transformers](http://book.realworldhaskell.org/read/monad-transformers.html).  I'm including this technique in this blog for one reason - **to avoid it!** This technique should be avoided since it leads to slow performance and large heap-churns.  _If you are using Monad Transformers today please stop and read on [Effect Rotation](http://degoes.net/articles/rotating-effects).  Note that this technique is still better than imperative, so if you are using this technique today in production don't despair! (I'm in that spot exactly)_

Let's look at the update program


```scala
type Error = String
type Log = Vector[String]

object MonadTransformerApp {
  private[this] def getProductsForUser(userId: Long):
    SourcedEitherT[Log, Error, List[Product]] = {
    userId match {
      case 1 => List(Product(1L, "Bird Seeds"), Product(2L, "Artificial Rock")).pureT
      case _ => List.empty[Product].pureT
    }
  }

  private[this] def searchUserAccount(email: String):
    SourcedEitherT[Log, Error, User] = {
    email match {
      case "wile@acme.com" => User(1L, "wile@acme.com", "Will").pureT
      case _ => for {
        _ <- Vector(s"User $email is not in the database").logT
        error <- "User not in our database.  ".raiseT[Log, User]
      } yield error
    }
  }

  def getAllUserData(email: String):
    SourcedEitherT[Log, Error, PurchaseHistory] = {
    for {
      _ <- Vector(s"Searching For User Account $email").logT
      user <- searchUserAccount(email)
      _ <- Vector(s"Searching For Products For Account $email").logT
      products <- getProductsForUser(user.id)
    } yield PurchaseHistory(user.email, user.name, products)
  }
}
```


So what's the advantage? Well for one our functions are pure; they are total, deterministic and inculpable.  As an example `searchUserAccount` now always returns a value (could be an error value) and does not interact directly with the log environment.

In contrast to our previous implementation the types here are honest e.g.

```scala
private[this] def searchUserAccount(email: String): SourcedEitherT[Log, Error, User]
```

The above declares that the function will log via a `Writer` of type `Log` and return an `Error` on failure  or a `User` on success. Such honesty allows us to reason clearly about our business logic and refactor with confidence.  Additionally, this new implementation avoids throwing and catching exceptions which is broken in async environments.

For completeness I'm including the details of the `SourcedEitherT` stack together with the helper functions used.  Seriously though, don't try this at home (or work)!

```scala
type SourcedEitherT[Raw, Err, Value] = EitherT[Writer[Raw, ?], Err, Value]
type Error = String
type Log = Vector[String]

// Monad Transforms are painful!
implicit class SourcedEitherSyntax[A](a: A) {
  def logT[Err]: EitherT[Writer[A, ?], Error, Unit] = EitherT[Writer[A, ?], Error, Unit](Writer(a, ().asRight[Error]))

  def pureT[Log, Err](implicit evidence: Monoid[Log]): EitherT[Writer[Log, ?], Error, A] = EitherT[Writer[Log, ?], Error, A](Writer(Monoid[Log].empty, a.asRight[Error]))

  def raiseT[Log, Result](implicit evidence: Monoid[Log]): EitherT[Writer[Log, ?], A, Result] = EitherT[Writer[Log, ?], A, Result](Writer(Monoid[Log].empty, a.asLeft[Result]))
}
```


# Modelling Effects with ZIO
So a couple of weeks back I was happy coding away using Monad Stacks! Then ZIO happened! ZIO uses _horizontal effects_ - Effect Rotation - instead of _vertical effects_ which allow us to create functional code without the undesired runtime overheads. Additionally the ZIO version is concurrent-safe which means that we can freely mix concurrent / parallel operations.  Thank you [@jdegoes](https://twitter.com/jdegoes) for explaining this technique. Let's update the code


```scala
object ZIOApp {
  private[this] def getProductsForUser(userId: Long): MyZIO[Log, Error, List[Product]] =
    userId match {
      case 1 => ZIO.succeed(List(Product(1L, "Bird Seeds"), Product(2L, "Artificial Rock")))
      case _ => ZIO.succeed(List.empty[Product])
    }

  private[this] def searchUserAccount(email: String): MyZIO[Log, Error, User] =
    email match {
      case "wile@acme.com" => ZIO.succeed(User(1L, "wile@acme.com", "Will"))
      case _ => log(s"User $email is not in the database") *> ZIO.fail("User not in our database.")
    }

  def getAllUserData(email: String): MyZIO[Log, Error, PurchaseHistory] =
    for {
      _         <- log(s"Searching For User Account $email")
      user      <- searchUserAccount(email)
      _         <- log(s"Searching For Products For Account $email")
      products  <- getProductsForUser(user.id)
    } yield PurchaseHistory(user.email, user.name, products)

}
```

where `MyZIO` and the other helper methods are defined as

```scala
trait Writer[W] {
  def writer: Ref[Vector[W]]
}

// Writer helpers:
def log[W](w: W): ZIO[Writer[W], Nothing, Unit] = ZIO.accessM[Writer[W]](_.writer.update(vector => vector :+ w)).unit
def getLogs[W]: ZIO[Writer[W], Nothing, Vector[W]] = ZIO.accessM[Writer[W]](_.writer.get)
def clearLogs[W]: ZIO[Writer[W], Nothing, Unit] = ZIO.accessM[Writer[W]](_.writer.set(Vector()))

// Types and Helpers
type MyZIO[W, E, A] = ZIO[Writer[W], E, A]
```


ZIO helps us create descriptions of what our program should do (rather than do it!).  Describing what a program should instead of doing it is powerful, extremely powerful.  To illustrate why, let's update our program to handle a flaky connection with the database when searching for the user account - `searchUserAccount`.


```scala
def getAllUserData(email: String): MyZIO[Log, Error, PurchaseHistory] =
    for {
      _         <- log(s"Searching For User Account $email")
      user      <- searchUserAccount(email).retry(Schedule.recurs(10))
      _         <- log(s"Searching For Products For Account $email")
      products  <- getProductsForUser(user.id)
    } yield PurchaseHistory(user.email, user.name, products)
```

That's it! Our program will now retry the `searchUserAccount` 10 times before failing.  There are more powerful combinators in the ZIO library which allow us to compose and modify program descriptions.

So, how do we run these descriptions? ZIO comes packaged with a `DefaultRuntime` which takes a pure program description and executes its effects onto the world via the `unsafeRun` method.


```scala
def main(args: Array[String]): Unit = {
  val runtime = new DefaultRuntime{}

  val program = for {
    _                   <- getAllUserData("wile@acme.com")
    logForValidSearch   <- getLogs[String]
    _                   <- console.putStrLn(logForValidSearch.mkString("\n"))
  } yield ()

  runtime.unsafeRun(for {
    wref    <- Ref.make[Vector[String]](Vector())
    result  <- program.provide(new console.Console.Live with Writer[String] { def writer = wref  })
  } yield result)
}
```


# Conclusion
In this post we have looked at how we can convert an imperative program into a pure functional "equivalent" using two techniques; Monad Transformers and Effect Rotation (via ZIO).  ZIO is more than just an Effect Rotation implementation.  ZIO is a library for asynchronous and concurrent programming powered by highly-scalable, non-blocking fibers that never waste or leak resources.  ZIO will be one of the most influential libraries in the functional ecosystem. The community is also super helpful and welcoming.  Get started today - head over the [project microsite](https://scalaz.github.io/scalaz-zio/) and the [gitter channel](https://gitter.im/ZIO/Core).  As always...stay safe and keep hacking!