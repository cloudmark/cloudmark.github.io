---
layout: post
title: Controlling Digests in AngularJS
image: /images/angular/angular.png
---

<img src="{{ site.baseurl }}/images/angular/angular.png"/ class="title" > AngularJS is a great framework to consider when developing Single Page Applications however, as the displayed datasets grow in size, the application response times deteriorate quickly. In this post I will go through a number of techniques which can be used to tackle these performance problems and I will suggest a new technique to solve this problem.  So let's get started.     
 

# Angular Digest 
To understand the performance bottlenecks of AngularJS let's create a simple application which renders a dataset using the `ng-repeat` directive.  _Note that we will use  `{(` and `)}` as start and end interpolation symbols due to some problems on Jekyll._:
  
  
```html
<html>
    <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.5.5/angular.js"></script>
        <script src="app.js"></script>        
    </head>
    <body>
        <div ng-app="Application" ng-strict-di>
            <div ng-controller="ShellController as shellController">
                <button ng-click="shellController.forceScopeRefresh()">Force Scope Refresh</button>
            </div>
            <div ng-controller="OptimisedTestController as optimisedController">
                <h1>NGRepeat 1</h1>
                <div ng-repeat="firstListStudent in optimisedController.students">
                    <h3>{(firstListStudent.index)}</h3>
                    <hr>
                </div>
            </div>
        </div>
    </body>
</html>
```
  
 This dataset uses the `students` field in the  `OptimisedTestController` controller defined in `app.js`.  
 
 ```javascript
 angular.module('Application', [])
     .controller("ShellController", function(){
         this.forceScopeRefresh = function(){
             console.log('Refreshing the scope.  '); 
         }; 
     })
     .controller('OptimisedTestController',function(){
         this.students = [
             { name: "A", index: 1 }, 
             { name: "B", index: 2 }, 
             { name: "C", index: 3 }, 
             { name: "D", index: 4 }, 
             { name: "E", index: 5 }, 
             { name: "F", index: 6 }, 
             { name: "G", index: 7 }, 
             { name: "H", index: 8 }, 
             { name: "I", index: 9 }, 
             { name: "J", index: 10 }
         ];                     
     }) 
                 
```

Now let's install [Batarang](https://github.com/angular/batarang) to understand where the performance bottleneck is.  

<img class="step"  src="{{ site.baseurl }}/images/angular/digest.png"/>

Although the list has 10 elements we can see that 30 watchers are evaulated.  Two evaluations per templated element are required to determine whether the value `firstListStudent.index` (2 * 10 = 20) has changed and another one is needed to render the value (1 * 10 = 10).  The number of watchers is proportional to the number of elements.  Now let's add another dataset by adding a `TestController` controller using the following snippets:
 
 ```html
 <div ng-controller="TestController as simpleController">
     <h1>NGRepeat 2</h1>
     <div ng-repeat="secondListStudent in simpleController.students">
         <h3>{(secondListStudent.index)}</h3>
         <hr>
     </div>
 </div>
 
 ```
 
 ```javascript
 angular.module('Application')
     .controller('TestController', function(){
         this.students = [
             { name: "A", index: 1 }, 
             { name: "B", index: 2 }, 
             { name: "C", index: 3 }, 
             { name: "D", index: 4 }, 
             { name: "E", index: 5 }, 
             { name: "F", index: 6 }, 
             { name: "G", index: 7 }, 
             { name: "H", index: 8 }, 
             { name: "I", index: 9 }, 
             { name: "J", index: 10 }
         ];
     })
 ```

As you can see the number of digests increase proportional with the number of lists.  We now have 30 digests for `firstListStudent.index` in the `optimisedController.students` and another 30 digest for `secondListStudent.index` in the `simpleController.students`

<img class="step"  src="{{ site.baseurl }}/images/angular/digest2.png"/>

Now let's click on _Force Scope Refresh_ and see what happens.  


<img class="step"  src="{{ site.baseurl }}/images/angular/digest3.png"/>

As you can see AngularJS executes 10 digests to determine whether any value of `firstListStudent.index` in the `optimisedController.students` has changed and another 10 digests to determine whether any value of `secondListStudent.index` in the `simpleController.students` has changed.  AngularJS is trying to be smart and determine what has changed within the application however this process creates performance bottlenecks as the number of elements in the dataset increases. 


# Alleviating Problems with Large Datasets
Now that we have understood what the problem is, let's look at what we can do to alleviate this performance bottleneck:

- **Use bind once**:  bind once (`::`) will remove the watched expression from the watchers list after an initial change.  Let's implement this technique on the `optimisedController.students` dataset by changing the HTML as follows and visualise the number of watchers.  

```html
<div ng-controller="OptimisedTestController as optimisedController">
    <h1>NGRepeat 1</h1>
    <div ng-repeat="firstListStudent in optimisedController.students">
        <h3>{(::firstListStudent.index)}</h3>
        <hr>
    </div>
</div>
```

When the page is initially loaded we still get 30 watchers per list: 


<img class="step"  src="{{ site.baseurl }}/images/angular/digest4.png"/>

This is expected - AngularJS has to determine the initial change.  If we now click on the _Force Scope Refresh_ button we see an improvement: 

<img class="step"  src="{{ site.baseurl }}/images/angular/digest5.png"/>


Now we only have 10 digests of the `secondListStudent.index` expression.  The `firstListStudent` watchers have been removed from the watchers list due to the bind once expression.  


- **Limit the visible elements with `limitTo`**: Since the watches count is directly proportional to the number of items in the list it follows that limiting the number of items to render will result in less watchers being evaluated. To limit the number of elements displayed within a `ngRepeat` directive we can use the [`limitTo` directive](https://docs.angularjs.org/api/ng/filter/limitTo). Let's limit our previous example to 5 elements per each `ngRepeat` by changing the HTML snippet as follows: 
 
 ```html
 <div ng-controller="OptimisedTestController as optimisedController">
     <h1>NGRepeat 1</h1>
     <div ng-repeat="firstListStudent in optimisedController.students | limitTo: 5">
         <h3>{(::firstListStudent.index)}</h3>
         <hr>
     </div>
 </div>
 <div ng-controller="TestController as simpleController">
     <h1>NGRepeat 2</h1>
     <div ng-repeat="secondListStudent in simpleController.students | limitTo: 5">
         <h3>{(secondListStudent.index)}</h3>
         <hr>
     </div>
 </div>
```

The initial page load will result in 15 (5 * 3) watchers for `firstListStudent` and another 15 (5 * 3) watchers for the `secondListStudent`.  


<img class="step"  src="{{ site.baseurl }}/images/angular/digest6.png"/>

In a way the `limitTo` directive has been influential in the creation of techniques which optimise the digest lifecycle.  Using the `limitTo` directive we can directly control the timings of the digest cycle - if we load the whole list at once we would have a single digest cycle which takes a long time whereas loading a smaller number of elements in batches (by varying the `limitTo` parameter) results in a larger number of independent digest cycles taking a relatively smaller time.  

# LimitTo Variants
Limiting the number of displayed items on the screen is a great way to improve performance however it is not a great experience for the end user. Ideally, when a user reaches the end of the list we provide a way how to load more items from the source dataset.  There are various ways how we can achieve the loading of more data. I categorised these techniques into two main categories; **Manual Intervention** and **Automatic**.   


## Manual Intervention
This category encompasses all techniques which require some form of user interaction to signal that more items are desired.  

- **`limitTo` with `ngClick` callback**: 
The simplest way how to solve this problem is to give the user directly the option to request more elements.  Let's outline this technique by modifying the `OptimisedTestController` as follows: 

```javascript
angular.module('Application')
    .controller('OptimisedTestController',function(){
        this.currentLimit = 5; 
        this.students = [
            { name: "A", index: 1 }, 
            { name: "B", index: 2 }, 
            ...
        ];
        
        this.loadMore  = function(){
            if (this.currentLimit < this.students.length)
                this.currentLimit = Math.min(this.currentLimit + 5, this.students.length);
        };
})
```

Add a button which calls the new method `loadMore` to the HTML: 

```html
<div ng-controller="OptimisedTestController as optimisedController">
    <h1>NGRepeat 1</h1>
    <div ng-repeat="firstListStudent in optimisedController.students | limitTo: optimisedController.currentLimit">
        <h3>{(firstListStudent.index)}</h3>
        <hr>
    </div>
    <button ng-click="optimisedController.loadMore()">Load More</button>
</div>
```

Let's click on the _Load More_ button and visualise the digests


<img class="step"  src="{{ site.baseurl }}/images/angular/digest7.png"/>

The problem with this solution is that `ng-click` will start a digest cycle which includes all scopes within the application.  As you can see, even though the click originated from within the `optimisedController.students` list we are still seeing `secondStudentList.index` watchers present in the `testController.students` list.  


- **`limitTo` with localised `click` callback**: 
AngularJS cannot determine whether a click event will affect the local scope or whether a click event will effect an element outside of the current scope.  Due to this lack of knowledge Angular chooses the safe route and uses `scope.$apply` which triggers a digest cycle which includes all registered scopes. If we know that a click change is localised within the current scope we can make use of the `localizedClick` directive defined as follows:  

```javascript
angular.module('Application')
    .directive('localizedClick', function(){
        function link(scope, element, attrs) {
            var format,timeoutId;

            element.on('click', function(){
                var deferredFn = attrs['localizedClick'];
                scope.$eval(deferredFn);
                scope.$digest();
            });
        }
    
        return {
            link: link
        }   
    })
```

Now change the HTML code to the following: 

```html
<div ng-controller="OptimisedTestController as optimisedController">
    <h1>NGRepeat 1</h1>
    <div ng-repeat="firstListStudent in optimisedController.students | limitTo: optimisedController.currentLimit">
        <h3>{{firstListStudent.index}}</h3>
        <hr>
    </div>
    <button localized-click="optimisedController.loadMore()">Load More</button>
</div>
```            

Notice that by using `localizedClick`, we localise the digest cycle to just the first `ngRepeat` scope.  In fact we do not see any watchers from the second `ngRepeat` - `secondStudentList.index`. 

<img class="step"  src="{{ site.baseurl }}/images/angular/digest8.png"/>


## Automatic
The previous two techniques are ones which require manual intervention from users.  It would be great if an application could detect when elements should be loaded.  There are two techniques in this category which achieve this result: 

- **`limitTo` with scroll callback**:
One technique to determine when more elements should be loaded is the technique outlined by
[Thierry Nicola](http://www.williambrownstreet.net/blog/2013/07/angularjs-my-solution-to-the-ng-repeat-performance-problem/) in his blog.  This technique hooks to a `scroll` event to determine when the user is 'close' (defined by the `scrollDistance`) to the end of the list.  If the user is close to the end new elements are loaded by modifying the `limitTo` variable.  Thierry has done an amazing job to describe his technique and it would be a great injustice to describe this technique on my blog.  I urge you to go to [Theirry's blog entry](http://www.williambrownstreet.net/blog/2013/07/angularjs-my-solution-to-the-ng-repeat-performance-problem/) in which he describes his solution in detail.   

_Note that the `infiniteScroll` directive uses `scope.$apply(attrs.infiniteScroll)` and hence will trigger a digest cycle which will traverse all scopes within your application.  If you are going to use this for a number of `ngRepeat`ed elements I would consider modifying the directive to use `scope.$digest()` and localise changes to just the current scope._  

- **`limitTo` with `setTimeout` callback**:
One of the assumptions made by Thierry in his solution is that all elements within the dataset have the same size.  Recently, I found myself working on a project where this assumption did not hold true and hence I had to hack a solution to bypass the aforementioned performance issues.  The solution is simple, when the application starts we choose an initial limit value, render the elements and schedule a callback to add more elements to the list.  Once the scheduled call triggers, the `currentLimit` variable is incremented and `$scope.digest()` is called.  _Note that the solution purposely makes use of `window.setTimeout` instead of `$timeout`. The `$timeout` would result in a `$scope.apply()` affecting performance.  If you are not sure that your changes will only affect the local `ngRepeat` scope than you could swap the `setTimeout` for `$timeout` or use `$scope.$evalAsync()`._

```javascript
angular.module('Application')
    .controller('OptimisedTestController',['$scope', '$timeout', function($scope, $timeout){
        this.initialLimit = 5; 
        this.batchSize = 5; 
        this.currentLimit = this.initialLimit; 
        this.students = [
            { name: "A", index: 1 }, 
            { name: "B", index: 2 }, 
            { name: "C", index: 3 }, 
            ...
        ];
        
        var that = this; 
        this.loadMore  = function(){
            if (that.currentLimit < that.students.length){
                $timeout(function(){
                    that.currentLimit = Math.min(that.currentLimit + that.batchSize, that.students.length);
                    $scope.$digest(); // or $scope.$evalAsync() if non-local changes;
                    that.loadMore(); 
                }, 10, false)
            } 
        };
        this.loadMore(); 
}]) 
```

The HTML in our case is as follows: 

```html
 <div ng-controller="OptimisedTestController as optimisedController">
    <h1>NGRepeat 1</h1>
    <div ng-repeat="firstListStudent in optimisedController.students | limitTo: optimisedController.currentLimit">
        <h3>{(firstListStudent.index)}</h3>
        <hr>
    </div>
</div>
```


# Conclusion
In this blog entry I have described why AngularJS slows down as the number of elements grow in size and I have gone through a couple of solutions to mitigate this problem.  Hope to see you all next time! Stay safe! Keep hacking!  