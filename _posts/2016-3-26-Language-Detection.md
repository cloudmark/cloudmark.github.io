---
layout: post
title: Language Detection using N-Grams
image: /images/language/language.png
---

<img class="title" src="{{ site.baseurl }}/images/language/language.png"/> Lately I have revisited language detection and I thought it would be quite interesting to create a system which detects languages through [N-Gram](https://en.wikipedia.org/wiki/N-gram)s using Javascript. Firstly, in today's post, I will describe what NGrams are and give a general description of how we can use them to create a language detector.  In the next post we will take a deep dive and implement this language detector using Javascript.  

So how does it work? 
The system is based on calculating and comparing _language profiles_ of N-gram frequencies. The system generates a _language profile_ for the N-grams in particular language by using training data for the language in question and later uses these profiles to make its detection. Given a novel document to be classified, the system computes the N-gram profile of this document (_document profile_) and compares the _distance_ between this _document profile_ and the _language profiles_ for all the supported languages. The _language profile_ with the minimal distance is considered to represent the detected language.  

# N-Grams
So what is exactly an N-Gram?  N-Gram is an N-character slice of a longer string.  Typically one would slice the string into a set of overlapping N-grams.  In our system we will use N-Grams of various lengths simultaneously.  _Note: We would want this to be configurable._   We will also append blanks to the beginning and end of strings in order to help with matching the _beginning-of-word_ and _end-of-word_ situations.  We will represent this using the `_` character.  Given the word `TEXT` we would obtain the following N-Grams

 - **bi-grams** `_T`, `TE`, `EX`, `XT`, `T_`
 - **tri-grams** `_TE`, `TEX`, `EXT`, `XT_`, `T__`
 - **quad-grams** `_TEX`, `TEXT`, `EXT_`, `XT__`, `T___`

In general a string of length \\(k\\), padded with blanks, will have \\(k+1\\) bi-grams, \\(k+1\\) tri-grams, \\(k+1\\) quad-grams and so on.  

#Why does this all work?
Human language has some words which are used more than others.  For example you can imagine that in a document the word _the_ will occur more frequently than the word _aardvark_.  Moreover there is always a small set of words which dominates most of the language in terms of frequency of use.  This is true both for words in a particular language and also for words in a particular category.  Thus words which appear in a sporty document will be different from the words that appear in a political document and words which are in the English language will obviously be different from words which are in the French language.  

Well it turns out that these small fragments of words (N-grams) also obey (approximately) the same property.  Thus given a document in a particular language we will always find a set of N-grams which dominate - you can visualise these N-grams as a language palette from which words are formed.  These set of N-grams will be different for each language.  If we use this language detector on small fragments of text we are less susceptible to noise hence making our language detection more resilient. 

#Pre-processing
Generation of the _language profiles_ is easy.  Given an input document the following steps have to be performed:

  - Remove any extra spacing and make sure that there is always a letter before a punctuation mark; `a.` is good while `a .` is bad.  
  - Discard all the digits and punctuation except for apostrophes. Note that before removing the `.` punctuation we need to make sure that we pad appropriately with the `_` character. 
  - Split the input document into separate tokens so as to have a list of words where each word consists only of letters, apostrophes and the substituted underscore character.
  - Spit the document into three parts; _train_, _validation_ and _test_ in the ratio \\(0.7\\), \\(0.2\\), and \\(0.1\\) respectively.  The split can be calculated using both sentences and words as the atomic elements, we will use both and decide which system works best at a later stage.  Put the partitioned document into three separate folders; train, validate and test.
  - Scan down each token generating all possible N-grams, for \\(N=1 \rightarrow 5\\).  Use positions that span the padding blanks as well.  
  - Use a hash table to find the counter associated with the particular N-gram and increment it.  When done sort the counts in reverse order by the number of occurrences and take the top \\(n\\) N-Grams (_limit_).  The result is the N-gram frequency profile of the language.  We will need to optimise the limit parameter using the validation data.


#What to expect
From other language detection frameworks implemented we know that we should expect the following results:

- The top 300 or so N-grams are almost always highly correlated to the language.  Thus the _language profile_ of a sporty document will be very similar to the _language profile_ generated from a political document in the same language.  This gives us confidence that if we train the system on the Declaration of Human Right we will still be able to classify documents to the correct language even though they might have completely different topics. 
- The highest ranking N-grams are mostly uni-grams and simply reflect the distribution of characters in a language.  After uni-grams N-grams representing _prefixes_ and _suffixes_ should be the most popular.  
- Starting at around rank 300 or so, an N-gram frequency profile begins to become specific to the topic.  

#How to compare N-gram models
Given that we have created the _language profile_ for the languages we will support, how do we detect what language a text fragment is in? First thing we need to do is to repeat the pre-processing steps discussed in the previous section creating the _document profile_ for the text fragment.  Next, we take the _document profile_ and calculate a simple rank-order statistic which we call the ``out of place'' measure. This measure determines how far out of place an N-gram in one profile is from its place in another profile.  For example given the following: 

  - **English Language Profile** [`TH`, `ING`, `ON`, `ER`, `AND`, `ED`]
  - **Sample Document Profile** [`TH`, `ER`, `ON`, `LE`, `ING`, `AND`]

The out-of-place rank would be \\(0 + 2 + 0 + K  + 3 + 1\\).  `ER` in the _language profile_ is two places down from its place 
in the _document profile_ while 'AND' ranks one place higher - in both cases we always include the absolute difference. \\(K\\) represents a fixed cost for an N-gram which is not found.  

In order to classify a sample document we compute the overall distance measure between the _document profile_ and the _language profile_ 
for each language using the out-of-place measure and then pick the language which has the smallest difference.  Alternatively we could 
also rank them and present the user with a ranked list of detected languages.  

#Conclusion
In this post we described a technique for detecting language by using the N-gram model.  If things are still unclear don't despair things will be clearer once you get your hands dirty! Hope to see you all in the next post.  Stay safe and keep hacking!