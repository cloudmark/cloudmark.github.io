---
layout: post
title: Why Kubernetes? Google Cloud Event Follow-up 
image: /images/googlecloudevent/google-cloud-logo.jpg
---

<img class="title" src="{{ site.baseurl }}/images/googlecloudevent/event.jpg"/>
This April Google organised the first Google Cloud Event here in Malta.  During that event I presented our reasons, as a company, for moving to Kubernetes. Many have reached out after the presentation to discuss further and some suggested publishing our motivations online for reference.  So here I am typing away :grimacing:!   

# Cathedrals vs Baazars
Back in 2006 the world was definitely a simpler place.  Large deployments consisted of a couple of servers, API response times were measured in seconds and customers were tolerant to hours of downtime.  Today, large deployments consist of hundreds (even thousands) of servers, customers demand sub-second response times and downtimes are not tolerated at all. 

Since 2006 systems have grown significantly larger making scale-up infeasible.  New requirements require new architectures; big monoliths need to be broken down into smaller independent components called __microservices__ in order to be developed, maintained and scaled independently (scaled-out).  

# Reactive applications
If the previous section resonated with the [reactive manifesto](https://www.reactivemanifesto.org/), you are right, it sure does.  Around 2014, I started following content from Jonas Bonér (@jboner), Roland Kuhn (@rolandkuhn) and Martin Odersky (@odersky) and the seeds of reactive systems were planted.  

But what are reactive applications?  Merriam Webster dictionary defines reactive as readily responding to stimulus.  In the case of reactive applications this specifically means four things:

 1. __React to events__: reactive systems consist of a number of loosely coupled systems that need to communicate together asynchronously via messages.  
 2. __React to load__: reactive systems need to handle non-uniform loads with huge variances.  
 3. __Reactive to failure__: the 'let it crash' philosophy is 'built-in' into reactive system rather than patched on top. Failure is not an exceptional event but assumed. 
 4. __React to users__: as a result of systems which communicate asynchronously, react to load and react to failure we can create systems which respond to users in a timely manner.  

# Microservices, microservices everywhere
So, the vision was clear. We wanted to create microservices which
- cooperate together asynchronously via messages, 
- scale independently to buffer load and optimise costs, and
- react to failure without manual intervention.  
    
_We also wanted to develop microservices in a functional paradigm but that's a story for some another time :smile:_.  

From a developer's POV, moving to reactive systems (and microservices) 
is easy.  Microservices are easy to understand hence easier to develop, understand and maintain.  

From a DevOps perspective microservices are hard. Hard to:   
- __Isolate__:  how do we make sure that microservices do not step on each other's toes?
- __Schedule__:  how do we schedule micorservices across a number of nodes? 
- __Configure__: how do we configure services so that they can communicate with each other? How do we expose services to the outside world?
- __Supervise__:  how do we supervise microservices to know that they are alive? 
- __Recover (from failure)__: how do we handle failure? 

Ok great, vision - check! Mental map - check! First stop down microservices lane was isolation!  

# Isolating Running Apps
Google was the first company to face this problem at scale and created two technologies (cgroups and namespaces) which would unlock container orchestration engines.  Looking back, there were (and still are) three main techniques available:

1. __Naive Approach__ (_faith is a requirement_): Applications are deployed on a couple of machines and are assumed to be homogeneous; same libraries, same environment. Assuming that __all__ microservices developed have the same requirements is naive and limiting.  

2. __VM Approach__ (_thou shall be wasteful_):  To solve the divergence problem, most people turn to VMs.  The main drawback with VMs is that as components get smaller (and the number of components increase) hardware resources are not fully utilised.  VMs also create a huge workload for system administrators.  

3. __Containers Approach__ (_thou shall be resourceful):  The ultimate solution and the solution we ended up using is _linux containers_.  Using containers we run processes on a host operating system and isolate these processes through the use of _namespaces_.  Resources utilised by an applications are restricted through the use of _cgroups_. 

# Kubernetes
Having found a solution to the problem of isolation, we focused on scheduling, configuring, supervision and failure recovery. It turned out that [Kubernetes](https://kubernetes.io/) solved all of these problems. Hard to believe right? Let's see how Kubernetes helps us solve Scheduling, Configuring, Supervision and Failure recovery. 

## Scheduling 
### Creating Containers 
When we discuss scheduling we typically think of deploying a container (or pod in Kubernetes lingo) on some server.  Assuming that we have the image `repository/platform:v1` how do we deploy 5 instances of this application across our available nodes? One way of doing this in Kubernetes is via a _deployment resources_.  First we create a file `deployment.yaml` (although the name is not important)
 
```yaml
# File: deployment.yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: platform
spec:
  replicas: 5 
  template:
    metadata:
      name: platform
      labels:
        app: platform
    spec:
      containers:
     : image: repository/platform:v1
        name: platform
```

and submit the deployment resources to the Kubernetes master via the control plane

```bash
> kubectl create -f deployment.yaml
```

The Kubernetes master will orchestrate all the Kubernetes worker nodes to achieve the desired state (5 platform pods).  

### Scaling 
Ok great! Our application is really performing well and now we want to scale-up to handle heavier loads.  With Kubernetes this is easy - we update the `spec.replicas` field from `5` to say `10`, 

```yaml
# File: deployment.yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: platform
spec:
  replicas: 10 # Change number of replicas
  template:
    metadata:
      name: platform
      labels:
        app: platform
    spec:
      containers:
     : image: repository/platform:v1 # Still circle thingies!
        name: platform
```

submit this to the Kubernetes master 

```bash
> kubectl apply -f deployment.yaml 
```

and voila! We scaled our application.  Alternatively we could have achieved the above by simply running the command 

```bash
> kubectl scale deployment platform --replicas=10
```

A hand-wavy explanation of what just happened;  Kubernetes identified a mismatch between the desired state (10 application instances) and the actual state (5 application instances) and resolved the mismatch by orchestrating more pods across the available nodes.  If you are interested in Kubernetes internals I would highly recommend the book _Kubernetes in Action_ by Marko Lukša (@markoluksa).  Another great resource to learn Kubernetes is the [github repository](http://www.github.com/kubernetes); kubernetes is an open source project and reading the codebase can be quite educational.

### Rolling Updates 
One thing in which Kubernetes really shines is rolling updates.  So imagine the following scenario; we have deployed version 1 of our application, things are going great and we are ready to roll out version 2.  How do we do this without incurring any downtime? In Kubernetes, we simply update the field `spec.template.spec.containers.image` field from `repository/platform:v1` to `repository/platform:v2`

```yaml
# File: deployment.yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: platform
spec:
  replicas: 3
  template:
    metadata:
      name: platform
      labels:
        app: platform
    spec:
      containers:
     : image: repository/platform:v2 # Change image
        name: platform
```

inform the Kubernetes master of our desired state

```bash
> kubectl apply -f deployment.yaml
```

and Kubernetes will automatically start scaling up new deployments and scaling down the old deployments until all pods are on the latest version.  _There is also a big bang approach but typically you would want to phase out the deployment to avoid downtime_.  

## Configuring 
Having discussed scheduling, we shall now focus on how we can configure our pods to communicate with each other and how we can communicate with pods from the outside word.  

### Accessing Pods within the cluster 
One requirement of reactive systems is that they are able to communicate with each other asynchronously.  Given that pods are ephermal: remember _let it crash_, how do we contact our pods from other pods if they are moving targets? In order to understand how we do this let us first create a CMS Deploymnent resource and spin up three nodes! 

```yaml
# File: cms.yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: cms
spec:
  replicas: 3
  template:
    metadata:
      name: cms
      labels:
        app: cms
    spec:
      containers:
     : image: repository/cms:v1
        name: cms
```
```bash
> kubectl create -f cms.yaml
```

How do we allow our previously created `platform` pods to communicate with our newly created `cms` pods? In a non-Kubernetes world, a sysadmin would need to configure each cms and platform container manually but when using Kubernetes we utilize a _service resource_ 

```yaml
# File: service.yaml
apiVersion: v1
kind: Service
metadata:
  name: cms-service
spec:
  ports:
    name: http
    port: 80
    targetPort: 8080
  selector:
    app: cms
```

and ask Kubernetes to expose our service.  

```bash
> kubectl create -f service.yaml
```

Our `platform` pods can communicate with the `cms` pods via the `http://cms/` endpoint. You can think of the _service resources_ as a load-balancer that distributes load between the available pods identified by the `spec.selector.app` field.  

### Accessing Pods from outside the cluster 
Platforms which can only be accessed from within the cluster are boring. Let's expose our platform externally. In order to do this we will use the same _service resource_ and specify `LoadBalancer` in the `spec.type` field


```yaml
# File: external_service.yaml
apiVersion: v1
kind: Service
metadata:
  name: platform-loadbalancer
spec:
  type: LoadBalancer # Expose it to the outside
  ports:
 : port: 80
    targetPort: 8080
  selector:
    app: platform
```

and submit this _service resources_ to the Kubernetes master

```bash
> kubectl create -f external_service.yaml
```

This small change in the spec metadata instructs the underlying cloud provider (in our case Google Cloud) to create an external load-balancer, assign a static IP, create the required firewall rules and re-direct traffic hitting the external IP internally to pods inside the Kubernetes cluster. 

To get the external IP address we use 

```bash
> kubectl get svc platform-loadbalancer
```

_Wow, a lot has happened with this simple addition! This is in fact one of the main advantages of using Kubernetes on a Cloud Provider._

## Supervision and Failure 
We are making progress but how do we deal with Supervision and Failure recovery? Well we don't, Kubernetes does.  Kubernetes runs a closed loop which constantly compares our desired state with the actual state and if a mismatch is detected Kubernetes resolves the mismatch.   For example, if we specify that we want 5 platform instances running, Kubernetes will make sure that 5 instances are running.  If one instance stops working (or responding) Kubernetes will automatically restart the pod and reschedule it.  If a whole node dies, all pods deployed on that node will be rescheduled on a newly selected healthy node. 

# Back our vision! 
Let's review what we achieved. Using containerisation at the base, we used Kubernetes to orchestrate applications without requiring manual intervention.  

These applications are able to communicate with each other via _services_.  These applications are able to __react to load__ since it is easy to scale and do rolling-updates with Kubernetes.  Finally, Kubernetes enables us to __react to failure__ by monitoring all resources in a tight loop.  


# Conclusion
Kubernetes is key in enabling our vision of creating reactive systems. When we started using Kubernetes we could not have imagined the impact it would have on our daily development process.  Three years on, we deploy multiple times a day with confidence without worrying about downtimes. If you are starting the journey to Kubernetes you are making a great choice! Stay safe and keep hacking!  
