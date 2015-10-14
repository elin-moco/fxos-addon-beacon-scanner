var script = document.createElement('script');
script.type = "text/javascript";
script.src = browser.extension.getURL("beacon-scanner.js");
if (document.body) {
  document.body.appendChild(script);
  script.onload = function() {
    document.body.removeChild(script);
  };
}
