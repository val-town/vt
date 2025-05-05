chrome.runtime.sendMessage({ action: "pageLoaded" }, (response) => {
  console.log("Response from daemon service worker: ", response);
  // Broadcast message to wake up the daemon service worker
});
