---
layout: post
title: Angular 2 - Define Routes Dynamically using UIRouter
image: /images/ui-router/angular2.png
---

<img class="title" src="{{ site.baseurl}}/images/ui-router/angular2.png"/> A router is a software component responsible for creating, activating, deactivating and destroying component sub-trees. A specific subset of components selected at a certain point in time is called a _router state_ and hence one can think of a router as  a software component which synchronises the router state with what the user sees on screen (my tongue hurts!).  All possible router states are configured statically at configuration time.  At this stage a URL pattern is supplied to the router together with a declaration of the desired router state.  This approach works for the majority of cases however there are times when we would like to specify the URL pattern associated with a state declaration at runtime rather than statically.  Supporting multilingual routes is one such example.  


#  Router Configuration and Navigation Management
Angular applications are composed of a hierarchy of components which are arranged on the screen through the use of a software component called a _router_. A router is usually composed of two main parts: one which handles the router configuration and another which handles navigation.  In the configuration part the user associates a URL pattern with a sub-tree of State Declarations.  During navigation the router will create and activate the State Declarations to represent a specific user state and will deactivate and destroy redundant router states. 


As a running example let us create a simple game lobby.  The game lobby will consist of two State Declarations `games` and `gameDetail`.  The `games` declaration will be associated with the `/games` URL and will display a list of games.  The `gameDetail` declaration will be associated with the `/games/:gameId` URL and display a particular game uniquely identified using by the `gameId`.  Using [UIRouter](https://ui-router.github.io/) we can define the simple game lobby states declarations as follows: 


```ts
export let CHILD_STATES: Ng2StateDeclaration[] = [
    {
      name: 'games',
      url: '/games',
      component: GamesComponent,
    }, {
      name: 'gameDetail',
      url: '/games/:gameId',
      component: GameComponent,
      resolve: [
        {
          token: 'gameURL',
          // Assume fancy loading of the game URL happens here.  
          resolveFn: (transition: Transition) => transition.params().gameId,
          deps: [Transition]
        }
      ]
    }];

@NgModule({
  imports: [BrowserModule, HttpModule,
    UIRouterModule.forRoot({
      states:CHILD_STATES
    })],
  ...
})
export class GamesModule {
}
```

These State Declarations can be depicted as follows: 

<img class="step" src="{{ site.baseURL }}/images/ui-router/state0.png"/>

_Note: It is the View Declarations which define which UI Components should be created/destroyed or activated/deactivated when the current state is created/destroyed or activated/deactivated rather than the State Declarations themselves. In this post we will assume that there is only one view associated with a particular state - the default view._


Now let us assume that the user navigates to `/games`.  The router will track this navigation and will use the relevant state declaration - in this case `games` - to instantiate the router state.  Visually this can be depicted as follows: 

<img class="step" src="{{ site.baseURL }}/images/ui-router/state1.png"/>

One important thing to observe is that whilst the `games` state declaration will always create and activate the same state, the `gameDetails` declaration might have an infinite amount of states which fit the declaration since there are potentially infinite amount of `gameId` identifiers.  This is an important distinction - while `/games/1`, `/games/2`, ... `/games/n` represent a different state, they are all linked together through the same state declaration.  


Now let us assume that a game with `gameId` 1 exists and that the user has navigated to `/games/1`.  Once again the router would track this URL change and will start a synchronisation process in order to synchronise the current user view to reflect the latest router state - `gameDetail` with `gameId` 1.  In order to transition to the new state the router will create a plan 
 (a transactional FSM) which will loosely correspond to the following steps: 

  1. *decative* the `games` state and destroy the default view
  2. *create* the `gameDetail` state with parameter `gameId` equal to 1 and *active*  the default view.  

The new state can be depicted as follows: 

<img class="step" src="{{ site.baseURL }}/images/ui-router/state2.png"/>

Now that we have a basic understanding of what parts make up a router, let us define what we mean by a static router declaration. A static router declaration is a state declaration which is bound to a URL matcher (e.g. `/games` or `/games/:gameId`) when the state declaration is defined.  Most Single Page Applications use static route declarations however there are times when we want to defer the mapping (between the URL and State Declaration) to a later point in time.  We refer to such mappings as dynamic(ally mapped) State Declarations since their mapping is deferred to a point in time before creation.  

# Dynamic Router Declarations 
Our game lobby has gone viral and we are ready to take on a new market.  Next stop Sweden!  In order to be local we would like to convert our application to support both Swedish and English.  We will first create a parent `app` state which will capture the `locale` part of the URL. 
 
```ts
export let MAIN_STATES: Ng2StateDeclaration[] = [{
  name: 'app',
  url: '/:lang',
  component: AppComponent,
  abstract: true
}];

@NgModule({
  imports: [BrowserModule, HttpModule,
    GamesModule,
    UIRouterModule.forRoot({
      states: MAIN_STATES
    }),
  ],
  ...
})
export class AppModule {
}
```

And update the previous State Declarations as follows: 


```ts
export let CHILD_STATES: Ng2StateDeclaration[] = [
    {
      name: 'app.engames',
      url: '/games',
      component: GamesComponent,
    }, 
    {
      name: 'app.svgames',
      url: '/spel',
      component: GamesComponent,
    }, 
    {
      name: 'app.enGameDetail',
      url: '/games/:gameId',
      component: GameComponent,
      resolve: [ { ... }]
    }, 
    {
      name: 'app.svgameDetail',
      url: '/spel/:gameId',
      component: GameComponent,
      resolve: [ { ... } ]
    }];

@NgModule({
  imports: [CommonModule,
    UIRouterModule.forChild({
      states:CHILD_STATES
    })],
  ...
})
export class GamesModule {
}
```

The State Declarations above can be depicted as follows: 



<img class="step" src="{{ site.baseURL }}/images/ui-router/multi.png"/>


Although such an approach would work, it is not something which I would recommended for a variety of reasons:  

 1. The amount of State Declarations will grow quadratically as the number of supported languages and application states increase. Moreover, a user will typically stick to the initial loaded language and hence associating additional URLs to State Declarations is unnecessary.     
 2. Our ability to reason, update and map URLs to State Declarations will diminish as the number of states increase. 
 3. In large applications there are various stakeholders which might have an input on which URL should be used (e.g. Content Managers and SEO teams).  Manually configuring URL mappings within the code will quickly become frustrating and is error prone.  

In large applications we would want to separate State Declarations from URL mappings and defer the mappings between URL and State Declaration to the very last stage just before a State Declaration is registered with the Router.  In order to support such dynamic State Declarations we will extends the `Ng2StateDeclaration` interface to include a `future: boolean` to signal such an intent. `Ng2StateDeclaration` is used by `UIRouterModule` to configure the State Declarations.  Note that we will also create an internal  `_complete` property which will help us track which dynamic states have been configured. 

```ts
export interface DynamicNg2StateDeclaration extends Ng2StateDeclaration {
  future: boolean;
  _complete?: boolean;
}
```

Next we will update the previously defined child State Declarations by adding `future: true` to each deferred state and remove the `url` property. Finally we will add a `config` function - `uiRouterConfigureSitemap` - to the `UIRouterModule` which will take care of configuring the State Declaration just before it is registered with the router.  _Note that the `app` declaration does not need to be deferred since it is just holding the current language within the `locale` state parameter._

```ts
export let CHILD_STATES: DynamicNg2StateDeclaration[] = [
    {
      name: 'app.games',
      future: true, 
      component: GamesComponent,
    }, 
    {
      name: 'app.gameDetail',
      future: true
      component: GameComponent,
      resolve: [ { ... }]
    }];

@NgModule({
  imports: [CommonModule,
    UIRouterModule.forChild({
      states:CHILD_STATES,
      config: uiRouterConfigureSitemap
    })],
  ...
})
export class GamesModule {
}
```

Now let focus on the `uiRouterConfigureSitemap` function which does all the heavy lifting.  To define this function we will assume that we can keep the _State Declaration to URL mappings_ in a CMS (Content Management System) and that we are able to retrieve a JSON object per language as follows: 

```json
// en sitemap
[ 
      {"module": "app.games", "path": "/games"},
      {"module": "app.gameDetail", "path": "/games/:gameId"}
]
```

```json
// sv sitemap
[
      {"module": "app.games", "path": "/spel"},
      {"module": "app.gameDetail", "path": "/spel/:gameId"},
]
```

_Note that this is but one way how to achieve dynamic states  - you should consider what is easiest for your project at hand._  

Now that we have defined the CMS services let us define the `uiRouterConfigureSitemap` as follows: 

```ts
export function uiRouterConfigureSitemap(router: UIRouter, injector: Injector, 
    module: StatesModule) {
  let states: DynamicNg2StateDeclaration[] = <DynamicNg2StateDeclaration[]>module.states;

  let filteredStates: DynamicNg2StateDeclaration[] = _.filter(states, (s) => {
    return s.future && !s._complete
  });

  _.map(filteredStates, (s) => {
    let sitemapObj:any = _.find(getSitemap(), (sitemap:any) => sitemap.module == s.name);
    console.log(`Retrieved ${s.name} from sitemap ${sitemapObj.path}`);
    // Set the URL from the sitemap object
    s.URL = sitemapObj.path;
    s._complete = true;
  });
  router.URLService.config.strictMode(false);
}
```

This function starts off by filtering out router definitions which should not be dynamically resolved: 

```ts
let filteredStates: DynamicNg2StateDeclaration[] = _.filter(states, (s) => {
    return s.future && !s._complete
  });
```

For each of the states requiring configuration, we will find the sitemap object which matches the current dynamic State Declaration using the state name: 


```ts
let sitemapObj:any = _.find(getSitemap(), (sitemap:any) => sitemap.module == s.name);
```

_Note that the `getSitemap` function is not fully specified.  The specific implementation shall use the `locale` state parameter to retrieve the specific sitemap JSON  from the CMS as defined above._  

Once the sitemap object is located we will use this object to configure the URL as well as mark the State Declaration as complete to signal that it has been processed: 

```ts
s.URL = sitemapObj.path;
s._complete = true;
```


# Conclusion
In this post we have shown how to configure dynamic State Declarations on UIRouter in order to handle multilingual routes.  Special thanks goes to [Christopher Theilen](https://github.com/christopherthielen) for overseeing the changes required within UI Router to make this happen and for the interesting discussion around this topic .  The ideas presented in this post will be pushed onto [ui-router-ng2](https://github.com/ui-router/ng2) beta5 (currently on beta4). Stay safe and keep hacking!