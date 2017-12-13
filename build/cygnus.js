'use strict';

var _arguments = arguments;

/* global cygnus, Blob, Worker, XMLHttpRequest */

var cygnus = module.exports = {
  supportsHistory: !!window.history,
  supportsWorkers: !!window.Worker,
  supportsPromises: !!Promise,
  ready: false,
  fetchingPages: [],
  pages: {},
  init: function init(opts) {

    var defaults = {
      contentWrapper: '.wrap',
      makeGlobal: false
    };

    if (!cygnus.ready) {
      window.onpopstate = cygnus.handlePopState;
      cygnus.options = Object.assign({}, defaults, opts);
      if (cygnus.options.makeGlobal) window.cygnus = cygnus;
      window.addEventListener("scroll", cygnus.debounce(function () {
        var st = window.pageYOffset || document.documentElement.scrollTop;
        window.history.replaceState({ url: location.href, scrollTop: st }, '', location.href);
      }, 100));
      cygnus.ready = true;
    }

    // Exit if history api, workers and promises aren't all supported
    if (!cygnus.supportsHistory || !cygnus.supportsWorkers || !cygnus.supportsPromises) {
      console.info('[Cygnus]: cygnus is not supported in this browser.');
      return false;
    }

    // Start up the worker if it hasn't already been started
    if (typeof cygnus.cygnusWorker === 'undefined') {
      cygnus.cygnusWorker = new Worker(cygnus.workerBlob);
      cygnus.completeInit();
    } else {
      cygnus.completeInit();
    }
  },
  completeInit: function completeInit() {
    // Respond to the worker
    cygnus.cygnusWorker.onmessage = function (e) {
      cygnus.receivePageData(JSON.parse(e.data));
    };

    // Add current page without re-fectching it
    if (!cygnus.pages[window.location.href]) cygnus.getCurrentPage();

    // Get list of links and send them off to the worker
    var links = cygnus.getLinks();
    links.map(function (current, index, arr) {
      return cygnus.dispatchLink(index, arr[index]);
    });

    // Handle clicks on links
    cygnus.catchLinks(links);
  },
  getCurrentPage: function getCurrentPage() {
    console.info("[Cygnus]: Current page isn't in store. Adding from html already loaded in browser.");
    // Add the current page's html to the store
    cygnus.pages[window.location.href] = cygnus.parseHTML(document.documentElement.outerHTML);
    var messageData = { task: 'add', link: window.location.href };
    // Notify the worker that this page doesn't need to be fetched
    cygnus.cygnusWorker.postMessage(JSON.stringify(messageData));
  },
  getLinks: function getLinks() {
    var documentLinks = document.querySelectorAll('a[href]');
    documentLinks = Array.prototype.slice.call(documentLinks, 0);
    return documentLinks.filter(cygnus.filterLinks);
  },
  filterLinks: function filterLinks(link) {
    return link.hostname === window.location.hostname;
  },
  dispatchLink: function dispatchLink(key, link) {
    // We don't dispatch the link to the worker if it is already being fetched
    if (cygnus.fetchingPages.indexOf(link.href) > -1) {
      console.info("[Cygnus]: " + link.href + " is already being fetched. Ignoring.");
      return;
    }
    // We don't dispatch the link to the worker if it has already been fetched
    if (!cygnus.pages[link]) {
      cygnus.fetchingPages.push(link.href);
      var messageData = { task: 'fetch', link: link.href };
      cygnus.cygnusWorker.postMessage(JSON.stringify(messageData));
    }
  },
  catchLinks: function catchLinks(links) {
    links.forEach(function (link, i) {
      // We clone these links in case they already have eventlisteners applied.
      // This removes them
      var clone = link.cloneNode(true);
      link.parentNode.replaceChild(clone, link);
      clone.addEventListener('click', function (e) {
        e.preventDefault();
        if (this.href !== window.location.href) cygnus.startLoadPage(this.href, true);
      });
    });
  },
  handlePopState: function handlePopState(event) {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    if (cygnus.ready) {
      cygnus.startLoadPage(document.location);
      return true;
    }
  },
  startLoadPage: function startLoadPage(href) {
    var click = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    // Get the page from the store. We use "cygnus" rather than "this" here as
    // this method can be called from outside the local scope
    var page = cygnus.pages[href];

    // If the requested page isn't in the store for some reason, navigate as
    // normal
    if (!page) {
      window.location.assign(href);
      return false;
    }

    // Outro animation...
    var outro = page.querySelector('body').getAttribute('data-outro');
    if (outro && !!cygnus.isFunction(outro, window)) {
      cygnus.getFunction(outro, window).then(function (response) {
        cygnus.completeLoadPage(href, click, page);
      }, function () {
        console.error('[Cygnus]: Outro animation promise errorred. Broken :(');
      });
    } else {
      cygnus.completeLoadPage(href, click, page);
    }
  },
  completeLoadPage: function completeLoadPage(href, click, page) {

    // Set the page title from the stored page
    document.title = page.querySelector('title').innerText;

    // Set animation attributes on body tag
    var pageBody = page.querySelector('body');
    var docBody = document.body;
    var outro = pageBody.getAttribute('data-outro');
    var intro = pageBody.getAttribute('data-intro');
    var bodyClass = pageBody.getAttribute('class');
    if (bodyClass != null) {
      docBody.setAttribute('class', bodyClass);
    } else {
      docBody.removeAttribute('class');
    }
    if (outro != null) {
      docBody.setAttribute("data-outro", outro);
    } else {
      docBody.removeAttribute("data-outro");
    }
    if (intro != null) {
      docBody.setAttribute("data-intro", intro);
    } else {
      docBody.removeAttribute("data-intro");
    }

    // Remove any per-page css file if needed, and add the new one from the page
    // to be loaded if present
    var documentStylesheets = document.querySelectorAll("link[data-rel='page-css']");
    for (var i = 0, max = documentStylesheets.length; i < max; i++) {
      documentStylesheets[i].parentNode.removeChild(documentStylesheets[i]);
    }

    var pageStylesheets = page.querySelectorAll("link[data-rel='page-css']");
    for (var j = 0, max = pageStylesheets.length; j < max; j++) {
      document.querySelector('head').appendChild(pageStylesheets[i].cloneNode(true));
    }

    // Replace only the content within our page wrapper, as the stuff outside
    // that will remain unchanged
    var wrapper = document.querySelector(cygnus.options.contentWrapper);
    var pageContent = page.querySelector(cygnus.options.contentWrapper).cloneNode(true).innerHTML;
    wrapper.innerHTML = pageContent;

    // Update the history object
    if (click) window.history.pushState({ url: href, scrollTop: 0 }, '', href);

    // Scroll to the top of new page if from a clicked link
    var scrollTop = 0;
    if (history.state.scrollTop) {
      scrollTop = history.state.scrollTop;
    }
    window.scrollTo(0, scrollTop);

    // Intro animation...
    intro = page.querySelector('body').getAttribute('data-intro');
    if (intro && !!cygnus.isFunction(intro, window)) {
      cygnus.getFunction(intro, window).then(function (response) {
        cygnus.postLoadPage();
      }, function () {
        console.error('[Cygnus]: Intro animation promise errorred. Broken :(');
      });
    } else {
      cygnus.postLoadPage();
    }
  },
  postLoadPage: function postLoadPage() {
    // Re-run the init method. This time it won't start the worker (it is
    // already running). Basically it will just check for new links and dispatch
    // them to the worker if needed
    cygnus.init();

    var event = new CustomEvent('cygnusPageLoaded', { "detail": { "page": location.pathname } });
    window.dispatchEvent(event);
  },
  receivePageData: function receivePageData(data) {
    // Remove page from fetchingPages array
    var index = cygnus.fetchingPages.indexOf(data.link);
    if (index > -1) {
      cygnus.fetchingPages.splice(index, 1);
    }
    // Add received page to the store
    cygnus.pages[data.link] = cygnus.parseHTML(data.html);
  },

  //
  // UTILITY FUNCTIONS
  // These are internal utility functions that are used elsewhere in the script.
  // They aren't really useful externally, and I did have them in a separate
  // utils file originally, but if this is ever going to be bundled up for NPM
  // usage the script will need to be self contained, so I moved them here.
  //

  ajaxPromise: function ajaxPromise(url) {
    return new Promise(function (resolve, reject) {
      var req = new XMLHttpRequest();
      req.open('GET', url);

      req.onload = function () {
        if (req.status === 200) {
          resolve(req.response);
        } else {
          reject(new Error(req.statusText));
        }
      };

      req.onerror = function () {
        reject(new Error('Network Error'));
      };

      req.send();
    });
  },
  parseHTML: function parseHTML(string) {
    var tmp = document.implementation.createHTMLDocument('temp');
    tmp.documentElement.innerHTML = string;
    return tmp.documentElement;
  },
  isFunction: function isFunction(functionName, context) {
    var namespaces = functionName.split('.');
    var func = namespaces.pop();
    for (var k in namespaces) {
      context = context[namespaces[k]];
    }
    return typeof context[func] === 'function';
  },
  getFunction: function getFunction(functionName, context) {
    var args = [].slice.call(_arguments).splice(2);
    var namespaces = functionName.split('.');
    var func = namespaces.pop();
    for (var k in namespaces) {
      context = context[namespaces[k]];
    }
    if (context[func]) {
      return context[func].apply(context, args);
    } else {
      return false;
    }
  },
  debounce: function debounce(func, wait, immediate) {
    var timeout;
    return function () {
      var context = this,
          args = arguments;
      var later = function later() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  },

  workerBlob: URL.createObjectURL(new Blob(['const fetchedPages = [];\n    self.onmessage = function (msg) {\n      const data = JSON.parse(msg.data);\n\n      if (data.task === \'fetch\') {\n        console.info("[Cygnus worker]: Fetching " + data.link);\n        if (fetchedPages.indexOf(data.link) < 0) {\n          getPage(data.link).then(function (response) {\n            fetchedPages.push(data.link);\n            sendToBrowser({ link: data.link, html: response });\n          }, function (error) {\n            console.error(\'[Cygnus worker]: Failed!\', error);\n          });\n        }\n      }\n      if (data.task === \'add\') {\n        console.info("[Cygnus worker]: Adding " + data.link + " to list without fetching.");\n        if (fetchedPages.indexOf(data.link) < 0) {\n          fetchedPages.push(data.link);\n        }\n      }\n    }\n    function getPage(url) {\n      return new Promise(function (resolve, reject) {\n        const req = new XMLHttpRequest();\n        req.open(\'GET\', url);\n\n        req.onload = function () {\n          if (req.status === 200) {\n            resolve(req.response);\n          } else {\n            reject(new Error(req.statusText));\n          }\n        };\n\n        req.onerror = function () {\n          reject(new Error(\'Network Error\'));\n        };\n\n        req.send();\n      });\n    }\n    function sendToBrowser(data) {\n      self.postMessage(JSON.stringify(data));\n    }'], { type: 'application/javascript' }))
};