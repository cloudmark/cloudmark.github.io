---
layout: post
title: TypeScript Json Mapper
image: /images/types/typescript.jpg
---

<img class="title" src="{{ site.baseurl }}/images/types/typescript.jpg"/> One of the advantages of using TypeScript is that it augments ES6 with type information and annotations.  When using JSON, data might not be represented using _camelCase_ notation and hence one cannot simply typecast a JSON object directly onto a TypeScript "typed" object.  Traditionally one would solve this problem by creating custom mappers for all the data objects. In this post we will create a generic custom mapper which automates this process by using declarative annotations on Typescript objects.  Finally we will package this custom mapper in a class which can be used directly from Angular to handle conversion of JSON objects to "typed" objects.  

#  Ceci n’est pas une pipe

Let's start off by creating a `Person` class - _every good programming story starts off in this manner_. 

```javascript
class Person {
   constructor(public name: string, 
               public surname: string, 
			   public age: number){}
}
let mark = new Person('Mark', 'Galea', 30);
```
 
An equivalent representation of this in JSON would be the following object:

```json
{
   "name": "Mark", 
   "surname": "Galea", 
   "age": 30
}
```

This example reminds me of the famous painting by René Magritte - Ceci n'est pas une pipe.  In a way the JSON representation is almost a platonic `Person` instance however is it really a `Person`? Instead of getting lost in solving these meta messages through argumentation we will be using the `typeof` operator to answer this question :grin:.  

<img class="step" style="width:50% !important" src="{{ site.baseurl }}/images/types/magritte.jpg"/>

The JSON object represents an object of type Person but is it a Person? What I normally end up doing with Typescript is to write a custom mapper which maps a generic JSON object to a typed object.  This mapping is usually implemented within the `$http` service and acts as a gatekeeper between the two worlds: `typed` and `untyped`: 

```javascript
var deferred = this.$q.defer();
this.$http.get(url, this.getHeaders(headers)).then(response => {
    let jsonObject = response.data; 
    let player = new Person(jsonObject.name, 
                jsonObject.surname, 
                jsonObject.age);
    deferred.resolve(player);
});
return deferred.promise;
```

Note that the Typescript type system is quite different than say the Java type system.   Typescript uses structural instead of nominal information.  This means that automatic duck typing is applied instead of name or identity based type checking.  Using this new acquired knowledge we can write the above piece of code as follows: 

```javascript
var deferred = this.$q.defer();
this.$http.get(url, this.getHeaders(headers)).then(response => {
    let jsonObject = response.data; 
    let player = <Person>jsonObject;
    deferred.resolve(player);
});
return deferred.promise;
```

Had everyone followed the _camelCase_ notation, things would have been simple however we have to live with that fact that different groups of developers will have different standards.  Let's add an address object to the mix to illustrate this idea: 


```javascript
class Address {
    constructor(public firstLine: string, 
    			public secondLine: string, 
    			public city: string){}
}

class Person {
   constructor(public name: string, 
               public surname: string, 
			   public age: number, 
			   public address?: Address){}
}
let address = new Address("Some where", "Over Here", "In This City"); 
let mark = new Person("Mark", "Galea", 30, address); 
```

The equivalent JSON object might look something like this:

```json
{ 
  "name": "Mark", 
  "surname": "Galea", 
  "age": 30, 
  "address": {
    "firstLine": "Some where", 
    "secondLine": "Over Here",
    "city": "In This City"
  }
}
```

An **alternative** and **equally** valid representation is the following: 
 
```json
{
  "name": "Mark", 
  "surname": "Galea", 
  "age": 30, 
  "address": {
    "first-line": "Some where", 
    "second-line": "Over Here",
    "city": "In This City"
  }
}
```

Although structurally these representations are different, both encode the same information about the `Person`.  In Typescript the first representation is valid however, the second one will report errors; `first-line` is not the same as `firstLine` and `second-line` is not the same as `secondLine`.  Yes we can stomp our feet out loud and wage war against _dashes_ and _underscores_ in JSON data but realistically they are here to stay. One way to solve this is to write a custom mapper for all the types defined within our system.  
  
```javascript
var deferred = this.$q.defer();
this.$http.get(url, this.getHeaders(headers)).then(response => {
    let jsonObject = response.data; 
    let player = new Person(jsonObject.name, jsonObject.surname, jsonObject.age, 
                    new Address(jsonObject.address['first-line'],
                     jsonObject.address['second-line'], 
                     jsonObject.address.city)
                 );
    deferred.resolve(player);
});
return deferred.promise;  
```

This solution is not scalable and will make refactoring quite hard in the future.  Wouldn't it be great if we could declaratively describe the mapping and have a mapper take care of the required mapping?  Yes - I thought so too :smiley:

# Mapping JSON using Decorators
Decorators is a feature in Typescript which allows us to attach special kind of declarations to _class declarations_, _method_, _accessor_, _property_ or _parameter_.  Decorators use the form `@expression` where expression must evaluate to a function that will be called at runtime with information about the decorated declaration. The decorator responsible for attaching the mapping metadata is the `@JsonProperty`. Let's modify the `Address` class to illustrate how we can make use of this decorator.  

```javascript
class Address {
	@JsonProperty('first-line')
	firstLine: string; 
	@JsonProperty('second-line')
	secondLine: string; 
	city: string; 
	
    // Default constructor will be called by mapper
    constructor(){
		this.firstLine = undefined; 
		this.secondLine = undefined; 
		this.city = undefined; 			
	}
}

class Person {
   name: string; 
   surname: string; 
   age: number; 
   @JsonProperty('address')
   address: Address; 	
   
   // Default constructor will be called by mapper
   constructor(){
	   this.name = undefined; 
	   this.surname = undefined; 
	   this.age = undefined; 
	   this.address = undefined; 
   }
}
```

The `@JsonProperty` decorates properties with mapping information -  it is an indication to the mapper that `firstLine` should be mapped from the JSON attribute `first-line` and that `secondLine` should be mapped from the JSON attribute `second-line`.  Whenever we use the `@JsonProperty` we also capture the type required to instantiate the object within the "hidden" property `design:type`.  Saving the `design:type` is critical since Typescript will remove all type information in a process known as type erasure.  Since we wish to retain the fact that `address` is of type `Address`, we will also annotate this property using `@JsonProperty("address")`.  

Note that we are not stating how but rather what we want the mapper to map.  The decorator can be implemented as follows: 

```javascript
const jsonMetadataKey = "jsonProperty";
export interface IJsonMetaData {
    	name?: string
}
export function JsonProperty(metadata:string): any {
	return Reflect.metadata(jsonMetadataKey, <IJsonMetaData>{
		name: metadata
	});
}
```

Additionally we will create these two helper methods to retrieve the associated metadata: 

```javascript
export function getClazz(target: any, propertyKey: string): any{
    return Reflect.getMetadata("design:type", target, propertyKey)
}
export function getJsonProperty<T>(target: any, propertyKey: string):  IJsonMetaData<T> {
    return Reflect.getMetadata(jsonMetadataKey, target, propertyKey);
}
```

In our mapper we are going to use the `reflect-metadata`.  [Reflect Metadata](https://www.npmjs.com/package/reflect-metadata) is a project which allows us to add metadata to types and provides a reflective API for reading this metadata.  The `reflect-metadata` project will also track `design:type` information for each annotated element.   

_As an alternative, you can store the metadata on the `Object.prototype`. This is not recommended since you will have to cater for the retrieving and storing of custom metadata and for keeping track of the design type information.  Note that the TypeScript type system will erase all the types after compiling down to JavaScript. If you have no idea what I've just said I'd recommend you to stick with `reflect-metadata`._

Now that we have a way how to represent the **what**, let's concentrate on the **how**. To do this we will create a `MapUtils` class which will contain a `deserialize` method.  We will call the `deserialize` method later on from within the `$httpService`. The basic implementation is as follows:

```javascript
class MapUtils {
	static isPrimitive(obj) {
        switch (typeof obj) {
            case "string":
            case "number":
            case "boolean":
                return true;
        }
        return !!(obj instanceof String || obj === String ||
        obj instanceof Number || obj === Number ||
        obj instanceof Boolean || obj === Boolean);
    }
	
	static getClazz(target: any, propertyKey: string): any {
		return Reflect.getMetadata("design:type", target, propertyKey)
	}
	
	static getJsonProperty<T>(target: any, propertyKey: string):  IJsonMetaData {
		return Reflect.getMetadata(jsonMetadataKey, target, propertyKey);
	}

	static deserialize<T>(clazz:{new(): T}, jsonObject) {
        if ((clazz === undefined) || (jsonObject === undefined)) return undefined;
        let obj = new clazz();
        Object.keys(obj).forEach((key) => {
            let propertyMetadataFn:(IJsonMetaData) => any = (propertyMetadata)=> {
                let propertyName = propertyMetadata.name || key;
                let innerJson = undefined;
				innerJson = jsonObject ? jsonObject[propertyName] : undefined;
                let clazz = MapUtils.getClazz(obj, key);
                if (!MapUtils.isPrimitive(clazz)) {
                    return MapUtils.deserialize(clazz, innerJson);
                } else {
                    return jsonObject ? jsonObject[propertyName] : undefined;
                }
            };

            let propertyMetadata:IJsonMetaData = MapUtils.getJsonProperty(obj, key);
            if (propertyMetadata) {
                obj[key] = propertyMetadataFn(propertyMetadata);
            } else {
                if (jsonObject && jsonObject[key] !== undefined) {
                    obj[key] = jsonObject[key];
                }
            }
        });
        return obj;
    }
}
```

We can now deserialize a `Person` as follows: 

```javascript
let example = {
                "name": "Mark", 
                "surname": "Galea", 
                "age": 30, 
                "address": {
                  "first-line": "Some where", 
                  "second-line": "Over Here",
                  "city": "In This City"
                }
              };
MapUtils.deserialize(Person, example); 
```

This will result in the following object: 

```javascript
<Person>{
  name: 'Mark',
  surname: 'Galea',
  age: 30,
  address: 
   <Address>{
     firstLine: 'Some where',
     secondLine: 'Over Here',
     city: 'In This City' } }
```
                 
                                                                                        
                                                                                            
# Mapping Arrays                                                                                            
Now that we have an implementation for a basic object let's augment our implementation so that we are able to handle Arrays. Let's convert our `Person` class to include an array of addresses: 

```javascript
class Person {
    name: string;
    surname: string;
    age: number;
    @JsonProperty('address')
    address: Address[];
    constructor() {
        this.name = undefined;
        this.surname = undefined;
        this.age = undefined;
        this.address = undefined;
    }
}
```

If we try to use the previous mapper it will result in the following incomplete mapped object: 

```javascript
<Person>{ name: 'Mark', surname: 'Galea', age: 30, address: [] }
```
The problem arises from the fact that `Address[]` uses the `Array` constructor and the design type associated with this object will hence be `Array`.  What we need is additional type information so that we know that the array contains `Address` elements.  To keep track of this information we will create a holder attribute `clazz` as follows: 

```javascript
export interface IJsonMetaData<T> {
    name?: string,
    clazz?: {new(): T}
}
const jsonMetadataKey = "jsonProperty";
export function JsonProperty<T>(metadata?:IJsonMetaData<T>|string): any {
    if (metadata instanceof String || typeof metadata === "string"){
        return Reflect.metadata(jsonMetadataKey, {
            name: metadata,
            clazz: undefined
        });
    } else {
        let metadataObj = <IJsonMetaData<T>>metadata;
        return Reflect.metadata(jsonMetadataKey, {
            name: metadataObj ? metadataObj.name : undefined,
            clazz: metadataObj ? metadataObj.clazz : undefined
        });
    }
}
```

and modify the annotation on the `Person` class: 


```javascript
class Person {
    name: string;
    surname: string;
    age: number;
    @JsonProperty({clazz: Address})
    address: Address[];
    constructor() {
        this.name = undefined;
        this.surname = undefined;
        this.age = undefined;
        this.address = undefined;
    }
}
```

Now we know that `address` is an array from the design type and we know that it contains `Address` elements from the holder attribute `clazz`.  Note that we do not need to specify the name `address` - as long as we have the `@JsonProperty` the metadata will be generated automatically.  

Finally, let's update the `MapUtils.deserializer` so that we are able to handle arrays. 

```javascript
export default class MapUtils {
    static isPrimitive(obj) {
        switch (typeof obj) {
            case "string":
            case "number":
            case "boolean":
                return true;
        }
        return !!(obj instanceof String || obj === String ||
        obj instanceof Number || obj === Number ||
        obj instanceof Boolean || obj === Boolean);
    }

    static isArray(object) {
        if (object === Array) {
            return true;
        } else if (typeof Array.isArray === "function") {
            return Array.isArray(object);
        }
        else {
            return !!(object instanceof Array);
        }
    }

    static deserialize<T>(clazz:{new(): T}, jsonObject) {
        if ((clazz === undefined) || (jsonObject === undefined)) return undefined;
        let obj = new clazz();
        Object.keys(obj).forEach((key) => {
            let propertyMetadataFn:(IJsonMetaData) => any = (propertyMetadata)=> {
                let propertyName = propertyMetadata.name || key;
                let innerJson = jsonObject ? jsonObject[propertyName] : undefined;
                let clazz = getClazz(obj, key);
                if (MapUtils.isArray(clazz)) {
                    let metadata = getJsonProperty(obj, key);
                    if (metadata.clazz || MapUtils.isPrimitive(clazz)) {
                        if (innerJson && MapUtils.isArray(innerJson)) {
                            return innerJson.map(
                                (item)=> MapUtils.deserialize(metadata.clazz, item)
                            );
                        } else {
                            return undefined;
                        }
                    } else {
                        return innerJson;
                    }

                } else if (!MapUtils.isPrimitive(clazz)) {
                    return MapUtils.deserialize(clazz, innerJson);
                } else {
                    return jsonObject ? jsonObject[propertyName] : undefined;
                }
            };

            let propertyMetadata = getJsonProperty(obj, key);
            if (propertyMetadata) {
                obj[key] = propertyMetadataFn(propertyMetadata);
            } else {
                if (jsonObject && jsonObject[key] !== undefined) {
                    obj[key] = jsonObject[key];
                }
            }
        });
        return obj;
    }
}
```

Using the shiny new mapper we are now able to map the JSON data: 

```javascript
MapUtils.deserialize(Person, {
     "name": "Mark",
     "surname": "Galea",
     "age": 30,
     "address": [{
         "first-line": "Some where",
         "second-line": "Over Here",
         "city": "In This City"
     }]
})
```

```javascript
<Person>{
  name: 'Mark',
  surname: 'Galea',
  age: 30,
  address: 
   [ <Address>{
       firstLine: 'Some where',
       secondLine: 'Over Here',
       city: 'In This City' 
     } 
   ] 
}
```

# Interoperability with AngularJs
Now that we have created our `MapUtil` utility, let's create a generic class `HttpService` and integrate this with the `$http` service in AngularJs.  This service will wrap the AngularJS `$http` service so as to automatically handle deserialization of objects to the downstream components.

```javascript
export default class HttpService {
    public getSingle<T>(clazz: {new(): T},  url:string, headers?:{}):IPromise<T> {
        var deferred = this.$q.defer();
        this.$http.get(url, this.getHeaders(headers)).then(response => {
            if (response.data){
                deferred.resolve(
                    MapUtils.deserialize(clazz, response.data)
                );
            } else {
                deferred.resolve(undefined);
            }
        }, this.errorCallback(deferred));
        return deferred.promise;
    }
}
```
  
We can augment the `$httpService` to allow deserialization of JSON arrays by including the following method: 

```javascript
export default class HttpService {
    ...
    public getAll<T>(clazz: {new(): T},  url:string, headers?:{}):IPromise<T[]> {
        var deferred = this.$q.defer();
        this.$http.get(url, this.getHeaders(headers)).then(response => {
            if (response.data){
                let data = [];
                response.data.forEach(
                    (dataPoint)=> 
                        data.push(MapUtils.deserialize(clazz, dataPoint)));
                deferred.resolve(data);
            } else {
                deferred.resolve([]);
            }
        }, this.errorCallback(deferred));
        return deferred.promise;
    }
}
```
  
We can use this service in two ways: 

```javascript
this.httpService.getSingle(Person, PERSON_URL).then(person => {
    // Fully mapped person
});
```

```javascript
this.httpService.getAll(Person, PERSON_URL).then(persons => {
    persons.forEach(person => // do something with a fully mapped person ); 
});
```
  
  

# Conclusion
In this post we have created a custom deserializer which can convert JSON objects (which do not follow the camelCase convention) into TypeScript objects.  This deserializer allows us to write code which uses the dot notation rather than the bracket notation and hence keeps all types in check. If you are interested further in this artifact, I'd suggest you give this [article](http://www.mzan.com/article/34727936-typescript-bracket-notation-property-access.shtml) a read.  Stay safe and keep hacking!