// Re-highlight code blocks in tabs when they become visible
// (highlight.js may skip hidden elements)
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".tab-header").forEach(function (btn) {
    btn.addEventListener("click", function () {
      // Small delay to let the tab content become visible
      setTimeout(function () {
        document.querySelectorAll(".tab-content.active pre code").forEach(function (block) {
          if (!block.dataset.highlighted) {
            hljs.highlightBlock(block);
            block.dataset.highlighted = "true";
          }
        });
      }, 50);
    });
  });
});
