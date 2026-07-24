"use strict";
(() => {
  // src/geometry.ts
  function shouldRemapWheelToHorizontal(input) {
    return input.shiftKey && Math.abs(input.deltaY) > Math.abs(input.deltaX);
  }
  function scrollLeftForElement(container, element, currentScrollLeft, maxScrollLeft) {
    const containerCenter = container.left + container.width / 2;
    const elementCenter = element.left + element.width / 2;
    const centeredScrollLeft = currentScrollLeft + elementCenter - containerCenter;
    return Math.min(maxScrollLeft, Math.max(0, Math.round(centeredScrollLeft)));
  }

  // src/controller.ts
  var BODY_CLASS = "horizontal-panes-active";
  var SNAP_CLASS = "horizontal-panes-snap";
  var ACTIVE_PANE_CLASS = "horizontal-panes-active-pane";
  var LAST_PANE_CLASS = "horizontal-panes-last-pane";
  var MANUAL_WIDTH_CLASS = "horizontal-panes-manual-width";
  var RESIZE_TARGET_CLASS = "horizontal-panes-resize-target";
  var RESIZE_TARGET_BODY_CLASS = "horizontal-panes-pane-resize-target";
  var RESIZING_BODY_CLASS = "horizontal-panes-pane-resizing";
  var SIDEBAR_LIST_SELECTOR = ".sidebar-item-list";
  var PANE_SELECTOR = ":scope > .sidebar-item";
  var APP_CONTAINER_SELECTOR = "#app-container";
  var MAIN_CONTAINER_SELECTOR = "#left-container";
  var BLOCK_SELECTOR = ".ls-block";
  var MIN_PANE_WIDTH_PX = 360;
  var MAX_PANE_WIDTH_PX = 1600;
  var RESIZE_TARGET_INSIDE_PX = 4;
  var RESIZE_TARGET_OUTSIDE_PX = 8;
  var EDITOR_SELECTOR = [
    ".block-editor textarea",
    "textarea.block-editor",
    ".editor-inner textarea",
    ".block-editor input",
    '.block-editor [contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]'
  ].join(", ");
  var BLOCK_ACTIVATOR_SELECTORS = [
    ".block-title-wrap",
    ".block-content-inner",
    ".block-content"
  ];
  var HorizontalPanesController = class {
    enabled = false;
    options;
    host;
    sidebarList = null;
    sidebarObserver = null;
    sidebarPoll = null;
    paneScrollListeners = /* @__PURE__ */ new Set();
    paneOrder = [];
    pendingFocusFrame = null;
    pendingEditorFrame = null;
    pendingOutgoingCommit = null;
    editorRestoreGeneration = 0;
    editorBookmarks = /* @__PURE__ */ new WeakMap();
    resizeTargetPane = null;
    paneResize = null;
    constructor(options, host = {}) {
      this.options = options;
      this.host = host;
    }
    setOptions(options) {
      this.options = options;
      this.applyCssVariables();
    }
    setEnabled(nextEnabled) {
      if (nextEnabled === this.enabled) {
        this.applyCssVariables();
        return;
      }
      this.enabled = nextEnabled;
      if (nextEnabled) {
        this.activate();
      } else {
        this.deactivate();
      }
    }
    isEnabled() {
      return this.enabled;
    }
    focusMain(behavior = "smooth", restoreEditor = true) {
      const mainContainer = this.getMainContainer();
      let outgoingCommit = null;
      if (restoreEditor) {
        this.rememberCurrentEditor();
        if (mainContainer) {
          outgoingCommit = this.releaseEditorOutside(mainContainer);
        }
      }
      const appContainer = this.getAppContainer();
      if (appContainer) {
        const nextLeft = mainContainer ? this.getCenteredScrollLeft(appContainer, mainContainer) : 0;
        appContainer.scrollTo({ left: nextLeft, behavior });
      }
      this.clearActivePane();
      if (restoreEditor && mainContainer && this.enabled) {
        this.scheduleEditorRestore(mainContainer, outgoingCommit);
      }
    }
    focusAdjacentPane(direction) {
      const panes = this.getPanes();
      if (panes.length === 0) {
        this.focusMain();
        return;
      }
      const activeIndex = panes.findIndex((pane) => pane.classList.contains(ACTIVE_PANE_CLASS));
      if (activeIndex === -1) {
        if (direction < 0) {
          this.focusMain();
        } else {
          const firstPane = panes[0];
          if (firstPane) {
            this.focusPane(firstPane);
          }
        }
        return;
      }
      const nextIndex = activeIndex + direction;
      if (nextIndex < 0) {
        this.focusMain();
        return;
      }
      const nextPane = panes[Math.min(nextIndex, panes.length - 1)];
      if (nextPane) {
        this.focusPane(nextPane);
      }
    }
    moveActivePane(direction) {
      this.rememberCurrentEditor();
      const panes = this.getPanes();
      const activeIndex = panes.findIndex((pane) => pane.classList.contains(ACTIVE_PANE_CLASS));
      if (activeIndex === -1) return false;
      const targetIndex = activeIndex + direction;
      if (targetIndex < 0 || targetIndex >= panes.length) return false;
      const activePane = panes[activeIndex];
      const targetPane = panes[targetIndex];
      if (!activePane || !targetPane) return false;
      panes[activeIndex] = targetPane;
      panes[targetIndex] = activePane;
      this.paneOrder = panes;
      this.applyPaneOrder();
      this.scheduleFocus(activePane);
      return true;
    }
    destroy() {
      this.enabled = false;
      this.deactivate();
    }
    activate() {
      const body = this.getDocument().body;
      body.classList.add(BODY_CLASS);
      body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
      this.applyCssVariables();
      this.getDocument().addEventListener("wheel", this.handleWheel, {
        capture: true,
        passive: false
      });
      this.getDocument().addEventListener("pointerdown", this.handlePointerDown, true);
      this.getDocument().addEventListener("pointermove", this.handlePointerMove, {
        capture: true,
        passive: false
      });
      this.getDocument().addEventListener("pointerup", this.handlePointerUp, true);
      this.getDocument().addEventListener("pointercancel", this.handlePointerCancel, true);
      this.getDocument().addEventListener("dblclick", this.handleDoubleClick, true);
      this.getDocument().addEventListener("focusin", this.handleFocusIn, true);
      this.getDocument().addEventListener("focusout", this.handleFocusOut, true);
      this.getDocument().addEventListener("keydown", this.handleKeyDown, true);
      this.getWindow().addEventListener("blur", this.handleWindowBlur);
      this.ensureSidebarList(false);
      this.sidebarPoll = window.setInterval(() => this.ensureSidebarList(true), 400);
    }
    deactivate() {
      const document = this.getDocument();
      this.finishPaneResize();
      this.setResizeTarget(null);
      document.body.classList.remove(
        BODY_CLASS,
        SNAP_CLASS,
        RESIZE_TARGET_BODY_CLASS,
        RESIZING_BODY_CLASS
      );
      document.body.style.removeProperty("--horizontal-panes-main-width");
      document.body.style.removeProperty("--horizontal-panes-pane-width");
      document.body.style.removeProperty("--horizontal-panes-last-pane-max-width");
      document.body.style.removeProperty("--horizontal-panes-gap");
      document.body.style.removeProperty("--horizontal-panes-main-gap");
      document.removeEventListener("wheel", this.handleWheel, true);
      document.removeEventListener("pointerdown", this.handlePointerDown, true);
      document.removeEventListener("pointermove", this.handlePointerMove, true);
      document.removeEventListener("pointerup", this.handlePointerUp, true);
      document.removeEventListener("pointercancel", this.handlePointerCancel, true);
      document.removeEventListener("dblclick", this.handleDoubleClick, true);
      document.removeEventListener("focusin", this.handleFocusIn, true);
      document.removeEventListener("focusout", this.handleFocusOut, true);
      document.removeEventListener("keydown", this.handleKeyDown, true);
      this.getWindow().removeEventListener("blur", this.handleWindowBlur);
      if (this.sidebarPoll !== null) {
        window.clearInterval(this.sidebarPoll);
        this.sidebarPoll = null;
      }
      if (this.pendingFocusFrame !== null) {
        window.cancelAnimationFrame(this.pendingFocusFrame);
        this.pendingFocusFrame = null;
      }
      if (this.pendingEditorFrame !== null) {
        window.cancelAnimationFrame(this.pendingEditorFrame);
        this.pendingEditorFrame = null;
      }
      this.editorRestoreGeneration += 1;
      this.pendingOutgoingCommit = null;
      this.disconnectSidebarList();
      this.focusMain("auto", false);
    }
    applyCssVariables() {
      if (!this.enabled) return;
      const body = this.getDocument().body;
      body.style.setProperty("--horizontal-panes-main-width", `${this.options.mainWidthPx}px`);
      body.style.setProperty("--horizontal-panes-pane-width", `${this.options.paneWidthPx}px`);
      body.style.setProperty(
        "--horizontal-panes-last-pane-max-width",
        `${Math.round(this.options.paneWidthPx * 1.25)}px`
      );
      body.style.setProperty("--horizontal-panes-gap", `${this.options.paneGapPx}px`);
      body.style.setProperty("--horizontal-panes-main-gap", `${this.options.mainPaneGapPx}px`);
      body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
    }
    ensureSidebarList(focusNewestWhenAttached) {
      const nextList = this.getDocument().querySelector(SIDEBAR_LIST_SELECTOR);
      if (nextList === this.sidebarList && nextList?.isConnected) return;
      this.disconnectSidebarList();
      if (!nextList) return;
      this.sidebarList = nextList;
      this.sidebarObserver = new MutationObserver(this.handleSidebarMutations);
      this.sidebarObserver.observe(nextList, { childList: true });
      this.paneOrder = this.getNativePanes().reverse();
      this.applyPaneOrder();
      this.getPanes().forEach((pane) => this.attachPaneScrollListener(pane));
      if (focusNewestWhenAttached) {
        const panes = this.getPanes();
        const newestPane = panes.at(-1);
        if (newestPane) {
          this.scheduleFocus(newestPane);
        }
      }
    }
    disconnectSidebarList() {
      this.finishPaneResize();
      this.setResizeTarget(null);
      this.sidebarObserver?.disconnect();
      this.sidebarObserver = null;
      this.paneScrollListeners.forEach((pane) => {
        pane.removeEventListener("scroll", this.handlePaneScroll);
        pane.classList.remove(
          ACTIVE_PANE_CLASS,
          LAST_PANE_CLASS,
          MANUAL_WIDTH_CLASS,
          RESIZE_TARGET_CLASS
        );
        pane.style.removeProperty("order");
        pane.style.removeProperty("--horizontal-panes-pane-width-override");
      });
      this.paneScrollListeners.clear();
      this.paneOrder = [];
      this.sidebarList = null;
    }
    handleSidebarMutations = (mutations) => {
      const addedPanes = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof this.getWindow().Element)) continue;
          const element = node;
          if (element.matches(".sidebar-item")) {
            addedPanes.add(element);
          }
          element.querySelectorAll(".sidebar-item").forEach((pane) => addedPanes.add(pane));
        }
      }
      const nativePanes = this.getNativePanes();
      const currentPanes = new Set(nativePanes);
      if (this.paneResize && !currentPanes.has(this.paneResize.pane)) {
        this.finishPaneResize();
      }
      if (this.resizeTargetPane && !currentPanes.has(this.resizeTargetPane)) {
        this.setResizeTarget(null);
      }
      this.paneScrollListeners.forEach((pane) => {
        if (currentPanes.has(pane)) return;
        pane.removeEventListener("scroll", this.handlePaneScroll);
        pane.classList.remove(
          ACTIVE_PANE_CLASS,
          LAST_PANE_CLASS,
          MANUAL_WIDTH_CLASS,
          RESIZE_TARGET_CLASS
        );
        pane.style.removeProperty("order");
        pane.style.removeProperty("--horizontal-panes-pane-width-override");
        this.paneScrollListeners.delete(pane);
      });
      const retainedOrder = this.paneOrder.filter(
        (pane) => currentPanes.has(pane) && !addedPanes.has(pane)
      );
      const appendedOrder = nativePanes.filter((pane) => addedPanes.has(pane) || !retainedOrder.includes(pane)).reverse();
      this.paneOrder = [...retainedOrder, ...appendedOrder];
      this.applyPaneOrder();
      this.paneOrder.forEach((pane) => this.attachPaneScrollListener(pane));
      const newestPane = nativePanes.find((pane) => addedPanes.has(pane));
      if (newestPane) {
        this.scheduleFocus(newestPane);
      }
    };
    scheduleFocus(pane) {
      if (this.pendingFocusFrame !== null) {
        window.cancelAnimationFrame(this.pendingFocusFrame);
      }
      this.pendingFocusFrame = window.requestAnimationFrame(() => {
        this.pendingFocusFrame = window.requestAnimationFrame(() => {
          this.pendingFocusFrame = null;
          if (pane.isConnected && this.enabled) {
            this.focusPane(pane);
          }
        });
      });
    }
    focusPane(pane) {
      this.rememberCurrentEditor();
      const outgoingCommit = this.releaseEditorOutside(pane);
      const appContainer = this.getAppContainer();
      if (!appContainer) return;
      this.markActivePane(pane);
      const nextLeft = this.getCenteredScrollLeft(appContainer, pane);
      appContainer.scrollTo({ left: nextLeft, behavior: "smooth" });
      this.scheduleEditorRestore(pane, outgoingCommit);
    }
    getCenteredScrollLeft(appContainer, target) {
      return scrollLeftForElement(
        appContainer.getBoundingClientRect(),
        target.getBoundingClientRect(),
        appContainer.scrollLeft,
        Math.max(0, appContainer.scrollWidth - appContainer.clientWidth)
      );
    }
    markActivePane(pane) {
      this.clearActivePane();
      pane.classList.add(ACTIVE_PANE_CLASS);
    }
    clearActivePane() {
      this.sidebarList?.querySelectorAll(`.${ACTIVE_PANE_CLASS}`).forEach((pane) => pane.classList.remove(ACTIVE_PANE_CLASS));
    }
    attachPaneScrollListener(pane) {
      if (this.paneScrollListeners.has(pane)) return;
      pane.addEventListener("scroll", this.handlePaneScroll, { passive: true });
      this.paneScrollListeners.add(pane);
    }
    handlePaneScroll = () => {
      this.sidebarList?.dispatchEvent(new Event("scroll"));
    };
    handleWheel = (event) => {
      if (!this.enabled || !shouldRemapWheelToHorizontal({
        shiftKey: event.shiftKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY
      })) {
        return;
      }
      const appContainer = this.getAppContainer();
      if (!appContainer) return;
      event.preventDefault();
      appContainer.scrollLeft += event.deltaY;
    };
    handlePointerDown = (event) => {
      if (!this.enabled || event.button !== 0) return;
      const resizePane = this.findPaneResizeTarget(event.clientX, event.clientY);
      if (resizePane) {
        this.beginPaneResize(resizePane, event);
        return;
      }
      const target = event.target;
      if (!(target instanceof this.getWindow().Element)) return;
      const targetElement = target;
      const pane = targetElement.closest(".sidebar-item");
      if (pane && this.sidebarList?.contains(pane)) {
        this.rememberCurrentEditor();
        this.markActivePane(pane);
        return;
      }
      if (targetElement.closest(MAIN_CONTAINER_SELECTOR)) {
        this.rememberCurrentEditor();
        this.clearActivePane();
      }
    };
    handlePointerMove = (event) => {
      if (!this.enabled) return;
      if (!this.paneResize) {
        this.setResizeTarget(this.findPaneResizeTarget(event.clientX, event.clientY));
        return;
      }
      if (event.pointerId !== this.paneResize.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const nextWidth = Math.min(
        MAX_PANE_WIDTH_PX,
        Math.max(
          MIN_PANE_WIDTH_PX,
          Math.round(
            this.paneResize.startWidth + event.clientX - this.paneResize.startClientX
          )
        )
      );
      this.paneResize.pane.style.setProperty(
        "--horizontal-panes-pane-width-override",
        `${nextWidth}px`
      );
      this.paneResize.pane.classList.add(MANUAL_WIDTH_CLASS);
    };
    handlePointerUp = (event) => {
      if (!this.paneResize || event.pointerId !== this.paneResize.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finishPaneResize();
      this.setResizeTarget(this.findPaneResizeTarget(event.clientX, event.clientY));
    };
    handlePointerCancel = (event) => {
      if (!this.paneResize || event.pointerId !== this.paneResize.pointerId) return;
      this.finishPaneResize();
      this.setResizeTarget(null);
    };
    handleDoubleClick = (event) => {
      if (!this.enabled) return;
      const pane = this.findPaneResizeTarget(event.clientX, event.clientY);
      if (!pane) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pane.style.removeProperty("--horizontal-panes-pane-width-override");
      pane.classList.remove(MANUAL_WIDTH_CLASS);
    };
    handleWindowBlur = () => {
      this.finishPaneResize();
      this.setResizeTarget(null);
    };
    beginPaneResize(pane, event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const captureTarget = event.target instanceof this.getWindow().Element ? event.target : null;
      try {
        captureTarget?.setPointerCapture(event.pointerId);
      } catch {
      }
      this.paneResize = {
        pane,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startWidth: pane.getBoundingClientRect().width,
        captureTarget
      };
      this.setResizeTarget(pane);
      this.getDocument().body.classList.add(RESIZING_BODY_CLASS);
    }
    finishPaneResize() {
      const resize = this.paneResize;
      if (!resize) return;
      try {
        if (resize.captureTarget?.hasPointerCapture(resize.pointerId)) {
          resize.captureTarget.releasePointerCapture(resize.pointerId);
        }
      } catch {
      }
      this.paneResize = null;
      this.getDocument().body.classList.remove(RESIZING_BODY_CLASS);
    }
    findPaneResizeTarget(clientX, clientY) {
      let nearestPane = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const pane of this.getPanes()) {
        if (pane.classList.contains("collapsed")) continue;
        const rect = pane.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (clientY < rect.top || clientY > rect.bottom) continue;
        if (clientX < rect.right - RESIZE_TARGET_INSIDE_PX || clientX > rect.right + RESIZE_TARGET_OUTSIDE_PX) {
          continue;
        }
        const distance = Math.abs(clientX - rect.right);
        if (distance < nearestDistance) {
          nearestPane = pane;
          nearestDistance = distance;
        }
      }
      return nearestPane;
    }
    setResizeTarget(pane) {
      if (pane === this.resizeTargetPane) return;
      this.resizeTargetPane?.classList.remove(RESIZE_TARGET_CLASS);
      this.resizeTargetPane = pane;
      pane?.classList.add(RESIZE_TARGET_CLASS);
      this.getDocument().body.classList.toggle(RESIZE_TARGET_BODY_CLASS, pane !== null);
    }
    handleFocusIn = (event) => {
      const target = event.target;
      if (!(target instanceof this.getWindow().Element)) return;
      const container = this.getEditorContainer(target);
      if (!container) return;
      if (container.matches(".sidebar-item")) {
        this.markActivePane(container);
      } else {
        this.clearActivePane();
      }
    };
    handleFocusOut = (event) => {
      const target = event.target;
      if (!(target instanceof this.getWindow().HTMLElement)) return;
      this.rememberEditor(target);
    };
    handleKeyDown = (event) => {
      const isApplePlatform = /Mac|iPhone|iPad/.test(this.getWindow().navigator.platform);
      const modifierPressed = event.metaKey || !isApplePlatform && event.ctrlKey;
      if (!this.enabled || event.altKey || !modifierPressed) return;
      const direction = event.code === "BracketLeft" ? -1 : event.code === "BracketRight" ? 1 : null;
      if (direction === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) {
        this.moveActivePane(direction);
      } else {
        this.focusAdjacentPane(direction);
      }
    };
    rememberCurrentEditor() {
      const activeElement = this.getDocument().activeElement;
      if (!(activeElement instanceof this.getWindow().HTMLElement)) return;
      this.rememberEditor(activeElement);
    }
    rememberEditor(editor) {
      if (!editor.matches(EDITOR_SELECTOR)) return;
      const block = editor.closest(BLOCK_SELECTOR);
      const container = this.getEditorContainer(editor);
      if (!block || !container) return;
      let selectionStart = null;
      let selectionEnd = null;
      if (editor instanceof this.getWindow().HTMLTextAreaElement || editor instanceof this.getWindow().HTMLInputElement) {
        selectionStart = editor.selectionStart;
        selectionEnd = editor.selectionEnd;
      }
      this.editorBookmarks.set(container, {
        block,
        blockId: this.getBlockId(block),
        selectionStart,
        selectionEnd
      });
    }
    releaseEditorOutside(targetContainer) {
      const activeElement = this.getDocument().activeElement;
      if (!(activeElement instanceof this.getWindow().HTMLElement)) {
        return this.pendingOutgoingCommit;
      }
      if (!activeElement.matches(EDITOR_SELECTOR)) {
        return this.pendingOutgoingCommit;
      }
      if (targetContainer.contains(activeElement)) return null;
      let outgoingCommit = null;
      try {
        outgoingCommit = this.host.commitCurrentEditor?.() ?? null;
      } catch {
      }
      activeElement.blur();
      if (!outgoingCommit) return this.pendingOutgoingCommit;
      const previousCommit = this.pendingOutgoingCommit;
      const combinedCommit = previousCommit ? Promise.all([previousCommit, outgoingCommit]).then(() => void 0) : outgoingCommit;
      const trackedCommit = combinedCommit.catch(() => void 0);
      this.pendingOutgoingCommit = trackedCommit;
      void trackedCommit.then(() => {
        if (this.pendingOutgoingCommit === trackedCommit) {
          this.pendingOutgoingCommit = null;
        }
      });
      return trackedCommit;
    }
    scheduleEditorRestore(container, outgoingCommit = null) {
      if (this.pendingEditorFrame !== null) {
        window.cancelAnimationFrame(this.pendingEditorFrame);
        this.pendingEditorFrame = null;
      }
      const restoreGeneration = ++this.editorRestoreGeneration;
      const queueRestore = () => {
        if (restoreGeneration !== this.editorRestoreGeneration) return;
        this.pendingEditorFrame = window.requestAnimationFrame(() => {
          this.pendingEditorFrame = null;
          if (restoreGeneration !== this.editorRestoreGeneration || !this.enabled || !container.isConnected) {
            return;
          }
          this.restoreEditor(container);
        });
      };
      if (outgoingCommit) {
        void outgoingCommit.catch(() => void 0).then(queueRestore);
      } else {
        queueRestore();
      }
    }
    restoreEditor(container) {
      const bookmark = this.editorBookmarks.get(container);
      const block = this.resolveBookmarkedBlock(container, bookmark) ?? this.getFirstEditableBlock(container);
      const editor = this.findEditor(block ?? container);
      if (editor) {
        this.focusEditor(editor, bookmark);
        return;
      }
      if (!block) return;
      this.activateBlock(block);
      this.focusEditorAfterMount(container, block, bookmark, 4);
    }
    focusEditorAfterMount(container, block, bookmark, attemptsRemaining) {
      if (attemptsRemaining === 0) return;
      this.pendingEditorFrame = window.requestAnimationFrame(() => {
        this.pendingEditorFrame = null;
        if (!this.enabled || !container.isConnected) return;
        const currentBlock = this.resolveBookmarkedBlock(container, bookmark) ?? block;
        const editor = this.findEditor(currentBlock);
        if (editor) {
          this.focusEditor(editor, bookmark);
        } else {
          this.focusEditorAfterMount(container, currentBlock, bookmark, attemptsRemaining - 1);
        }
      });
    }
    focusEditor(editor, bookmark) {
      editor.focus({ preventScroll: true });
      if (editor instanceof this.getWindow().HTMLTextAreaElement || editor instanceof this.getWindow().HTMLInputElement) {
        const fallbackPosition = editor.value.length;
        const selectionStart = Math.min(bookmark?.selectionStart ?? fallbackPosition, fallbackPosition);
        const selectionEnd = Math.min(bookmark?.selectionEnd ?? selectionStart, fallbackPosition);
        editor.setSelectionRange(selectionStart, selectionEnd);
        return;
      }
      if (editor.isContentEditable) {
        const selection = this.getWindow().getSelection();
        const range = this.getDocument().createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    activateBlock(block) {
      const target = BLOCK_ACTIVATOR_SELECTORS.map(
        (selector) => block.querySelector(selector)
      ).find((candidate) => candidate !== null) ?? block;
      const HostMouseEvent = this.getWindow().MouseEvent;
      const HostPointerEvent = this.getWindow().PointerEvent;
      const targetRect = target.getBoundingClientRect();
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: targetRect.left + Math.min(20, targetRect.width / 2),
        clientY: targetRect.top + targetRect.height / 2
      };
      if (typeof HostPointerEvent === "function") {
        target.dispatchEvent(
          new HostPointerEvent("pointerdown", {
            ...eventOptions,
            buttons: 1,
            isPrimary: true,
            pointerId: 1,
            pointerType: "mouse"
          })
        );
        target.dispatchEvent(
          new HostPointerEvent("pointerup", {
            ...eventOptions,
            buttons: 0,
            isPrimary: true,
            pointerId: 1,
            pointerType: "mouse"
          })
        );
      } else {
        target.dispatchEvent(new HostMouseEvent("pointerdown", eventOptions));
        target.dispatchEvent(new HostMouseEvent("pointerup", eventOptions));
      }
      target.dispatchEvent(new HostMouseEvent("mousedown", eventOptions));
      target.dispatchEvent(new HostMouseEvent("mouseup", eventOptions));
      target.click();
    }
    resolveBookmarkedBlock(container, bookmark) {
      if (!bookmark) return null;
      if (bookmark.block.isConnected && container.contains(bookmark.block)) {
        return bookmark.block;
      }
      if (!bookmark.blockId) return null;
      return Array.from(container.querySelectorAll(BLOCK_SELECTOR)).find(
        (block) => this.getBlockId(block) === bookmark.blockId
      ) ?? null;
    }
    getFirstEditableBlock(container) {
      return container.querySelector(BLOCK_SELECTOR);
    }
    findEditor(container) {
      if (container.matches(EDITOR_SELECTOR)) return container;
      return container.querySelector(EDITOR_SELECTOR);
    }
    getEditorContainer(element) {
      const pane = element.closest(".sidebar-item");
      if (pane && this.sidebarList?.contains(pane)) return pane;
      const mainContainer = this.getMainContainer();
      if (mainContainer?.contains(element)) return mainContainer;
      return null;
    }
    getBlockId(block) {
      return block.getAttribute("blockid") ?? block.getAttribute("data-uuid") ?? block.getAttribute("data-blockid");
    }
    getPanes() {
      if (!this.sidebarList) return [];
      const currentPanes = new Set(this.getNativePanes());
      this.paneOrder = this.paneOrder.filter((pane) => currentPanes.has(pane));
      return [...this.paneOrder];
    }
    getNativePanes() {
      if (!this.sidebarList) return [];
      return Array.from(this.sidebarList.querySelectorAll(PANE_SELECTOR));
    }
    applyPaneOrder() {
      this.paneOrder.forEach((pane, index) => {
        pane.style.order = String(index);
        pane.classList.toggle(LAST_PANE_CLASS, index === this.paneOrder.length - 1);
      });
    }
    getAppContainer() {
      return this.getDocument().querySelector(APP_CONTAINER_SELECTOR);
    }
    getMainContainer() {
      return this.getDocument().querySelector(MAIN_CONTAINER_SELECTOR);
    }
    getDocument() {
      return parent.document;
    }
    getWindow() {
      return parent;
    }
  };

  // src/styles.ts
  var HORIZONTAL_PANES_STYLES = String.raw`
@media (min-width: 721px) {
  body.horizontal-panes-active {
    --horizontal-panes-main-width: 680px;
    --horizontal-panes-pane-width: 680px;
    --horizontal-panes-last-pane-max-width: 850px;
    --horizontal-panes-gap: 18px;
    --horizontal-panes-main-gap: 18px;
    --horizontal-panes-header-height: 48px;
    overflow: hidden !important;
  }

  body.horizontal-panes-active #app-container {
    align-items: stretch;
    height: 100vh;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain;
    scroll-behavior: smooth;
    scrollbar-color: color-mix(in srgb, var(--ls-primary-text-color) 35%, transparent) transparent;
    scrollbar-width: thin;
    background: var(--ls-secondary-background-color);
  }

  body.horizontal-panes-active.horizontal-panes-snap #app-container {
    scroll-snap-type: x proximity;
  }

  body.horizontal-panes-active.horizontal-panes-pane-resizing #app-container {
    scroll-behavior: auto;
    scroll-snap-type: none !important;
  }

  body.horizontal-panes-pane-resize-target,
  body.horizontal-panes-pane-resize-target * {
    cursor: col-resize !important;
  }

  body.horizontal-panes-pane-resizing,
  body.horizontal-panes-pane-resizing * {
    cursor: col-resize !important;
    user-select: none !important;
  }

  body.horizontal-panes-active #app-container::-webkit-scrollbar {
    height: 10px;
  }

  body.horizontal-panes-active #app-container::-webkit-scrollbar-track {
    background: transparent;
  }

  body.horizontal-panes-active #app-container::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--ls-primary-text-color) 35%, transparent);
    border: 3px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
  }

  body.horizontal-panes-active #left-container {
    box-sizing: border-box !important;
    flex: 0 0 var(--horizontal-panes-main-width) !important;
    width: var(--horizontal-panes-main-width) !important;
    min-width: var(--horizontal-panes-main-width) !important;
    max-width: var(--horizontal-panes-main-width) !important;
    height: 100vh;
    padding-top: var(--horizontal-panes-header-height) !important;
    scroll-snap-align: start;
    background: var(--ls-primary-background-color);
  }

  body.horizontal-panes-active #left-container > .cp__header {
    box-sizing: border-box;
    position: fixed !important;
    inset: 0 0 auto 0 !important;
    z-index: 50;
    width: 100vw !important;
    min-width: 100vw !important;
    max-width: none !important;
  }

  body.horizontal-panes-active #right-sidebar.open {
    display: block !important;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: max(
      0px,
      calc(100vw - var(--horizontal-panes-main-width))
    ) !important;
    max-width: none !important;
    height: 100vh !important;
    overflow: visible !important;
    border: 0 !important;
    background: transparent !important;
  }

  body.horizontal-panes-active #right-sidebar > .resizer {
    display: none !important;
  }

  body.horizontal-panes-active #right-sidebar-container,
  body.horizontal-panes-active .cp__right-sidebar-scrollable {
    display: block !important;
    width: max-content !important;
    min-width: max(
      0px,
      calc(100vw - var(--horizontal-panes-main-width))
    ) !important;
    max-width: none !important;
    height: 100vh !important;
    overflow: visible !important;
    background: transparent !important;
  }

  body.horizontal-panes-active .cp__right-sidebar-topbar {
    display: none !important;
  }

  body.horizontal-panes-active .sidebar-item-list {
    box-sizing: border-box;
    display: flex !important;
    flex: none !important;
    flex-flow: row nowrap !important;
    align-items: flex-start !important;
    align-content: flex-start !important;
    gap: var(--horizontal-panes-gap) !important;
    width: max-content !important;
    min-width: max(
      0px,
      calc(100vw - var(--horizontal-panes-main-width))
    ) !important;
    height: 100vh !important;
    margin: 0 !important;
    padding:
      calc(var(--horizontal-panes-header-height) + 18px)
      48px
      28px
      var(--horizontal-panes-main-gap) !important;
    overflow: visible !important;
    background: var(--ls-secondary-background-color) !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-drop-indicator,
  body.horizontal-panes-active .sidebar-item-list .sidebar-item-drop-area {
    display: none !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item {
    box-sizing: border-box;
    position: relative;
    display: flex !important;
    flex: 0 0 var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    align-self: flex-start !important;
    width: var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    min-width: var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    max-width: var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    height: calc(100vh - var(--horizontal-panes-header-height) - 46px) !important;
    min-height: 0 !important;
    max-height: calc(100vh - var(--horizontal-panes-header-height) - 46px) !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scroll-snap-align: start;
    user-select: text;
    border: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 12%, transparent);
    border-radius: 10px;
    background: var(--ls-primary-background-color);
    box-shadow: 0 8px 26px color-mix(in srgb, #000 14%, transparent);
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  body.horizontal-panes-active
    .sidebar-item-list
    > .sidebar-item.horizontal-panes-last-pane:not(.collapsed):not(.horizontal-panes-manual-width) {
    flex: 1 1 var(--horizontal-panes-pane-width) !important;
    max-width: var(--horizontal-panes-last-pane-max-width) !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item.horizontal-panes-resize-target {
    border-right-color: var(--ls-link-text-color, var(--ls-active-primary-color));
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item.horizontal-panes-active-pane {
    border-color: var(--ls-link-text-color, var(--ls-active-primary-color));
    box-shadow:
      0 0 0 1px var(--ls-link-text-color, var(--ls-active-primary-color)),
      0 8px 26px color-mix(in srgb, #000 16%, transparent);
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item > div {
    min-width: 0;
  }

  body.horizontal-panes-active .sidebar-item .sidebar-item-header {
    position: sticky !important;
    top: 0;
    z-index: 20;
    min-height: 42px;
    background: color-mix(
      in srgb,
      var(--ls-secondary-background-color) 92%,
      transparent
    ) !important;
    border-bottom: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 10%, transparent);
    backdrop-filter: blur(12px);
  }

  body.horizontal-panes-active .sidebar-item .sidebar-panel-content {
    padding-bottom: 72px;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item.collapsed {
    flex-basis: 48px !important;
    width: 48px !important;
    min-width: 48px !important;
    max-width: 48px !important;
    overflow: hidden !important;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .sidebar-item-header {
    box-sizing: border-box;
    display: flex !important;
    width: 48px;
    height: 100%;
    min-height: 100%;
    align-items: flex-start;
    border: 0;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .sidebar-item-header > button:first-child {
    width: 48px !important;
    height: 100%;
    padding: 10px 7px !important;
    align-items: flex-start !important;
    writing-mode: vertical-rl;
    text-orientation: mixed;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .sidebar-item-header .item-actions {
    display: none !important;
  }
}
`;

  // src/index.ts
  var DEFAULT_SETTINGS = {
    enabled: true,
    mainWidthPx: 680,
    paneWidthPx: 680,
    paneGapPx: 18,
    mainPaneGapPx: 18,
    scrollSnap: false
  };
  var settingsSchema = [
    {
      key: "enabled",
      title: "Enable horizontal panes",
      description: "Lay out the main page and right-sidebar pages in one horizontal strip.",
      type: "boolean",
      default: DEFAULT_SETTINGS.enabled
    },
    {
      key: "mainWidthPx",
      title: "Main page width",
      description: "Width in pixels of Logseq\u2019s main page.",
      type: "number",
      default: DEFAULT_SETTINGS.mainWidthPx
    },
    {
      key: "paneWidthPx",
      title: "Pane width",
      description: "Width in pixels of pages and blocks opened as panes.",
      type: "number",
      default: DEFAULT_SETTINGS.paneWidthPx
    },
    {
      key: "mainPaneGapPx",
      title: "Main page to first pane gap",
      description: "Horizontal space in pixels between the main page and the first pane.",
      type: "number",
      default: DEFAULT_SETTINGS.mainPaneGapPx
    },
    {
      key: "paneGapPx",
      title: "Gap between panes",
      description: "Horizontal space in pixels between panes.",
      type: "number",
      default: DEFAULT_SETTINGS.paneGapPx
    },
    {
      key: "scrollSnap",
      title: "Scroll snapping",
      description: "Gently align a pane with the left edge after horizontal scrolling.",
      type: "boolean",
      default: DEFAULT_SETTINGS.scrollSnap
    }
  ];
  function numericSetting(value, fallback, minimum, maximum) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
  }
  function readSettings() {
    const settings = logseq.settings ?? {};
    const paneWidthPx = numericSetting(
      settings.paneWidthPx,
      DEFAULT_SETTINGS.paneWidthPx,
      360,
      1600
    );
    const paneGapPx = numericSetting(settings.paneGapPx, DEFAULT_SETTINGS.paneGapPx, 0, 96);
    return {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_SETTINGS.enabled,
      mainWidthPx: numericSetting(settings.mainWidthPx, paneWidthPx, 360, 1600),
      paneWidthPx,
      paneGapPx,
      mainPaneGapPx: numericSetting(settings.mainPaneGapPx, paneGapPx, 0, 240),
      scrollSnap: typeof settings.scrollSnap === "boolean" ? settings.scrollSnap : DEFAULT_SETTINGS.scrollSnap
    };
  }
  function controllerOptions(settings) {
    return {
      mainWidthPx: settings.mainWidthPx,
      paneWidthPx: settings.paneWidthPx,
      paneGapPx: settings.paneGapPx,
      mainPaneGapPx: settings.mainPaneGapPx,
      scrollSnap: settings.scrollSnap
    };
  }
  async function openCurrentPageInPane() {
    const page = await logseq.Editor.getCurrentPage();
    const pageIdentity = page?.uuid ?? page?.id;
    if (pageIdentity === void 0 || pageIdentity === null) {
      await logseq.UI.showMsg("Horizontal Panes: no current page to open", "warning");
      return;
    }
    await logseq.App.setRightSidebarVisible(true);
    logseq.Editor.openInRightSidebar(pageIdentity);
  }
  async function main() {
    logseq.useSettingsSchema(settingsSchema);
    logseq.provideStyle(HORIZONTAL_PANES_STYLES);
    const initialSettings = readSettings();
    const controller = new HorizontalPanesController(controllerOptions(initialSettings), {
      async commitCurrentEditor() {
        await logseq.Editor.exitEditingMode(false);
      }
    });
    controller.setEnabled(initialSettings.enabled);
    const applySettings = () => {
      const settings = readSettings();
      controller.setOptions(controllerOptions(settings));
      controller.setEnabled(settings.enabled);
    };
    const toggleMode = async () => {
      const enabled = !controller.isEnabled();
      controller.setEnabled(enabled);
      await logseq.updateSettings({ enabled });
    };
    logseq.onSettingsChanged(applySettings);
    logseq.App.onRouteChanged(() => {
      if (controller.isEnabled()) {
        controller.focusMain();
      }
    });
    logseq.provideModel({
      async toggleHorizontalPanes() {
        await toggleMode();
      },
      focusHorizontalPanesMain() {
        controller.focusMain();
      },
      focusHorizontalPanesNext() {
        controller.focusAdjacentPane(1);
      },
      focusHorizontalPanesPrevious() {
        controller.focusAdjacentPane(-1);
      },
      moveHorizontalPaneLeft() {
        controller.moveActivePane(-1);
      },
      moveHorizontalPaneRight() {
        controller.moveActivePane(1);
      },
      async openCurrentPageInHorizontalPane() {
        await openCurrentPageInPane();
      }
    });
    logseq.App.registerUIItem("toolbar", {
      key: "horizontal-panes-toggle",
      template: `
      <a
        class="button"
        data-on-click="toggleHorizontalPanes"
        title="Toggle horizontal panes"
        aria-label="Toggle horizontal panes"
      >
        <i class="ti ti-layout-columns"></i>
      </a>
    `
    });
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.toggle",
        label: "Horizontal Panes: Toggle mode"
      },
      toggleMode
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.open-current",
        label: "Horizontal Panes: Open current page as pane"
      },
      openCurrentPageInPane
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.focus-main",
        label: "Horizontal Panes: Focus main page"
      },
      () => controller.focusMain()
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.focus-next",
        label: "Horizontal Panes: Focus pane right"
      },
      () => controller.focusAdjacentPane(1)
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.focus-previous",
        label: "Horizontal Panes: Focus pane left"
      },
      () => controller.focusAdjacentPane(-1)
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.move-left",
        label: "Horizontal Panes: Move focused pane left"
      },
      () => controller.moveActivePane(-1)
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.move-right",
        label: "Horizontal Panes: Move focused pane right"
      },
      () => controller.moveActivePane(1)
    );
    logseq.beforeunload(async () => {
      controller.destroy();
    });
  }
  logseq.ready(main).catch((error) => {
    console.error("Horizontal Panes failed to start", error);
  });
})();
