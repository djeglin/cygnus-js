# Cygnus-js
Fast, graceful JS-based page loading without going full SPA

*It takes a lot of work under the surface to look this graceful*

Cygnus-js is an NPM module which aims to increase the speed and improve the interactions on static websites by pre-fetching local-domain links found as the user navigates around your site and then loading them via javascript from that cache, rather than relying on requesting each page as a link is clicked. 

The heavy lifting here is handled by a worker script rather than in the main javascript thread, allowing all other interactions to progress smoothly whilst pages are quietly fetched and cached in the background. 

### Why not just create a Single Page Application (SPA)?
SPAs are notoriously bad for SEO purposes, at least without expending a good deal of effort to make them crawlable by the likes of Google's search bots. They also won't work where javascript is not available, again unless the creator puts in a lot of work to make their website isomorphic, running the same or similar code on both client and server. 

Whilst there is definitely a place for SPAs on the web today, that place shouldn't be for static websites. It seems incredibly pointless to bring a full javascript routing and rendering engine to the party when simple html pages will do, so Cygnus-js provides the best of both worlds – Smoothly-displayed, performant content that is also crawlable and directly-linkable. 

## Installing
Not now... But soon! 

## How does Cygnus-js work?

### The worker

### Transitions

