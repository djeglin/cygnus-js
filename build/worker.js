'use strict';

/* global self, XMLHttpRequest */
var fetchedPages = [];

self.onmessage = function (msg) {
  var data = JSON.parse(msg.data);

  if (data.task === 'fetch') {
    console.info('[Cygnus worker]: Fetching ' + data.link);
    if (fetchedPages.indexOf(data.link) < 0) {
      getPage(data.link).then(function (response) {
        fetchedPages.push(data.link);
        sendToBrowser({ link: data.link, html: response });
      }, function (error) {
        console.error('[Cygnus worker]: Failed!', error);
      });
    }
  }
  if (data.task === 'add') {
    console.info('[Cygnus worker]: Adding ' + data.link + ' to list without fetching.');
    if (fetchedPages.indexOf(data.link) < 0) {
      fetchedPages.push(data.link);
    }
  }
};

function getPage(url) {
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
}

function sendToBrowser(data) {
  self.postMessage(JSON.stringify(data));
}
