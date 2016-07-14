'use strict';

/* global Blob, Worker, XMLHttpRequest */

var _arguments = arguments;

module.exports = {
  supportsHistory: !!window.history,
  supportsWorkers: !!window.Worker,
  supportsPromises: !!Promise,
  ready: false,
  pages: {},
  init: function init() {
    var _this = this;

    // Exit if history api, workers and promises aren't all supported
    if (!this.supportsHistory || !this.supportsWorkers || !this.supportsPromises) {
      console.info('[Cygnus]: cygnus is not supported in this browser.');
      return false;
    }

    if (!this.ready) {
      window.cygnus = this;
      window.onpopstate = this.handlePopState;
      this.ready = true;
    }

    // Start up the worker if it hasn't already been started
    if (typeof this.cygnusWorker === 'undefined') {
      var workerSrc = document.querySelector('[data-cygnus-worker]').getAttribute('data-src');
      this.ajaxPromise(workerSrc).then(function (response) {
        var blob = new Blob([response]);
        _this.cygnusWorker = new Worker(window.URL.createObjectURL(blob));
        _this.completeInit();
      }, function (error) {
        console.error('[Cygnus]: Worker initialisation failed!', error);
      });
    } else {
      this.completeInit();
    }
  },
  completeInit: function completeInit() {
    var _this2 = this;

    // Respond to the worker
    this.cygnusWorker.onmessage = function (e) {
      _this2.receivePageData(JSON.parse(e.data));
    };

    // Add current page without re-fectching it
    if (!this.pages[window.location.href]) this.getCurrentPage();

    // Get list of links and send them off to the worker
    var links = this.getLinks();
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      var _loop = function _loop() {
        var k = _step.value;

        links.map(function () {
          return _this2.dispatchLink(k, links[k]);
        });
      };

      for (var _iterator = links[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        _loop();
      }

      // Handle clicks on links
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    this.catchLinks(links);
  },
  getCurrentPage: function getCurrentPage() {
    console.info("[Cygnus]: Current page isn't in store. Adding from html already loaded in browser.");
    // Add the current page's html to the store
    this.pages[window.location.href] = this.parseHTML(document.documentElement.outerHTML);
    var messageData = { task: 'add', link: window.location.href };
    // Notify the worker that this page doesn't need to be fetched
    this.cygnusWorker.postMessage(JSON.stringify(messageData));
  },
  getLinks: function getLinks() {
    var documentLinks = document.querySelectorAll('a[href]');
    documentLinks = Array.prototype.slice.call(documentLinks, 0);
    return documentLinks.filter(this.filterLinks);
  },
  filterLinks: function filterLinks(link) {
    return link.hostname === window.location.hostname;
  },
  dispatchLink: function dispatchLink(key, link) {
    // We don't dispatch the link to the worker if it has already been fetched
    if (!this.pages[link]) {
      var messageData = { task: 'fetch', link: link.href };
      this.cygnusWorker.postMessage(JSON.stringify(messageData));
    }
  },
  catchLinks: function catchLinks(links) {
    var _this3 = this;

    links.forEach(function (link, i) {
      // We clone these links in case they already have eventlisteners applied.
      // This removes them
      var clone = link.cloneNode(true);
      link.parentNode.replaceChild(clone, link);
      clone.addEventListener('click', function (e) {
        e.preventDefault();
        if (_this3.href !== window.location.href) {
          _this3.startLoadPage(_this3.href, true);
        }
      });
    });
  },
  handlePopState: function handlePopState(event) {
    if (this.ready) {
      this.startLoadPage(document.location);
      return true;
    }
  },
  startLoadPage: function startLoadPage(href) {
    var _this4 = this;

    var click = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

    // Get the page from the store. We use "cygnus" rather than "this" here as
    // this method can be called from outside the local scope
    var page = this.pages[href];

    // If the requested page isn't in the store for some reason, navigate as
    // normal
    if (!page) {
      window.location.assign(href);
      return false;
    }

    // Outro animation...
    var outro = page.querySelector('body').getAttribute('data-outro');
    if (outro && !!this.isFunction(outro, window)) {
      this.getFunction(outro, window).then(function (response) {
        _this4.completeLoadPage(href, click, page);
      }, function () {
        console.error('[Cygnus]: Outro animation promise errorred. Broken :(');
      });
    } else {
      this.completeLoadPage(href, click, page);
    }
  },
  completeLoadPage: function completeLoadPage(href, click, page) {
    var _this5 = this;

    // If we get this far, the page is in the store and we should update the
    // history object
    if (click) window.history.pushState({ url: href }, '', href);

    // Set the page title from the stored page
    document.title = page.querySelector('title').innerText;

    // Set animation attributes on body tag
    var outro = page.querySelector('body').getAttribute('data-outro');
    var intro = page.querySelector('body').getAttribute('data-intro');

    if (outro) {
      document.body.setAttribute('data-outro', outro);
    } else {
      document.body.removeAttribute('data-outro');
    }

    if (intro) {
      document.body.setAttribute('data-intro', intro);
    } else {
      document.body.removeAttribute('data-intro');
    }

    // Remove any per-page css file if needed, and add the new one from the page
    // to be loaded if present
    var documentStylesheet = document.querySelector("link[data-rel='page-css']");
    if (documentStylesheet) {
      documentStylesheet.parentNode.removeChild(documentStylesheet);
    }

    var pageStylesheet = page.querySelector("link[data-rel='page-css']");
    if (pageStylesheet) {
      document.querySelector('head').appendChild(pageStylesheet.cloneNode(true));
    }

    // Replace only the content within our page wrapper, as the stuff outside
    // that will remain unchanged
    // TODO: Think about whether we need to change body classes etc
    var wrapper = document.querySelector('.wrap');
    var pageContent = page.querySelector('.wrap').cloneNode(true).innerHTML;
    wrapper.innerHTML = pageContent;

    // Intro animation...
    intro = page.querySelector('body').getAttribute('data-intro');
    if (intro && !!this.isFunction(intro, window)) {
      this.getFunction(intro, window).then(function (response) {
        // Re-run the init method. This time it won't start the worker (it is
        // already running). Basically it will just check for new links and
        // dispatch them to the worker if needed
        _this5.init();
      }, function () {
        console.error('[Cygnus]: Intro animation promise errorred. Broken :(');
      });
    } else {
      this.init();
    }
  },
  receivePageData: function receivePageData(data) {
    // Add received page to the store
    this.pages[data.link] = this.parseHTML(data.html);
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
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = namespaces[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var _k = _step2.value;

        context = context[namespaces[_k]];
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    return typeof context[func] === 'function';
  },
  getFunction: function getFunction(functionName, context) {
    var args = [].slice.call(_arguments).splice(2);
    var namespaces = functionName.split('.');
    var func = namespaces.pop();
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = namespaces[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var _k2 = _step3.value;

        context = context[namespaces[_k2]];
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }

    if (context[func]) {
      return context[func].apply(context, args);
    } else {
      return false;
    }
  }
};