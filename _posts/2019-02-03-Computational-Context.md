---
layout: post
title: Computation Context - Walk the Line
image: /images/context/tight.png
---

<img class="title" src="{{ site.baseurl }}/images/context/tight.jpg"/>
One question which often crops up when mentioning Functional Programming (FP) is "But what's the point of using FP? Why would I change from an Imperative Programming (IP) paradigm to FP if both solve the same class of problems?".  To the uninitiated FP represents a surface level refactor to use "newer methods" such as `map`, `flatMap` and `filter` with a sprinkle of classes such as `Option(al)` and `Either` but obviously this is not the case.  

Hopefully by this post I will motivate the move from IP to FP by going through the concept of computational context.  To illustrate this concept I will use the **Walk the Line** example presented in [Learn You A Haskell For Greater Good!](http://learnyouahaskell.com/a-fistful-of-monads#walk-the-line).  

Let's start by describing the problem.   

# Walk the line

_This example is adapted from [Learn You A Haskell For Greater Good!](http://learnyouahaskell.com/a-fistful-of-monads#walk-the-line).  All credit goes to Miran Lipovača (@bonus500).  Thank you for creating such a great and fun book and thank you for introducing me to Haskell._ 

<img class="step minimal" style="width: 280px"  src="{{ site.baseurl }}/images/context/pierre.png"/>

> Pierre has decided to take a break from his job at the fish farm and try tightrope walking. He's not that bad at it, but he does have one problem: birds keep landing on his balancing pole! They come and they take a short rest, chat with their avian friends and then take off in search of breadcrumbs. This wouldn't bother him so much if the number of birds on the left side of the pole was always equal to the number of birds on the right side. But sometimes, all the birds decide that they like one side better and so they throw him off balance, which results in an embarrassing tumble for Pierre (he's using a safety net).
> Let's say that he keeps his balance if the number of birds on the left side of the pole and on the right side of the pole is within three. So if there's one bird on the right side and four birds on the left side, he's okay. But if a fifth bird lands on the left side, then he loses his balance and takes a dive.
> We're going to simulate birds landing on and flying away from the pole and see if Pierre is still at it after a certain number of birdy arrivals and departures. For instance, we want to see what happens to Pierre if first one bird arrives on the left side, then four birds occupy the right side and then the bird that was on the left side decides to fly away.

# Imperative Attempt - Throw exceptions on failure
One way of dealing with failure in the imperative toolbox is through exceptions.  The Pierre scenario would be implemented as follows:

```scala
case class Pole(left: Int, right: Int) {
  def landLeft(n: Int): Pole = {
    assert(Math.abs((left + n) - right) <= 3)
    Pole(left + n, right)
  }

  def landRight(n: Int): Pole = {
    assert(Math.abs((right + n) - left) <= 3)
    Pole(left, right + n)
  }
}
```

Let's first visit a happy Pierre moment; one bird lands on the left :bird:, and four birds land on the right :bird: :bird: :bird: :bird:
 

```scala
val pierreIsOk = Pole(0, 0).landLeft(1).landRight(4)
println(pierreIsOk) // Pole(1, 4)
```

Can you feel the tension? Just one more bird to tumble Pierre's hopes and dreams! (which is exactly what we will do!)

```scala
try {
    pierreIsOk.landRight(1) // Pole(1, 4)
} catch {
    case _: Throwable => println("Oops Pierre tumbled!")
}
```

As imperative developers this feels normal; we do a couple of operations, sandwich things between `try`-`catch` blocks and continue processing (or throw more exceptions).  The problem here is that `landLeft` and `landRight` are dishonest about their return type in that they do not indicate potential failure.  To make matters worse, `landLeft` and `landRight` expose a fluent API which suggests that operations can be chained or sequenced again without being clear of potential failures.  Using such a "technique" one can only ensure that a function is honest by going through its code. This is definitely unfeasible in large code bases. 

# Imperative Attempt - return null
Another popular "technique" to deal with failure is by using `null`s to capture failure.  

```scala
case class Pole(left: Int, right: Int) {
  def landLeft(n: Int): Pole = {
    if (Math.abs((left + n) - right) <= 3) {
      Pole(left + n, right)
    } else null
  }

  def landRight(n: Int): Pole = {
    if (Math.abs((right + n) - left) <= 3) {
      Pole(left, right + n)
   } else null
  }
}
```

This "technique" is even more dishonest than the exception counterpart since it leads to runtime NPE. 


```scala
val pierreIsOk = Pole(0, 0).landLeft(1).landRight(4)
val pierreIsNull = pierreIsOk.landRight(1) // null
val boom = pierreIsNull.landRight(1) // NPE  
```

The problem here is again dishonesty in the return type.  The return type in this case is telling us that we should expect a `Pole` yet at times we get `null`.  Dealing with `null`s through `if`s makes our code difficult to read and does not allow us to sequence operations correctly.  `if`s break the cognitive flow and expose function internals which should not have leaked.

```scala
val pierreIsOk = Pole(0, 0).landLeft(1).landRight(4)
val pierreIsNull = pierreIsOk.landRight(1) // null
if (pierreIsNull != null) {
??? // Do other things
} else {
 pierreIsNull.landRight(1) // NPE
}
 ```

# Imperative Attempt - Ignorance is bliss
Ok, so we tried with exceptions, then we tried with `null`s but we still failed to come to a sensible solution.  How about we return the same `Pole` when the condition is unsuccessful?  

```scala
case class Pole(left: Int, right: Int) {
  def landLeft(n: Int): Pole = {
    if(Math.abs((left + n) - right) <= 3) {
      Pole(left + n, right)
    } else this
  }

  def landRight(n: Int): Pole = {
    if (Math.abs((right + n) - left) <= 3) {
      Pole(left, right + n)
    } else this
  }
}
```

Let's try this out starting with 1 bird on the left and 4 birds on the right and let one more bird land on the right hand side.  

```scala
println(pierreIsOk) // Pole(1,4)
println(pierreIsOk.landRight(1) // Pole(1, 4)
```

Great! We do not get odd exceptions or null pointers so things should be fine! Except that they are not fine.  Let's look at what happens if we chain more operations after Pierre tumbles up in the air.  

```scala
println(pierreIsOk) // Pole(1,4)
val tumbledPierre = pierreIsOk.landRight(1) // Pole(1, 4)
val whatHappened = tumbledPierre.landLeft(1).landRight(1) // Pole(2, 5)
```

Operations are still allowed to be sequenced - it's as though the context of the computation is not carried forward.  Pierre is magically back on the tight rope as if he never tumbled.  This is clearly incorrect and I'd dare say more dangerous than the other two solutions.  Here we have potential data corruption and an error which is very hard to track.  


# Functional for the win - The `Option` Context
Let's now implement Pierre's scenario using `Option` to represent the presence or absence of a `Pole`.  

```scala
object Pierre {
  type Pole = (Int, Int)

  def landLeft(bird: Int)(source: Pole): Option[Pole] = {
    val (left, right) = source
    if (Math.abs((left + bird) - right) <= 3) {
      Option((left + bird, right))
    } else Option.empty
  }

  def landRight(bird: Int)(source: Pole): Option[Pole] = {
    val (left, right) = source
    if (Math.abs((right + bird) - left) <= 3) {
      Option((left, right + bird))
    } else Option.empty
  }
}
```

Looking at the return type for `landLeft` and `landRight` we can immediately deduce that there could be potential failure; the return type is `Option[Pole]` indicating that the computation **may have** a `Pole` rather than **there will always be** a `Pole`.  Ok, so we used `Option`, bravo! :neckbeard: but what's the big deal?  What we gain with `Option` is a computational context in which a set of operations can be sequenced.  To understand the difference let's sequence the same bird landings and observe what happens


```scala
val result = for {
    pierreOk <- Pole(1, 4).pure[Option] // Some(Pole(1, 4))
    pierreFall <- pierreOk.landRight(1) // Empty
    willPierreResurrect <- pierreFall.landLeft(1) // Empty 
    result = willPierreResurrect.landRight(1) // Empty
} yield resultpierreOk.landRight(1)  // Empty
```

In this case, the value of `result` is `Empty` rather than `Some(Pole(2, 5))`.  The `Option` "remembers" that an operation has failed - `pierreOk.landRight(1)` - and carries this forward.  Once a computation evaluates to an `Empty` value, all further computations will yield an `Empty` value.  Pretty cool huh? So in the functional equivalent, we gain honesty of types and we also create a safe context in which operations can be sequenced.  

# Conclusion 
In this post we have outlined the journey of Pierre as a tight rope enthusiast and have simulated his scenario using both the imperative and functional paradigm.  Through the use of FP we have managed to sequence birds landing safely and to make a more honest API.  Hopefully this can motivate some of you to get interested in FP.  Stay safe and keep hacking!
