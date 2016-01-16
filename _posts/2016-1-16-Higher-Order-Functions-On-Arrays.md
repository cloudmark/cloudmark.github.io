---
layout: post
title: Houses, Arrays and Higher Order Functions
image: /images/home.png
---

<img src="{{ site.baseurl }}/images/home.png"/ class="title" >
In the previous post we made use of higher order functions to generalise the __summation__ function.   Using HOFs we managed to implement a solution that was much simpler - 
_as defined by Rich Hickey over [here](http://www.infoq.com/presentations/Simple-Made-Easy)_ - 
than its iterative (and less evolved) cousin. In this post we are going to apply the same technique on arrays and apply this on a dataset of house prices. 
Who knows maybe this techniques will help you find your dream home!


# Dataset
The dataset we are going to use throughout this example can be downloaded from [here]({{site.baseurl}}/data/realestatedata.js).  This dataset contains the following fields [^1]:
 
- __MLS__: Multiple listing service number for the house (unique ID).
- __Location__: City/town where the house is located.
- __Price__: The most recent listing price of the house (in dollars).
- __Bedrooms__: Number of bedrooms.
- __Bathrooms__: Number of bathrooms.
- __Size__: Size of the house in square feet.
- __Price/SQ.ft__: Price of the house per square foot.
- __Status__: Type of sale. Three types are represented in the dataset: _Short Sale_, _Foreclosure_ and _Regular_.



# Filtering the data
As a first exercise, let us find _all houses in Cambria which have four bedrooms_ [^2]: 

```javascript
function housesInCambriaFilter(array) {
    var passed = [];
    for(var i=0; i < array.length; i++){
        var house = array[i];
        if (house.location === "Cambria" && house.bedrooms == 4) passed.push(house);
    }
    return passed;
}
housesInCambriaFilter(REALESTATE_DATA);
```

There is only one house that matches our criteria: 

```javascript
[ { mls: 147819,
    location: 'Cambria',
    price: 332000,
    bedrooms: 4,
    bathrooms: 4,
    size: 1872,
    'price-sq-ft': 177.35,
    status: 'Foreclosure' } ]
```

Now let us find _all houses where the price per square foot is less than 20_: 

```javascript
function lowPricePerSquareFoot(array) {
    var passed = [];
    for(var i=0; i < array.length; i++){
        var house = array[i];
        if (house['price-sq-ft'] < 20) passed.push(house);
    }
    return passed;
}
lowPricePerSquareFoot(REALESTATE_DATA);
```

There are two houses which match this criteria, interestingly they are both in Santa Maria-Orcutt

```javascript
[ { mls: 148168,
    location: 'Santa Maria-Orcutt',
    price: 29000,
    bedrooms: 2,
    bathrooms: 2,
    size: 1500,
    'price-sq-ft': 19.33,
    status: 'Foreclosure' },
  { mls: 154462,
    location: ' Santa Maria-Orcutt',
    price: 26500,
    bedrooms: 2,
    bathrooms: 2,
    size: 1344,
    'price-sq-ft': 19.72,
    status: 'Regular' } ]
```

Observe that the two methods are almost identical except for the following filtering code snippets: 

```javascript
if (house.location === "Cambria" && house.bedrooms == 4) passed.push(house);
if (house['price-sq-ft'] < 20) passed.push(house);
```

Using __higher order functions__ we can separate the filter from the iteration logic as follows:   

```javascript
function filter(array, test){
    var passed = [];
    for(var i = 0; i < array.length; i++){
        if (test(array[i])){
            passed.push(array[i]);
        }
    }
    return passed;
}
filter(REALESTATE_DATA, function(house){
    return house.location === "Cambria" && house.bedrooms == 4;
});

filter(REALESTATE_DATA, function(house){
    return house['price-sq-ft'] < 20;
});
```

This results in code which is much more simple and clean. In ECMA-262 5th edition (aka ES5) we have access to 
the `filter` function directly on arrays and thus we can write this code as follows: 

```javascript
REALESTATE_DATA.filter(function(house){
  return house.location === "Cambria" && house.bedrooms == 4;
});

REALESTATE_DATA.filter(function(house){
  return house['price-sq-ft'] < 20;
});
```

Wow now that is much simpler :metal: Using [ECMAScript6](http://es6-features.org/#ExpressionBodies) 
we can write the same piece of code using a more expressive closure syntax as follows: 

```javascript
filter(REALESTATE_DATA, 
    (house) => house.location === "Cambria" && house.bedrooms == 4)
filter(REALESTATE_DATA, 
    (house) => house['price-sq-ft'] < 20 );
```

# Mapping Data 
Now that we have an array of objects representing the houses produced 
by filtering the `REALESTATE_DATA`, we want to produce an array with _just the 
**MLS** attribute_.  Let us do this on the *Cambria filter* we defined earlier: 

```javascript
var housesInCambriaFilterData = housesInCambriaFilter(REALESTATE_DATA);
function getMLS(array) {
    var transformed = [];
    for (var i = 0; i < array.length; i++) {
        var house = array[i];
        transformed.push(house.mls)
    }
    return transformed;
}
getMLS(housesInCambriaFilterData);
// -> [ 147819 ]
```

Let us repeat this exercise and retrieve _just the **Price/SQ.ft**_ on the *low price per square foot filter* we defined earlier: 

```javascript
var lowPricePerSquareFootData = lowPricePerSquareFoot(REALESTATE_DATA);
function getPricePerSquareFoot(array) {
    var transformed = [];
    for (var i = 0; i < array.length; i++) {
        var house = array[i];
        transformed.push(house['price-sq-ft'])
    }
    return transformed;
}
getPricePerSquareFoot(lowPricePerSquareFootData);
// -> [ 19.33, 19.72 ]

```

Notice that the only difference between the two methods is: 

```javascript
transformed.push(house.mls)
transformed.push(house['price-sq-ft'])
```

By creating a `map` function we can rewrite these two methods as follows: 
  
```javascript
function map(array, transform){
    var mapped = [];
    for(var i = 0; i < array.length; i++){
        mapped.push(transform(array[i]));
    }
    return mapped;
}

map(housesInCambriaFilterData, function(house){
    return house.mls;
});

map(lowPricePerSquareFootData, function(house){
    return house['price-sq-ft'];
});
```

The `map` function has also been standardized in ECMA-262 5th edition (aka ES5) and we 
can in fact use the `map` functions directly on arrays as follows: 

```javascript
housesInCambriaFilterData.map(function(house){
    return house.mls;
});

lowPricePerSquareFootData.map(function(house){
    return house['price-sq-ft'];
});
```

Using ES6 we can write the code as follows: 

```javascript
housesInCambriaFilterData.map((house) => house.mls);
lowPricePerSquareFootData.map((house) => house['price-sq-ft']);
```

# Composing Filter and Map 
Higher Order Functions start to shine when we need to **compose** functions.  In fact 
the above code can be written without the use of the intermediate 
variables `housesInCambriaFilterData` and `lowPricePerSquareFootData`:
 
 ```javascript
REALESTATE_DATA.filter(function(house){
    return house.location === "Cambria" && house.bedrooms == 4;
}).map(function(house) {
    return house.mls;
});

REALESTATE_DATA.filter(function(house){
    return house['price-sq-ft'] < 20;
}).map(function(house) {
    return house['price-sq-ft']
});
 ```

In ES6 we have some more syntactic sugar which we can sprinkle on top: 

```javascript
REALESTATE_DATA.filter(
    (house) => house.location === "Cambria" && house.bedrooms == 4
).map((house) => house.mls);

REALESTATE_DATA.filter((house) => house['price-sq-ft'] < 20)
    .map((house) => house['price-sq-ft']);
```


# Reduce
Another common operation is the computation of a single value from array elements. 
The higher order function that represents this pattern is called **reduce** or sometimes **fold**. 
`reduce` can be implemented as follows: 

```javascript
function reduce(array, combine){
    var current = array[0];
    for(var i =1; i < array.length; i++){
        current = combine(current, array[i]);
    }
    return current;
}
```

`array` is the array on which the reduction will performed and `combine` is the function 
that will be used to reduces two values.  So how can we use `reduce` to say sum up 
the array `[1, 2, 3, 4]`? 

``` javascript
reduce([1, 2, 3, 4], function(a, b){
    return a + b;
});
```

Intuitively, we can think of reduce a function which inserting the `combine` operator between 
elements values:  

```javascript
(((1 + 2) + 3) + 4)
combine(combine(combine(1,2),3),4)
```

As with `filter` and `map` there is standard `reduce` function which we can use.  The example 
above can be written as follows:

```javascript
[1, 2, 3, 4].reduce(function(a, b){ return a + b});
```

In ES6 we can make use of the expressive closure syntax and write: 

```javascript
[1, 2, 3, 4].reduce((a, b) => a + b);
```

Let's us now apply `reduce` on the dataset to find the average number of bathrooms in Cambria 

```javascript
housesInCambriaFilterData.map(function(house){
        return house.bathrooms;
    }).reduce(function(current, bathroom) {
        return current + bathroom;
    }) / housesInCambriaFilterData.length
    
// -> 4  (Remember there was only one data point!)
```    

Finally, let's find out the average listing price in our dataset 

```javascript
REALESTATE_DATA.map(function(house){
        return house.size;
    }).reduce(function(current, size) {
        return current + size;
    }) / REALESTATE_DATA.length 
// -> 1755.0588988476313       
```    
    
Can you find the average price in each location? 

Consider writing a higher order function 
**group** which first groups the data using a given criteria e.g. `(house) => house.location`.  Best implementation gets a virtual chocolate :bowtie: :chocolate_bar:.  

<hr/>

1. This dataset has been adapted from [here](https://wiki.csc.calpoly.edu/datasets/wiki/Houses)
2. `REALESTATE_DATA` contains the whole dataset.  
3. Icon from [Dave Gamez](https://dribbble.com/shots/2281842-House-Icon) dribbble account.  Great work dude!
