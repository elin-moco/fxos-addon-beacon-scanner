/* global ScreenLayout, Event */

(function($$) {
  var MASK_ID = 'beacon-scanner-mask';
  var BEACONS_ID = 'beacons';
  var WAVE_ID = 'elec-wave';
  var SCANNER_ID = 'beacon-scanner';
  var SCAN_INTERVAL = 3000;
  var AVG_SIZE = 4;
  var measurement = {};
  var positioning = false;
  var scanning = false;
  var connection = null;
  var beaconSlots;
  var beaconElems;
  var wakeLock;
  var screenLocked = false;

  function randomBeaconSlots() {
    var hSlots = window.screen.width / 120;
    var vSlots = window.screen.height / 80;
    var slots = [];
    for (var i = 0; i < hSlots; i++) {
      for (var j = 0; j < vSlots; j++) {
        var slot = {
          right: i * 120 + Math.round(Math.random() * 20) - 20,
          bottom: j * 80 + Math.round(Math.random() * 30)
        };
        slot.distance = Math.sqrt(Math.pow(slot.right, 2) + Math.pow(slot.bottom, 2));
        slots.push(slot);
      }
    }
    slots.sort(function(a, b) {
      return a.distance - b.distance;
    });
    return slots.slice(1);
  }

  // If injecting into an app that was already running at the time
  // the app was enabled, simply initialize it.
  if (document.documentElement) {
    initialize();
  }

  // Otherwise, we need to wait for the DOM to be ready before
  // starting initialization since add-ons are usually (always?)
  // injected *before* `document.documentElement` is defined.
  else {
    window.addEventListener('DOMContentLoaded', initialize);
  }
  function onScreenUnlocked() {
    screenLocked = false;
  }
  function onScreenLocked() {
    screenLocked = true;
  }
  window.addEventListener('lockscreen-appclosed', onScreenUnlocked);
  window.addEventListener('lockscreen-appopened', onScreenLocked);

  function initialize() {
    try {
      // Remove existing control, for when this addon is re-run.
      var existingContainerEl = $$(MASK_ID);
      if (existingContainerEl) {
        existingContainerEl.parentNode.removeChild(existingContainerEl);
      }

      var maskEl = document.createElement('div');
      maskEl.setAttribute('id', MASK_ID);
      maskEl.setAttribute('style', 'pointer-events: none;');

      var beaconsEl = document.createElement('div');
      beaconsEl.setAttribute('id', BEACONS_ID);

      var waveEl = document.createElement('div');
      waveEl.setAttribute('id', WAVE_ID);
      waveEl.setAttribute('style', 'display: none;');


      // Build the brightness control elements.
      var scannerEl = document.createElement('div');
      scannerEl.setAttribute('id', SCANNER_ID);
      scannerEl.setAttribute('class', 'visible');
      scannerEl.setAttribute('data-time-inserted', Date.now());
      scannerEl.setAttribute('data-z-index-level', 'software-buttons');
      scannerEl.setAttribute('style', 'right: -22px; bottom: -22px; opacity: 0.5; pointer-events: all;');

      var targetDragDistance = Math.min(window.screen.width, window.screen.height) / 2;
      var dragStartX, dragStartY, dragMoveX, dragMoveY, dragDeltaX, dragDeltaY,
        btnBottom, btnRight, touchTime, movement, dragging = false, dragDistance;
      scannerEl.addEventListener('touchstart', function(evt) {
        try {
          scannerEl.setAttribute('class', 'visible');
          waveEl.removeAttribute('class');
          waveEl.style.transform = 'scale(1.0)';
          waveEl.style.opacity = 1.0;
          dragging = true;
          dragDistance = 0;
          movement = dragMoveX = dragMoveY = 0;
          touchTime = new Date().getTime();
          var touches = evt.changedTouches;
          dragStartX = touches[0].pageX;
          dragStartY = touches[0].pageY;
          btnRight = parseInt(scannerEl.style.right);
          btnBottom = parseInt(scannerEl.style.bottom);
          maskEl.style.backgroundColor = 'rgba(0,0,0,0.2)';
          maskEl.removeAttribute('class');
          evt.preventDefault();
        } catch (e) {
          console.error(e);
        }
      });
      scannerEl.addEventListener('touchmove', function(evt) {
        try {
          var touches = evt.changedTouches;
          dragDeltaX = touches[0].pageX - dragStartX - dragMoveX;
          dragDeltaY = touches[0].pageY - dragStartY - dragMoveY;
          dragMoveX = touches[0].pageX - dragStartX;
          dragMoveY = touches[0].pageY - dragStartY;
          var newRight = btnRight - dragMoveX;
          var newBottom = btnBottom - dragMoveY;
          dragDistance = Math.sqrt(Math.pow(newBottom, 2) + Math.pow(newRight, 2));
          var newPos = Math.max(newRight, newBottom);
          if (newPos > -22 && newPos < 6) {
            scannerEl.style.right = newPos + 'px';
            scannerEl.style.bottom = newPos + 'px';
          }
          if (newPos >= 6) {
            waveEl.style.display = 'block';
            waveEl.style.transform = 'scale(' + dragDistance / targetDragDistance * 10 + 1 + ')';
            waveEl.style.opacity = 1 - dragDistance / targetDragDistance / 2;
          } else {
            waveEl.style.display = 'none';
          }

          var opacity = Math.min(0.5, dragDistance / targetDragDistance / 2);
          scannerEl.style.opacity = opacity + 0.5;
          maskEl.style.backgroundColor = 'rgba(0,0,0,' + (opacity + 0.2) + ')';
        } catch (e) {
          console.error(e);
        }
      });
      window.openScanner = function() {
        waveEl.style.transform = 'unset';
        waveEl.style.opacity = 'unset';
        waveEl.classList.add('scanning');
        scannerEl.style.right = '6px';
        scannerEl.style.bottom = '6px';
        maskEl.style.backgroundColor = 'rgba(0,0,0,0.7)';
        maskEl.style.pointerEvents = 'all';
      };
      window.closeScanner = function() {
        waveEl.classList.add('transit-out');
        waveEl.classList.remove('scanning');
        waveEl.style.transform = 'scale(1.0)';
        waveEl.style.opacity = 0;
        scannerEl.className += ' transit-out';
        scannerEl.style.right = '-22px';
        scannerEl.style.bottom = '-22px';
        maskEl.style.backgroundColor = 'rgba(0,0,0,0)';
        maskEl.style.pointerEvents = 'none';
        beaconsEl.textContent = '';
      };
      scannerEl.addEventListener('touchend', function(evt) {
        try {
          maskEl.className += ' transit-out';
          if (dragDistance > targetDragDistance) {
            window.openScanner();
            if (!positioning) {
              startPositioning();
            }
          }
          else {
            window.closeScanner();
            if (positioning) {
              stopPositioning();
            }
          }
          dragging = false;
        } catch (e) {
          console.error(e);
        }
      });
      // Inject the elements into the system app
      maskEl.appendChild(scannerEl);
      maskEl.appendChild(beaconsEl);
      maskEl.appendChild(waveEl);
      $$('screen').appendChild(maskEl);
    } catch (err) {
      console.error(err);
    }
  }
  function onScannerDisabled() {
    document.removeEventListener('scanner-disabled', onScannerDisabled);
    var existingContainerEl = $$(MASK_ID);
    if (existingContainerEl) {
      existingContainerEl.parentNode.removeChild(existingContainerEl);
    }
    window.removeEventListener('lockscreen-appclosed', onScreenUnlocked);
    window.removeEventListener('lockscreen-appopened', onScreenLocked);
  }
  document.addEventListener('scanner-disabled', onScannerDisabled);

  window.addBeacon = function(beacon) {
    if (!beaconSlots || 0 == beaconSlots.length) {
      return;
    }
    if (positioning) {
//       console.log(beacon);
      var slot = beaconSlots.shift();
      var beaconEl = document.querySelector('div[data-address="' + beacon.address + '"]');
      var beaconAliasEl = document.createElement('div');
      beaconAliasEl.setAttribute('class', 'beacon-alias');
      var beaconIconEl = document.createElement('div');
      beaconIconEl.setAttribute('class', 'beacon-icon');
      var beaconDetailsEl = document.createElement('div');
      beaconDetailsEl.setAttribute('class', 'beacon-details');
      beaconDetailsEl.setAttribute('style', 'height: 0px;');

      if (beacon.type === 'beacon') {
        beaconAliasEl.textContent = beacon.name ? beacon.name : 'Unknown';
        beaconIconEl.setAttribute('aria-label', 'Location');
        beaconIconEl.dataset.l10nId = 'location';
        beaconIconEl.dataset.icon = 'location';
        var beaconMajorEl = document.createElement('div');
        beaconMajorEl.setAttribute('class', 'beacon-major');
        beaconMajorEl.textContent = beacon.major;
        beaconDetailsEl.appendChild(beaconMajorEl);
        var beaconMinorEl = document.createElement('div');
        beaconMinorEl.setAttribute('class', 'beacon-minor');
        beaconMinorEl.textContent = beacon.minor;
        beaconDetailsEl.appendChild(beaconMinorEl);
      } else if (beacon.type === 'url') {
        beaconAliasEl.textContent = beacon.url;
        beaconIconEl.setAttribute('aria-label', 'Link');
        beaconIconEl.dataset.l10nId = 'link';
        beaconIconEl.dataset.icon = 'link';
        var beaconUrlEl = document.createElement('div');
        beaconUrlEl.setAttribute('class', 'beacon-url');
        beaconUrlEl.innerHTML = '<a href="' + beacon.url + '">' + beacon.url +
          '</a>';
        beaconDetailsEl.appendChild(beaconUrlEl);
      }
      beaconIconEl.innerHTML = '<span>' + Math.round(beacon.avgDistance * 10) / 10 + 'm</span>';

      var beaconDeviationEl = document.createElement('div');
      beaconDeviationEl.setAttribute('class', 'beacon-deviation');
      beaconDeviationEl.textContent = Math.round(beacon.deviation * 100) / 100;
      beaconDetailsEl.appendChild(beaconDeviationEl);
      var beaconRssiEl = document.createElement('div');
      beaconRssiEl.setAttribute('class', 'beacon-rssi');
      beaconRssiEl.textContent = beacon.rssi + 'dBm';
      beaconDetailsEl.appendChild(beaconRssiEl);
      var beaconNameEl = document.createElement('div');
      beaconNameEl.setAttribute('class', 'beacon-name');
      beaconNameEl.textContent = beacon.name ? beacon.name : 'Unknown';
      beaconDetailsEl.appendChild(beaconNameEl);
      var beaconAddressEl = document.createElement('div');
      beaconAddressEl.setAttribute('class', 'beacon-address');
      beaconAddressEl.textContent = beacon.address;
      beaconDetailsEl.appendChild(beaconAddressEl);
      var beaconUuidEl = document.createElement('div');
      beaconUuidEl.setAttribute('class', 'beacon-uuid');
      beaconUuidEl.textContent = beacon.uuid;
      beaconDetailsEl.appendChild(beaconUuidEl);
      var beaconTxEl = document.createElement('div');
      beaconTxEl.setAttribute('class', 'beacon-tx');
      beaconTxEl.textContent = beacon.txPower + 'dBm';
      beaconDetailsEl.appendChild(beaconTxEl);
      if (!beaconEl) {
        beaconEl = document.createElement('div');
        beaconEl.setAttribute('class', 'beacon');
        beaconEl.style.right = '-120px';
        beaconEl.style.bottom = '-80px';
        beaconEl.dataset.address = beacon.address;
        beaconEl.dataset.right = slot.right;
        beaconEl.dataset.bottom = slot.bottom;
        document.querySelector('#beacons').appendChild(beaconEl);
        beaconEl.style.right = beaconEl.dataset.right + 'px';
        beaconEl.style.bottom = beaconEl.dataset.bottom + 'px';
        if (beacon.type === 'beacon') {
          beaconEl.addEventListener('click', function() {
            if (beaconEl.classList.contains('connected')) {
              beaconEl.classList.remove('connected');
              beaconElems.forEach(function(beaconElem) {
                beaconElem.style.right = beaconElem.dataset.right + 'px';
                beaconElem.style.bottom = beaconElem.dataset.bottom + 'px';
              });
            } else {
              beaconEl.classList.add('connected');
              beaconEl.style.right = (window.screen.width - beaconEl.offsetWidth) / 2 + 'px';
              beaconEl.style.bottom = (window.screen.height - beaconEl.offsetHeight) / 2 + 'px';
              beaconElems.forEach(function(beaconElem) {
                if (beaconElem.dataset.address !== beacon.address) {
                  beaconElem.style.right = '-120px';
                  beaconElem.style.bottom = '-80px';
                }
              });
            }
          });
        } else if (beacon.type === 'url') {
          beaconEl.addEventListener('click', function() {
            if (screenLocked) {
              window.dispatchEvent(new CustomEvent('lockscreen-request-unlock'));
            }
            if (positioning) {
              window.closeScanner();
              if (positioning) {
                window.stopPositioning();
              }
            }
            //FIXME: currently hardcode app launch here, might need to figure out a good way to launch app from URL.
            if (beacon.url === 'http://mzl.tpe') {
              new MozActivity({
                name: "tour",
                data: {
                  location: "moz-tpe-4f"
                }
              });
            } else {
              new MozActivity({
                name: "view",
                data: {
                  type: "url",
                  url: beacon.url
                }
              });
            }
          });
        }
        beaconElems.push(beaconEl);
      } else {
        beaconEl.innerHTML = '';
      }
      beaconEl.appendChild(beaconAliasEl);
      beaconEl.appendChild(beaconIconEl);
      beaconEl.appendChild(beaconDetailsEl);
    }
  };

  function gotBeacon(record, rssi) {
    var beacon = record;
    beacon.rssi = rssi;
    beacon.distance = calculateDistance(record.txPower, rssi);

    measurement[record.address] = measurement[record.address] || [];
    measurement[record.address] =
      measurement[record.address].slice(
        Math.max(measurement[record.address].length - AVG_SIZE, 0),
        measurement[record.address].length);

    measurement[record.address].push(beacon.distance);

    var avg = measurement[record.address].reduce((curr, val) => {
        curr += val;
        return curr;
      }, 0) / measurement[record.address].length;

    var sd = Math.sqrt(measurement[record.address].reduce((curr, val) => {
        curr += Math.pow(val - avg, 2);
        return curr;
      }, 0) / measurement[record.address].length);

    beacon.avgDistance = avg;
    beacon.deviation = sd;

    addBeacon(beacon);
  }

  window.startPositioning = function() {
//     console.log('startPositioning');
    positioning = true;
    beaconSlots = randomBeaconSlots();
    beaconElems = [];
    scanBeacons();
    wakeLock = window.navigator.requestWakeLock('screen');
  };

  window.stopPositioning = function() {
//     console.log('stopPositioning');
    positioning = false;
    navigator.mozBluetooth.defaultAdapter.stopLeScan(connection);
    scanning = false;
    wakeLock.unlock();
  };

  function scanBeacons() {
    try {
//       console.log('scanBeacons');
      if (scanning && !positioning) {
        console.error('skip scan');
        return;
      }
      scanning = true;
      navigator.mozBluetooth.defaultAdapter.startLeScan([]).then(handle => {
//         console.log('Start LE scan', handle);
        connection = handle;
        handle.ondevicefound = e => {
//           console.log('device found!', e.device);
          try {
            var record = parseScanRecord(e.device, e.scanRecord);
            if (record) {
              //console.log('beacon record: ', record);
              gotBeacon(record, e.rssi);
            }
          } catch (err) {
            console.error(err);
          }
        };

        setTimeout(function() {
          try {
            navigator.mozBluetooth.defaultAdapter.stopLeScan(handle);
          } catch (err) {
            console.error('Error stop scanning', err);
          }
          setTimeout(() => {
              scanBeacons();
          }, 1000);
        }, SCAN_INTERVAL);

      }, err => {
        console.error('Start LE Scan failed', err);
        setTimeout(scanBeacons, 2000);
      });
    } catch (err) {
      console.error('Error scanning beacons', err);
    }
  }

  if (navigator.mozBluetooth) {
    navigator.mozBluetooth.addEventListener('attributechanged', function(e) {
      //if (e.attrs[0] !== 'defaultAdapter' || !navigator.mozBluetooth.defaultAdapter)
      //  return;
      //startPositioning();
    });

    if (!!navigator.mozBluetooth.defaultAdapter) {
      //startPositioning();
    }
  }

  function calculateDistance(txPower, rssi) {
    if (rssi === 0) {
      return -1.0;
    }
    var ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    }
    else {
      //return (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
      return (0.89976) * Math.pow(ratio, 6.3095) + 0.111;
    }
  }

  var EDDYSTONE_SCHEMES = {
    0x00: 'http://www.',
    0x01: 'https://www.',
    0x02: 'http://',
    0x03: 'https://'
  };
  var EDDYSTONE_ENCODING = {
    0x00: '.com/',
    0x01: '.org/',
    0x02: '.edu/',
    0x03: '.net/',
    0x04: '.info/',
    0x05: '.biz/',
    0x06: '.gov/',
    0x07: '.com',
    0x08: '.org',
    0x09: '.edu',
    0x0a: '.net',
    0x0b: '.info',
    0x0c: '.biz',
    0x0d: '.gov'
  };

  function parseScanRecord(device, scanRecord) {
    var view = new Uint8Array(scanRecord);

    //console.log(device);
    //console.log(bytesToHex(view));

    // Company ID does not have fixed length, so find out where to start by
    // finding 0x02, 0x15 in byes 4..8
    for (var start = 4; start < 8; start++) {
      if (view[start] === 0x02 && view[start + 1] === 0x15) {
        break;
      }
    }

    if (start === 8) {
      if (view[9] === 0xAA && view[10] === 0xFE) {
        if (view[11] === 0x10) {
          //eddystone-URL beacon
          var scheme = EDDYSTONE_SCHEMES[view[13]];
          var urlEnd = false;
          var encode = true;
          var url = Array.prototype.map.call(view.slice(14, 32), function(b) {
            if (urlEnd) {
              return '';
            }
            if(b < 14 && encode) {
              encode = false;
              return EDDYSTONE_ENCODING[b];
            } else if (b < 32 || b >= 127) {
              encode = false;
              urlEnd = true;
              return '';
            } else {
              if ([35,47,63].indexOf(b) >= 0) {
                encode = false;
              }
              return String.fromCharCode(b);
            }
          }).join('');
          if (scheme && url) {
            return {
              uuid: 'FEAA',
              type: 'url',
              txPower: view[12] - 0x100,
              name: device.name,
              address: device.address,
              url: scheme + url
            }
          }
        }
      }
      //console.log('invalid');
      return;
    }

    // Now UUID is the next 16 bytes right after 0x15
    start += 2;
    var uuid = bytesToHex(view.slice(start, start + 16));

    // major / minor are two bytes each
    start += 16;
    var major = (view[start] & 0xff) * 0x100 + (view[start + 1] & 0xff);

    start += 2;
    var minor = (view[start] & 0xff) * 0x100 + (view[start + 1] & 0xff);

    start += 2;
    var txPower = view[start] - 0x100;
    //var txPower = -73; // 1 meter distance

    return {
      uuid: uuid, type: 'beacon', major: major, minor: minor, txPower: txPower,
      name: device.name, address: device.address
    };
  }

  var hexArray = '0123456789ABCDEF'.split('');

  function bytesToHex(bytes) {
    var hex = [];
    for (var j = 0; j < bytes.length; j++) {
      var v = bytes[j] & 0xff;
      hex[j * 2] = hexArray[v >>> 4];
      hex[j * 2 + 1] = hexArray[v & 0x0f];
    }
    return hex.join('');
  }

}(document.getElementById.bind(document)));
