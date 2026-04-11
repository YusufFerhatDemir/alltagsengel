
var b64 = window._b64Chunks.join('');
var binary = atob(b64);
var bytes = new Uint8Array(binary.length);
for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
var blob = new Blob([bytes], {type: 'image/png'});
var file = new File([blob], 'icon-512x512.png', {type: 'image/png'});
var fi = document.querySelector('input[type="file"]');
var dt = new DataTransfer();
dt.items.add(file);
fi.files = dt.files;
fi.dispatchEvent(new Event('change', {bubbles: true}));
window._uploadDone = 'Size: ' + file.size;
