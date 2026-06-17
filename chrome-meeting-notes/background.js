// Service Worker — öffnet Side Panel bei Klick auf Extension-Icon

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Side Panel Fehler:', error));
