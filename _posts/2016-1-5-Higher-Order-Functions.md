---
layout: post
title: Higher Order Functions in Practice 
image: /images/lambda.jpg
---

<img class="title" src="{{ site.baseurl }}/images/lambda.jpg"/>
One of the best features that Javascript has to offer is that it treats functions as **first class** citizens.  In fact one could argue (without causing a huge flame war) that Javascript is to date, one of the most widespread functional language.  In this post I will explain what a higher order function is and illustrate how we can make use of higher order functions to simplify our code. 

# Summing things up! 
Imagine you are given the task of writing a function which computes the sum of integers between `a` and `b` (inclusive).  You open up your favourite editor (vim!) and quickly write the `sumInts` function using recursion as follows:

```javascript
function sumInts(a, b){
  return (a > b) ? 0: a + sumInts(a+1, b);
}
```

Now you are given the task of writing a function which computes the sum of the **cube** of all integers between `a` and `b`.  Using a similar approach you write the following:

```javascript
function cube(a){
  return a * a * a;
}
function sumCubes(a, b){
  return (a > b) ? 0: cube(a) + sumCubes(a+1, b)
}
```

Now you are given the task of writing the sum of the **factorials** of all integers between `a` and `b`.  So you write the following funciton: 

```javascript
function factorial(x){
  return (x==0) ? 1 : x * factorial(x - 1);
}
function sumFactorials(a, b){
  return (a > b) ? 0: factorial(a) + sumFactorials(a+1, b)
} 
```

Now you are given ... well you get the point. Looking closely at `sumInts`, `sumCubes`, and `sumFactorials` you can observe that they have the same form. 

```javascript
function sum(a, b){
  return (a > b) ? 0: <action>(a) + sum(a+1, b)
} 
``` 

In mathematics we can express the three problems above as special cases of: 

$$\sum_{x=a}^{b}f(x)$$

In mathematics we do not write down three different \\(\sum\\) functions but instead we concentrate on the different values of \\(f\\).  Using **higher order functions** we can express the \\(\sum\\) function as follows:  

```javascript
function sum(f, a, b) {
 return (a > b) ? 0: f(a) + sum(f, a + 1, b);
} 
```

The parameter `f` is a placeholder for an action that we want to perform.  You can think of `f` as a mini program that will be executed when `f(a)` is called. 

<div class="note">
A function which operates on other functions either by taking them in as <b>arguments</b> or by <b>returning</b> a function, is called a <b>higher order function</b>. Higher order functions allow a program to abstract actions; in this case we are abstracting the action we want to perform on each individual element within the range.  
</div>



Having created the higher order funciton `sum` we can now write `sumInts`, `sumCubes` and `sumFactorials` as follows: 

```javascript
function sum(f, a, b) {
 return (a > b) ? 0: f(a) + sum(f, a + 1, b);
}
function sumInts(a, b) { 
  function id(x) {return x;}
  return sum(id, a, b);
}
function sumCubes(a, b) {  
  return sum(cube, a, b); 
}
function sumFactorials(a, b) {
  return sum(factorial, a, b);
}
```       
# Anonymous Functions
Passing functions as parameters leads to the creation of many small functions.   This is tedious and is not something we do with other value types.  Let us for example consider how we would implement a simple "hello world" in Javascript.   One could implement it as follows: 

```javascript
var s = "hello world!"; 
console.log(s);
```

but this is not natural, what we normally do is **inline** the string in the function call

```javascript 
console.log("hello world!");
``` 

Anaolgously, we can create function literals which let us inline functions without giving them a name.  These are called **anonymous functions**. Using this technique we can write the `sumInts` and `sumCubes` as follows: 

``` javascript
function sum(f, a, b) {
 return (a > b) ? 0: f(a) + sum(f, a + 1, b);
}
function sumInts(a, b) { 
  return sum(function (x) {return x;}, a, b);
}
function sumCubes(a, b) {  
  return sum(function (x) {return x * x * x;}, a, b); 
}
```      
<div class="warning">
Since <code>sumFactorial</code> makes use of the <code>factorial</code> function which is recursive we cannot write it down using an <b>anonymous functions</b> (or at least not as succinctly).  Be careful not to go overboard with anonymous functions; only use them when necessary. 
</div>

# Parameter Groups
Look closely at the function definitions we just defined. 

```javascript
function sumInts(a, b) { 
  return sum(function (x) {return x;}, a, b);
}
function sumCubes(a, b) {  
  return sum(function (x) {return x * x * x;}, a, b); 
}
function sumFactorials(a, b) {
  return sum(factorial, a, b);
}
```
Parameters `a` and `b` are passed unchanged from the `sumInts`, `sumCubes` and `sumFactorials` into `sum`.  Can we get rid of this redundancy? Again we will make use of higher order functions to solve this problem as follows:  

```javascript
function sum(f) {
  return function(a, b) {
    return (a > b) ? 0: f(a) + sum(f)(a + 1, b); 
  };
}
```
The `sum` funciton is now returning back a function which takes parameters `a` and `b`.  Think of the `sum` function as a function which takes two parameter groups; the first parameter group takes in the action `f` and the second parameter group takes in the range [`a`, `b`].  Using this approach we can now simplify further the `sumInts`, `sumCubes` and `sumFactorials` as follows: 

```javascript
var sumInts = sum(function(x){return x;});
var sumCubes =  sum(function(x){return x * x * x; }); 
var sumFactorials = sum(factorial);
```

If we have a single call to `sumInts`, `sumCubes` and `sumFactorials` for a specific range say [1,10], we can avoid creating the middlemen variables altogether by writing these functions as follows: 

```javascript
// sumInts
sum(function(x){return x;})(1, 10);
// sumCubes
sum(function(x){return x * x * x; })(1, 10); 
// sumFactorials
sum(factorial)(1, 10);
```

To understand this notation let us take a look at the `sum(function(x){return x*x*x;})(1,10)`. *The other functions follow the same logic.*  

  1. `sum(function(x){return x*x*x;})` applies the `cube` to `sum` and returns the **sum of cubes** function.   
  2. `sum(function(x){return x*x*x;})` is therefore equivalent to `sum(cube)` which is equivalent to our original `sumCubes`. 
  3. This function is applied to the arguments `(1, 10)`.  
