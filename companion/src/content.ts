window.onload = () => {
  console.log("hi");
};

chrome.runtime.sendMessage({ action: "pageLoaded" }, (response) => {
  console.log("Service worker response:", response);
});
