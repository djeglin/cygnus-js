# Cygnus

Fast, graceful JS-based page loading for static sites without going full SPA.

*It takes a lot of work under the surface to look this graceful*

Cygnus is an NPM module which aims to increase the speed and improve the interactions on static websites by pre-fetching local-domain links found as the user navigates around your site and then loading them via javascript from that cache, rather than relying on requesting each page as a link is clicked. 

The heavy lifting here is handled by a worker script rather than in the main javascript thread, allowing all other interactions to progress smoothly whilst pages are quietly fetched and cached in the background. 

### Why not just create a Single Page Application (SPA)?
SPAs are notoriously bad for SEO purposes, at least without expending a good deal of effort to make them crawlable by the likes of Google's search bots. They also won't work where javascript is not available, again unless the creator puts in a lot of work to make their website isomorphic, running the same or similar code on both client and server. 

Whilst there is definitely a place for SPAs on the web today, that place shouldn't be for static websites. It seems incredibly pointless to bring a full javascript routing and rendering engine to the party when simple html pages will do, so Cygnus-js provides the best of both worlds – Smoothly-displayed, performant content that is also crawlable and directly-linkable. 

### Features

##### Fully progressively enhanced
Because it isn't a full SPA framework, and still relies on there being actual html pages for your website, Cygnus fully complies with the principals of progressive enhancement. If the browser doesn't support the required features (`promises`, `workers` and the `history` api at the moment), or if JS is disabled for some reason, or even if a given link hasn't been fetched yet, your site will function as normal.

##### Framework / Library agnostic
Cygnus isn't tied to or reliant on any specific javascript libraries or frameworks, meaning it should work on pretty much any static site you drop it in to.

##### Page transitions, however you would like to do them
Cygnus isn't tied to an animation framework, either, so you can choose to implement page transitions in whatever javascript animation framework you feel most comfortable with. Why only javascript animation, you ask? Because, contrary to popular belief, it is generally more performant than css-based animation, and because it just seems to "fit" better with the philosophy of this script. 

##### Page fetching happens outside of the main javascript thread
The reason that Cygnus uses a worker to do the heavy lifting is to take the actual work of fetching pages and returning their html off the main javascript thread, leaving that free for whatever else you have going on in your pages.

### Installation

- Install through npm with `npm i cygnus -S` (recommended)
- Or download the script directly from `build` and include as you wish

### Usage

At the most basic level, you simply need to include the following in your js...

```javascript
const cygnus = require('cygnus');
cygnus.init();
```

...and the following to your html

```html
<script data-src="/path/to/worker.js"></script>
```

Cygnus, by default, will look for a container in each of your pages with a class of `wrap` and use that to replace the content within. You can override this selector by passing in an options object to the `init()` method like so:

```javascript
cygnus.init({contentWrapper: '.your-selector'})
```

That's it! Once included and initialised in your project, Cygnus will start to fetch your pages in the background and serve them up via javascript. 

#### Transitions

If you want to enable transitions for your pages, you will need to do a little more work. 

##### Create some animation functions
These functions must each return a promise that resolves once the animation is complete. See example below: 

```javascript
module.exports = {
  intros: {
    "default": function() {
      return new Promise(function(resolve, reject) {
        var animation, shim;
        shim = document.querySelector(".shim");
        shim.setAttribute("style", "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #E45353; line-height: 0; z-index: 5;");
        return animation = anime({
          targets: shim,
          height: "0",
          duration: 500,
          delay: 200,
          easing: "easeInQuint",
          complete: function() {
            shim.parentNode.removeChild(shim);
            return resolve(true);
          }
        });
      });
    }
  },
  outros: {
    "default": function() {
      return new Promise(function(resolve, reject) {
        var animation, shim;
        shim = document.createElement("div");
        shim.setAttribute("class", "shim");
        shim.setAttribute("style", "position: fixed; bottom: 0; left: 0; width: 100%; height: 0; background-color: #E45353; line-height: 0; z-index: 5;");
        document.body.appendChild(shim);
        return animation = anime({
          targets: shim,
          height: "100%",
          duration: 500,
          easing: "easeInQuint",
          complete: function() {
            return resolve(true);
          }
        });
      });
    }
  }
};
```

You will see that the animations here are using [Anime.js](http://anime-js.com), but you could equally use GSAP, Velocity or similar should you want to. The important thing is that you structure the animation functions to return a promise. This is how Cygnus knows that each stage of the outro and into animations are complete and to move on to the next thing. 

##### Reference the animations you want to use on each page

Once you have these functions, you will need to reference them on the `body` tag of each page (TODO: Add a default animation selector, perhaps? Or the ability to set one in opts?) like so: 

```html
<body data-intro="anims.intros.default" data-outro="anims.outros.default">
```

This allows Cygnus to find the animations you are using for each page. 

#### Custom CSS per page
If you want to include different css files for individual pages, then simply add a `data-rel="page-css"` attribute to the html when you insert them, like this:

```html
<link rel="stylesheet" data-rel="page-css" href="page.css">
```

Cygnus will load all css files referenced in this way when it changes pages, even though it doesn't replace the entire html of the page.


### License & Contributing

Licensed under [MIT](LICENSE)
