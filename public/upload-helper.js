(function() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://localhost:8765/icon-512x512.png', true);
  xhr.responseType = 'blob';
  xhr.onload = function() {
    if (xhr.status === 200) {
      var blob = xhr.response;
      var file = new File([blob], 'icon-512x512.png', {type: 'image/png'});
      var fi = document.querySelector('input[type="file"]');
      if (fi) {
        var dt = new DataTransfer();
        dt.items.add(file);
        fi.files = dt.files;
        fi.dispatchEvent(new Event('change', {bubbles: true}));
        fi.dispatchEvent(new Event('input', {bubbles: true}));
        window._uploadResult = 'Success! Size: ' + file.size;
      } else {
        window._uploadResult = 'No file input found';
      }
    } else {
      window._uploadResult = 'XHR error: ' + xhr.status;
    }
  };
  xhr.onerror = function() {
    window._uploadResult = 'XHR network error';
  };
  xhr.send();
})();
