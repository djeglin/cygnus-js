module.exports = 

  supportsHistory: !!window.history
  supportsWorkers: !!window.Worker
  supportsPromises: !!Promise
  
  ready: false
  pages: {}

  init: () ->
    # Exit if history api, workers and promises aren't all supported
    unless this.supportsHistory and this.supportsWorkers and this.supportsPromises
      console.info "[Cygnus]: cygnus is not supported in this browser. Exiting."
      return false

    that = this

    unless this.ready
      # Expose to global scope
      window.cygnus = this
      # Handle popstate events
      window.onpopstate = this.handlePopState
      this.ready = true

    # Start up the worker if it hasn't already been started
    if (typeof(this.cygnusWorker) is 'undefined')
      workerSrc = document.querySelector('[data-cygnus-worker]').getAttribute "data-src"
      cygnus.ajaxPromise(workerSrc)
        .then (response) ->
          blob = new Blob [response]
          cygnus.cygnusWorker = new Worker(window.URL.createObjectURL(blob))
          cygnus.completeInit()
        , (error) ->
          console.error "[Cygnus]: Worker initialisation failed!", error
    else
      this.completeInit()

  completeInit: () ->
    # Respond to the worker
    cygnus.cygnusWorker.onmessage = (e) ->
      cygnus.receivePageData JSON.parse(e.data)

    # Add current page without re-fectching it
    unless !!cygnus.pages[location.href]
      cygnus.getCurrentPage()

    # Get list of links and send them off to the worker
    links = cygnus.getLinks()
    for key, link of links
      cygnus.dispatchLink(key, link)

    # Handle clicks on links
    cygnus.catchLinks links

  getCurrentPage: () ->
    console.info "[Cygnus]: Current page isn\'t in store. Adding from html already loaded in browser."
    # Add the current page's html to the store
    this.pages[location.href] = cygnus.parseHTML document.documentElement.outerHTML
    messageData = 
      task: "add",
      link: location.href
    # Notify the worker that this page doesn't need to be fetched
    this.cygnusWorker.postMessage JSON.stringify(messageData)

  getLinks: () ->
    documentLinks = document.querySelectorAll "a[href]"
    documentLinks = Array.prototype.slice.call(documentLinks, 0)
    localLinks = documentLinks.filter this.filterLinks

  filterLinks: (link) ->
    localDomain = location.hostname
    return link.hostname == localDomain

  dispatchLink: (key, link) ->
    # We don't dispatch the link to the worker if it has already been fetched
    unless !!this.pages[link]
      messageData = 
        task: "fetch",
        link: link.href
      this.cygnusWorker.postMessage JSON.stringify(messageData)

  catchLinks: (links) ->
    that = this
    links.forEach (link, i) ->
      # We clone these links in case they already have eventlisteners applied. This removes them
      clone = link.cloneNode true
      link.parentNode.replaceChild clone, link
      clone.addEventListener "click", (e) ->
        e.preventDefault()
        that.startLoadPage(this.href, true) unless this.href is location.href
  
  handlePopState: (event) ->
    if cygnus.ready
      cygnus.startLoadPage document.location
      return true

  startLoadPage: (href, click = false) ->
    # Get the page from the store. We use "cygnus" rather than "this" here as this method can be called from outside the local scope
    page = cygnus.pages[href]

    # If the requested page isn't in the store for some reason, navigate as normal
    if !page
      window.location.assign href
      return false

    # Outro animation...
    outro = page.querySelector('body').getAttribute('data-outro')
    if outro? and !!cygnus.isFunction(outro, window)
      cygnus.getFunction outro, window
        .then (response) ->
          cygnus.completeLoadPage(href, click, page)
        , (error) ->
          console.error "[Cygnus]: Outro animation promise errorred. Broken :("
    else
      this.completeLoadPage(href, click, page)

  completeLoadPage: (href, click, page) ->
    # If we get this far, the page is in the store and we should update the history object
    history.pushState({ url : href }, "", href) if click

    # Set the page title from the stored page
    pageTitle = page.querySelector('title').innerText
    document.title = pageTitle

    # Set animation attributes on body tag
    pageBody = page.querySelector 'body'
    docBody = document.body
    outro = pageBody.getAttribute 'data-outro'
    intro = pageBody.getAttribute 'data-intro'
    bodyClass = pageBody.getAttribute 'class'

    if bodyClass? then docBody.setAttribute 'class', bodyClass else docBody.removeAttribute 'class'
    if outro? then docBody.setAttribute "data-outro", outro else docBody.removeAttribute "data-outro"
    if intro? then docBody.setAttribute "data-intro", intro else docBody.removeAttribute "data-intro"

    # Remove any per-page css file if needed, and add the new one from the page to be loaded if present
    documentStylesheet = document.querySelector "link[data-rel='page-css']"
    documentStylesheet.parentNode.removeChild(documentStylesheet) if !!documentStylesheet
    pageStylesheet = page.querySelector "link[data-rel='page-css']"
    document.querySelector('head').appendChild(pageStylesheet.cloneNode(true)) if !!pageStylesheet

    # Replace only the content within our page wrapper, as the stuff outside that will remain unchanged
    wrapper = document.querySelector '.wrap'
    pageContent = page.querySelector('.wrap').cloneNode(true).innerHTML
    wrapper.innerHTML = pageContent

    # Intro animation...
    intro = page.querySelector('body').getAttribute('data-intro')
    if intro? and !!cygnus.isFunction(intro, window)
      cygnus.getFunction intro, window
        .then (response) ->
          cygnus.postLoadPage()
        , (error) ->
          console.error "[Cygnus]: Intro animation promise errorred. Broken :("
    else
      this.postLoadPage()

  postLoadPage: () ->
    # Re-run the init method. This time it won't start the worker (it is already running)
    # Basically it will just check for new links and dispatch them to the worker if needed
    cygnus.init()
  
  receivePageData: (data) ->
    # Add received page to the store
    this.pages[data.link] = cygnus.parseHTML data.html

  # 
  # UTILITY FUNCTIONS
  # These are internal utility functions that are used elsewhere in the script.
  # They aren't really useful externally, and I did have them in a separate utils
  # file originally, but if this is ever going to be bundled up for NPM usage
  # the script will need to be self contained, so I moved them here. 
  # 

  ajaxPromise: (url) ->
    return new Promise (resolve, reject) ->
      req = new XMLHttpRequest()
      req.open('GET', url)

      req.onload = () ->
        if req.status == 200
          resolve req.response
        else 
          reject Error(req.statusText)

      req.onerror = () ->
        reject Error("Network Error")

      req.send();

  parseHTML: (string) ->
    tmp = document.implementation.createHTMLDocument("temp")
    tmp.documentElement.innerHTML = string
    return tmp.documentElement

  isFunction: (functionName, context) ->
    args = [].slice.call(arguments).splice(2)
    namespaces = functionName.split('.')
    func = namespaces.pop()
    for i of namespaces
      context = context[namespaces[i]]
    return typeof(context[func]) is "function"

  getFunction: (functionName, context) ->
    args = [].slice.call(arguments).splice(2)
    namespaces = functionName.split('.')
    func = namespaces.pop()
    for i of namespaces
      context = context[namespaces[i]]
    if !!context[func]
      return context[func].apply context, args
    else
      return false