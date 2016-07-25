var _arguments = arguments;

/* global cygnus, Blob, Worker, XMLHttpRequest */

var cygnus = module.exports = {
  supportsHistory: !!window.history,
  supportsWorkers: !!window.Worker,
  supportsPromises: !!Promise,
  ready: false,
  fetchingPages: [],
  pages: {},
  init: opts => {

    const defaults = {
      contentWrapper: '.wrap',
      makeGlobal: false
    };

    if (!cygnus.ready) {
      window.onpopstate = cygnus.handlePopState;
      cygnus.options = Object.assign({}, defaults, opts);
      if (cygnus.options.makeGlobal) window.cygnus = cygnus;
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
  completeInit: () => {
    // Respond to the worker
    cygnus.cygnusWorker.onmessage = e => {
      cygnus.receivePageData(JSON.parse(e.data));
    };

    // Add current page without re-fectching it
    if (!cygnus.pages[window.location.href]) cygnus.getCurrentPage();

    // Get list of links and send them off to the worker
    let links = cygnus.getLinks();
    links.map((current, index, arr) => cygnus.dispatchLink(index, arr[index]));

    // Handle clicks on links
    cygnus.catchLinks(links);
  },
  getCurrentPage: () => {
    console.info("[Cygnus]: Current page isn't in store. Adding from html already loaded in browser.");
    // Add the current page's html to the store
    cygnus.pages[window.location.href] = cygnus.parseHTML(document.documentElement.outerHTML);
    const messageData = { task: 'add', link: window.location.href };
    // Notify the worker that this page doesn't need to be fetched
    cygnus.cygnusWorker.postMessage(JSON.stringify(messageData));
  },
  getLinks: () => {
    let documentLinks = document.querySelectorAll('a[href]');
    documentLinks = Array.prototype.slice.call(documentLinks, 0);
    return documentLinks.filter(cygnus.filterLinks);
  },
  filterLinks: link => {
    return link.hostname === window.location.hostname;
  },
  dispatchLink: (key, link) => {
    // We don't dispatch the link to the worker if it is already being fetched
    if (cygnus.fetchingPages.indexOf(link.href) > -1) {
      console.info("[Cygnus]: " + link.href + " is already being fetched. Ignoring.");
      return;
    }
    // We don't dispatch the link to the worker if it has already been fetched
    if (!cygnus.pages[link]) {
      cygnus.fetchingPages.push(link.href);
      const messageData = { task: 'fetch', link: link.href };
      cygnus.cygnusWorker.postMessage(JSON.stringify(messageData));
    }
  },
  catchLinks: links => {
    links.forEach((link, i) => {
      // We clone these links in case they already have eventlisteners applied.
      // This removes them
      const clone = link.cloneNode(true);
      link.parentNode.replaceChild(clone, link);
      clone.addEventListener('click', function (e) {
        e.preventDefault();
        if (this.href !== window.location.href) cygnus.startLoadPage(this.href, true);
      });
    });
  },
  handlePopState: event => {
    if (cygnus.ready) {
      cygnus.startLoadPage(document.location);
      return true;
    }
  },
  startLoadPage: (href, click = false) => {
    // Get the page from the store. We use "cygnus" rather than "this" here as
    // this method can be called from outside the local scope
    const page = cygnus.pages[href];

    // If the requested page isn't in the store for some reason, navigate as
    // normal
    if (!page) {
      window.location.assign(href);
      return false;
    }

    // Outro animation...
    const outro = page.querySelector('body').getAttribute('data-outro');
    if (outro && !!cygnus.isFunction(outro, window)) {
      cygnus.getFunction(outro, window).then(response => {
        cygnus.completeLoadPage(href, click, page);
      }, () => {
        console.error('[Cygnus]: Outro animation promise errorred. Broken :(');
      });
    } else {
      cygnus.completeLoadPage(href, click, page);
    }
  },
  completeLoadPage: (href, click, page) => {

    // Set the page title from the stored page
    document.title = page.querySelector('title').innerText;

    // Set animation attributes on body tag
    let pageBody = page.querySelector('body');
    let docBody = document.body;
    let outro = pageBody.getAttribute('data-outro');
    let intro = pageBody.getAttribute('data-intro');
    let bodyClass = pageBody.getAttribute('class');
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
    const documentStylesheets = document.querySelectorAll("link[data-rel='page-css']");
    for (var i = 0, max = documentStylesheets.length; i < max; i++) {
      documentStylesheets[i].parentNode.removeChild(documentStylesheets[i]);
    }

    const pageStylesheets = page.querySelectorAll("link[data-rel='page-css']");
    for (var j = 0, max = pageStylesheets.length; j < max; j++) {
      document.querySelector('head').appendChild(pageStylesheets[i].cloneNode(true));
    }

    // Replace only the content within our page wrapper, as the stuff outside
    // that will remain unchanged
    const wrapper = document.querySelector(cygnus.options.contentWrapper);
    const pageContent = page.querySelector(cygnus.options.contentWrapper).cloneNode(true).innerHTML;
    wrapper.innerHTML = pageContent;

    // Update the history object
    if (click) window.history.pushState({ url: href }, '', href);

    // Intro animation...
    intro = page.querySelector('body').getAttribute('data-intro');
    if (intro && !!cygnus.isFunction(intro, window)) {
      cygnus.getFunction(intro, window).then(response => {
        cygnus.postLoadPage();
      }, () => {
        console.error('[Cygnus]: Intro animation promise errorred. Broken :(');
      });
    } else {
      cygnus.postLoadPage();
    }
  },
  postLoadPage: () => {
    // Re-run the init method. This time it won't start the worker (it is
    // already running). Basically it will just check for new links and dispatch
    // them to the worker if needed
    cygnus.init();

    const event = new CustomEvent('cygnusPageLoaded', { "detail": { "page": location.pathname } });
    window.dispatchEvent(event);
  },
  receivePageData: data => {
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

  ajaxPromise: url => {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.open('GET', url);

      req.onload = () => {
        if (req.status === 200) {
          resolve(req.response);
        } else {
          reject(new Error(req.statusText));
        }
      };

      req.onerror = () => {
        reject(new Error('Network Error'));
      };

      req.send();
    });
  },
  parseHTML: string => {
    const tmp = document.implementation.createHTMLDocument('temp');
    tmp.documentElement.innerHTML = string;
    return tmp.documentElement;
  },
  isFunction: (functionName, context) => {
    let namespaces = functionName.split('.');
    const func = namespaces.pop();
    for (let k in namespaces) {
      context = context[namespaces[k]];
    }
    return typeof context[func] === 'function';
  },
  getFunction: (functionName, context) => {
    const args = [].slice.call(_arguments).splice(2);
    const namespaces = functionName.split('.');
    const func = namespaces.pop();
    for (const k in namespaces) {
      context = context[namespaces[k]];
    }
    if (context[func]) {
      return context[func].apply(context, args);
    } else {
      return false;
    }
  },

  workerBlob: URL.createObjectURL(new Blob([`const fetchedPages = [];
    self.onmessage = msg => {
      const data = JSON.parse(msg.data);

      if (data.task === 'fetch') {
        console.info("[Cygnus worker]: Fetching " + data.link);
        if (fetchedPages.indexOf(data.link) < 0) {
          getPage(data.link).then(response => {
            fetchedPages.push(data.link);
            sendToBrowser({ link: data.link, html: response });
          }, error => {
            console.error('[Cygnus worker]: Failed!', error);
          });
        }
      }
      if (data.task === 'add') {
        console.info("[Cygnus worker]: Adding " + data.link + " to list without fetching.");
        if (fetchedPages.indexOf(data.link) < 0) {
          fetchedPages.push(data.link);
        }
      }
    }
    function getPage(url) {
      return new Promise((resolve, reject) => {
        const req = new XMLHttpRequest();
        req.open('GET', url);

        req.onload = () => {
          if (req.status === 200) {
            resolve(req.response);
          } else {
            reject(new Error(req.statusText));
          }
        };

        req.onerror = () => {
          reject(new Error('Network Error'));
        };

        req.send();
      });
    }
    function sendToBrowser(data) {
      self.postMessage(JSON.stringify(data));
    }`], { type: 'application/javascript' }))
};