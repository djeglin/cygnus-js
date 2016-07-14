/* global Blob, Worker, XMLHttpRequest */

const _arguments = arguments

module.exports = {
  supportsHistory: !!window.history,
  supportsWorkers: !!window.Worker,
  supportsPromises: !!Promise,
  ready: false,
  pages: {},
  init: function () {
    // Exit if history api, workers and promises aren't all supported
    if (!this.supportsHistory || !this.supportsWorkers || !this.supportsPromises) {
      console.info('[Cygnus]: cygnus is not supported in this browser.')
      return false
    }

    if (!this.ready) {
      window.cygnus = this
      window.onpopstate = this.handlePopState
      this.ready = true
    }

    // Start up the worker if it hasn't already been started
    if (typeof this.cygnusWorker === 'undefined') {
      const workerSrc = document.querySelector('[data-cygnus-worker]').getAttribute('data-src')
      this.ajaxPromise(workerSrc).then(response => {
        const blob = new Blob([response])
        this.cygnusWorker = new Worker(window.URL.createObjectURL(blob))
        this.completeInit()
      }, (error) => {
        console.error('[Cygnus]: Worker initialisation failed!', error)
      })
    } else {
      this.completeInit()
    }
  },
  completeInit: function () {
    // Respond to the worker
    this.cygnusWorker.onmessage = (e) => {
      this.receivePageData(JSON.parse(e.data))
    }

    // Add current page without re-fectching it
    if (!this.pages[window.location.href]) this.getCurrentPage()

    // Get list of links and send them off to the worker
    const links = this.getLinks()
    for (const k of links) {
      links.map(() => this.dispatchLink(k, links[k]))
    }

    // Handle clicks on links
    this.catchLinks(links)
  },
  getCurrentPage: function () {
    console.info("[Cygnus]: Current page isn't in store. Adding from html already loaded in browser.")
    // Add the current page's html to the store
    this.pages[window.location.href] = this.parseHTML(document.documentElement.outerHTML)
    const messageData = { task: 'add', link: window.location.href }
    // Notify the worker that this page doesn't need to be fetched
    this.cygnusWorker.postMessage(JSON.stringify(messageData))
  },
  getLinks: function () {
    let documentLinks = document.querySelectorAll('a[href]')
    documentLinks = Array.prototype.slice.call(documentLinks, 0)
    return documentLinks.filter(this.filterLinks)
  },
  filterLinks: function (link) {
    return link.hostname === window.location.hostname
  },
  dispatchLink: function (key, link) {
    // We don't dispatch the link to the worker if it has already been fetched
    if (!this.pages[link]) {
      const messageData = { task: 'fetch', link: link.href }
      this.cygnusWorker.postMessage(JSON.stringify(messageData))
    }
  },
  catchLinks: function (links) {
    links.forEach((link, i) => {
      // We clone these links in case they already have eventlisteners applied.
      // This removes them
      const clone = link.cloneNode(true)
      link.parentNode.replaceChild(clone, link)
      clone.addEventListener('click', (e) => {
        e.preventDefault()
        if (this.href !== window.location.href) {
          this.startLoadPage(this.href, true)
        }
      })
    })
  },
  handlePopState: function (event) {
    if (this.ready) {
      this.startLoadPage(document.location)
      return true
    }
  },
  startLoadPage: function (href, click = false) {
    // Get the page from the store. We use "cygnus" rather than "this" here as
    // this method can be called from outside the local scope
    const page = this.pages[href]

    // If the requested page isn't in the store for some reason, navigate as
    // normal
    if (!page) {
      window.location.assign(href)
      return false
    }

    // Outro animation...
    const outro = page.querySelector('body').getAttribute('data-outro')
    if (outro && !!this.isFunction(outro, window)) {
      this.getFunction(outro, window).then((response) => {
        this.completeLoadPage(href, click, page)
      }, () => {
        console.error('[Cygnus]: Outro animation promise errorred. Broken :(')
      })
    } else {
      this.completeLoadPage(href, click, page)
    }
  },
  completeLoadPage: function (href, click, page) {
    // If we get this far, the page is in the store and we should update the
    // history object
    if (click) window.history.pushState({ url: href }, '', href)

    // Set the page title from the stored page
    document.title = page.querySelector('title').innerText

    // Set animation attributes on body tag
    let outro = page.querySelector('body').getAttribute('data-outro')
    let intro = page.querySelector('body').getAttribute('data-intro')

    if (outro) {
      document.body.setAttribute('data-outro', outro)
    } else {
      document.body.removeAttribute('data-outro')
    }

    if (intro) {
      document.body.setAttribute('data-intro', intro)
    } else {
      document.body.removeAttribute('data-intro')
    }

    // Remove any per-page css file if needed, and add the new one from the page
    // to be loaded if present
    const documentStylesheet = document.querySelector("link[data-rel='page-css']")
    if (documentStylesheet) {
      documentStylesheet.parentNode.removeChild(documentStylesheet)
    }

    const pageStylesheet = page.querySelector("link[data-rel='page-css']")
    if (pageStylesheet) {
      document.querySelector('head').appendChild(pageStylesheet.cloneNode(true))
    }

    // Replace only the content within our page wrapper, as the stuff outside
    // that will remain unchanged
    // TODO: Think about whether we need to change body classes etc
    const wrapper = document.querySelector('.wrap')
    const pageContent = page.querySelector('.wrap').cloneNode(true).innerHTML
    wrapper.innerHTML = pageContent

    // Intro animation...
    intro = page.querySelector('body').getAttribute('data-intro')
    if (intro && !!this.isFunction(intro, window)) {
      this.getFunction(intro, window).then(response => {
        // Re-run the init method. This time it won't start the worker (it is
        // already running). Basically it will just check for new links and
        // dispatch them to the worker if needed
        this.init()
      }, () => {
        console.error('[Cygnus]: Intro animation promise errorred. Broken :(')
      })
    } else {
      this.init()
    }
  },
  receivePageData: function (data) {
    // Add received page to the store
    this.pages[data.link] = this.parseHTML(data.html)
  },

  //
  // UTILITY FUNCTIONS
  // These are internal utility functions that are used elsewhere in the script.
  // They aren't really useful externally, and I did have them in a separate
  // utils file originally, but if this is ever going to be bundled up for NPM
  // usage the script will need to be self contained, so I moved them here.
  //

  ajaxPromise: function (url) {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest()
      req.open('GET', url)

      req.onload = () => {
        if (req.status === 200) {
          resolve(req.response)
        } else {
          reject(new Error(req.statusText))
        }
      }

      req.onerror = () => { reject(new Error('Network Error')) }

      req.send()
    })
  },
  parseHTML: function (string) {
    const tmp = document.implementation.createHTMLDocument('temp')
    tmp.documentElement.innerHTML = string
    return tmp.documentElement
  },
  isFunction: function (functionName, context) {
    const namespaces = functionName.split('.')
    const func = namespaces.pop()
    for (let k of namespaces) {
      context = context[namespaces[k]]
    }
    return typeof context[func] === 'function'
  },
  getFunction: function (functionName, context) {
    const args = [].slice.call(_arguments).splice(2)
    const namespaces = functionName.split('.')
    const func = namespaces.pop()
    for (let k of namespaces) {
      context = context[namespaces[k]]
    }
    if (context[func]) {
      return context[func].apply(context, args)
    } else {
      return false
    }
  }
}
