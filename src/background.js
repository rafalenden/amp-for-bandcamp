chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'fetch') {
    fetch(message.url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) =>
        sendResponse({ data: Array.from(new Uint8Array(buffer)) }),
      )
      .catch((error) => sendResponse({ error: error.message }));
    return true; // keep message channel open for async response
  }
});
