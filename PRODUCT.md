# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Practising software engineers who arrive on a long-form tutorial from search or social links, usually to understand one technique (functional programming, Scala, actors, event-driven systems, Kubernetes) well enough to use it. A second, overlapping audience is people discovering Mark Galea's open-source work (Cats-Actors, EventStore) and deciding whether to try it.

## Product Purpose
Mark Galea's personal technical blog (cloudmark.github.io), written since 2016. It teaches through deep, worked tutorials with runnable code, and it is the home of his open-source projects: a reader should finish a post understanding the idea, and be able to find and try the project behind it.

## Positioning
Written by the person who builds the tools: posts are long, practical walkthroughs with real code, real output and runnable samples, often organised as series around a project (Cats-Actors, EventStore, Language Detection). Personal voice, humour and running characters (ACME, Wile E. Coyote, Alice and Bob) rather than corporate documentation.

## Operating Context
Readers mostly arrive on a single post, read for a long time, copy code, and follow links to GitHub repositories and samples. Posts mix prose, code blocks, tables, Mermaid diagrams, MathJax maths, embedded illustrations and occasionally live demos.

## Capabilities and Constraints
- Jekyll site built and deployed by classic GitHub Pages from the `master` branch: no custom build step, only GitHub Pages–supported plugins.
- Existing post URLs (`/:title/`) must keep working.
- Disqus comments, MathJax and Mermaid must keep working in existing posts.
- Series are expressed as post tags backed by `_data/series.yml` (eventstore, cats-actors, language-detection).
- How prominently series and projects feature is delegated to the design.

## Brand Commitments
- Name: Mark Galea; handle: cloudmark.
- The avatar photo and the tagline "stay safe, keep hacking!" stay part of the identity; posts sign off "As always, stay safe, keep hacking!".
- Project identities are their own: the Cats-Actors astronaut-cat illustration, and the EventStore "e" mark (images/eventstore/).

## Evidence on Hand
- ~25 posts in `_posts/` (2016–2026) with title images in `images/`.
- Project artwork: `images/cats-actors/`, `images/eventstore/`, `images/language/`.
- No testimonials, metrics or press are on hand; do not fabricate any.

## Product Principles
1. The post is the product: reading long technical content comfortably comes first.
2. Every idea is backed by runnable code; make code and samples easy to read, copy and follow.
3. Projects are discoverable from the writing, and the writing from the projects.
4. Personal over corporate: the author's voice and humour stay visible.
