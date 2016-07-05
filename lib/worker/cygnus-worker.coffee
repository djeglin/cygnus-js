fetchedPages = []

self.onmessage = (msg) ->
  data = JSON.parse(msg.data)

  if data.task is "fetch"
    console.info "[Cygnus worker]: Fetching " + data.link
    unless fetchedPages.indexOf(data.link) isnt -1
      getPage data.link
      .then (response) ->
        fetchedPages.push data.link
        sendToBrowser 
          link: data.link,
          html: response
      , (error) ->
        console.error "[Cygnus worker]: Failed!", error
  if data.task is "add"
    console.info "[Cygnus worker]: Adding " +data.link+ " to list without fetching."
    unless fetchedPages.indexOf(data.link) isnt -1
      fetchedPages.push data.link
    
getPage = (url) ->
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

sendToBrowser = (data) ->
  postMessage JSON.stringify(data)