(function() {
  var MASK_ID = 'beacon-scanner-mask';
  var script = document.createElement('script');
  script.type = "text/javascript";
  script.src = browser.extension.getURL("beacon-scanner.js");
  if (document.body) {
    document.body.appendChild(script);
    script.onload = function() {
      document.body.removeChild(script);
    };
  }

  function onEnabledStateChange(event) {
    var app = event.application;
    if (app.manifest.name === 'System - Beacon Scanner' && !app.enabled) {
      navigator.mozApps.mgmt.removeEventListener('enabledstatechange', onEnabledStateChange);
      document.dispatchEvent(new CustomEvent('scanner-disabled'));
    }
  }
  navigator.mozApps.mgmt.addEventListener('enabledstatechange', onEnabledStateChange);
}());
