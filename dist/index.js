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
  var HISTORY_CONTROLS_CLASS = "horizontal-panes-history-controls";
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
    paneHistories = /* @__PURE__ */ new WeakMap();
    pendingReferencePointer = null;
    pendingBlockPointer = null;
    suppressedReferenceClick = null;
    suppressedReferenceClickTimer = null;
    suppressedBlockClick = null;
    suppressedBlockClickTimer = null;
    pendingPaneInsertion = null;
    referenceOpenQueue = Promise.resolve();
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
      this.getDocument().addEventListener("click", this.handleClick, true);
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
      document.removeEventListener("click", this.handleClick, true);
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
      this.pendingReferencePointer = null;
      this.pendingBlockPointer = null;
      this.clearSuppressedReferenceClick();
      this.clearSuppressedBlockClick();
      this.finishPendingPaneInsertion();
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
      if (nextList === this.sidebarList && nextList?.isConnected) {
        this.getPanes().forEach((pane) => this.attachPaneScrollListener(pane));
        return;
      }
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
        pane.querySelector(`.${HISTORY_CONTROLS_CLASS}`)?.remove();
      });
      this.paneScrollListeners.clear();
      this.paneOrder = [];
      this.sidebarList = null;
    }
    handleSidebarMutations = (mutations) => {
      const addedPanes = /* @__PURE__ */ new Set();
      const removedPanes = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof this.getWindow().Element)) continue;
          const element = node;
          if (element.matches(".sidebar-item")) {
            addedPanes.add(element);
          }
          element.querySelectorAll(".sidebar-item").forEach((pane) => addedPanes.add(pane));
        }
        for (const node of mutation.removedNodes) {
          if (!(node instanceof this.getWindow().Element)) continue;
          const element = node;
          if (element.matches(".sidebar-item")) {
            removedPanes.add(element);
          }
          element.querySelectorAll(".sidebar-item").forEach((pane) => removedPanes.add(pane));
        }
      }
      const nativePanes = this.getNativePanes();
      const currentPanes = new Set(nativePanes);
      const pendingInsertion = this.pendingPaneInsertion;
      const insertedPanes = new Set(
        [...addedPanes].filter(
          (pane) => !removedPanes.has(pane) && !pendingInsertion?.existingPanes.has(pane)
        )
      );
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
        (pane) => currentPanes.has(pane) && !insertedPanes.has(pane)
      );
      const appendedOrder = nativePanes.filter((pane) => insertedPanes.has(pane) || !retainedOrder.includes(pane)).reverse();
      const newestPane = nativePanes.find((pane) => insertedPanes.has(pane));
      const sourceIndex = pendingInsertion ? retainedOrder.indexOf(pendingInsertion.sourcePane) : -1;
      const replacementSourceRemoved = Boolean(
        pendingInsertion?.action === "replace" && pendingInsertion.replacementPane && !currentPanes.has(pendingInsertion.sourcePane)
      );
      if (newestPane && sourceIndex >= 0 && pendingInsertion) {
        const insertionIndex = pendingInsertion.action === "replace" ? sourceIndex : sourceIndex + 1;
        this.paneOrder = [
          ...retainedOrder.slice(0, insertionIndex),
          newestPane,
          ...retainedOrder.slice(insertionIndex),
          ...appendedOrder.filter((pane) => pane !== newestPane)
        ];
      } else {
        this.paneOrder = [...retainedOrder, ...appendedOrder];
      }
      if (newestPane && pendingInsertion?.action === "replace" && pendingInsertion.replacementHistory) {
        this.paneHistories.set(newestPane, pendingInsertion.replacementHistory);
        this.restorePaneHistoryEntry(newestPane, pendingInsertion.replacementHistory);
      }
      if (newestPane && pendingInsertion?.action === "replace") {
        this.transferPaneWidth(pendingInsertion.sourcePane, newestPane);
      }
      this.applyPaneOrder();
      this.paneOrder.forEach((pane) => this.attachPaneScrollListener(pane));
      if (newestPane) {
        if (pendingInsertion?.action === "replace") {
          if (sourceIndex >= 0) {
            pendingInsertion.replacementPane = newestPane;
            if (!this.closeNativePane(pendingInsertion.sourcePane)) {
              console.warn("Horizontal Panes could not find the native pane close control");
            }
          } else {
            this.finishPendingPaneInsertion(pendingInsertion);
          }
        } else if (pendingInsertion) {
          this.finishPendingPaneInsertion(pendingInsertion);
        }
        this.scheduleFocus(newestPane);
      }
      if (replacementSourceRemoved && pendingInsertion) {
        this.finishPendingPaneInsertion(pendingInsertion);
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
      const history = this.paneHistories.get(pane);
      const historyEntry = history?.entries[history.index];
      if (historyEntry?.scrollTop !== void 0) {
        pane.scrollTop = historyEntry.scrollTop;
      }
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
      if (!this.paneScrollListeners.has(pane)) {
        pane.addEventListener("scroll", this.handlePaneScroll, { passive: true });
        this.paneScrollListeners.add(pane);
      }
      this.ensurePaneHistoryControls(pane);
    }
    handlePaneScroll = (event) => {
      const pane = event.currentTarget;
      if (pane instanceof this.getWindow().HTMLElement) {
        const history = this.paneHistories.get(pane);
        const entry = history?.entries[history.index];
        if (entry) entry.scrollTop = pane.scrollTop;
      }
      this.sidebarList?.dispatchEvent(new Event("scroll"));
    };
    ensurePaneHistoryControls(pane) {
      const header = pane.querySelector(".sidebar-item-header");
      if (!header) return;
      const history = this.ensurePaneHistory(pane);
      if (header.querySelector(`.${HISTORY_CONTROLS_CLASS}`)) {
        this.updatePaneHistoryControls(pane, history);
        return;
      }
      const controls = this.getDocument().createElement("span");
      controls.className = HISTORY_CONTROLS_CLASS;
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", "Pane history");
      controls.append(
        this.createPaneHistoryButton("back", "Back in pane"),
        this.createPaneHistoryButton("forward", "Forward in pane")
      );
      const nativeActions = header.querySelector(":scope > .item-actions");
      header.insertBefore(controls, nativeActions);
      this.updatePaneHistoryControls(pane, history);
    }
    createPaneHistoryButton(direction, label) {
      const button = this.getDocument().createElement("button");
      button.type = "button";
      button.disabled = true;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("data-horizontal-panes-history", direction);
      button.innerHTML = direction === "back" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/><path d="M9 12h10"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M5 12h10"/></svg>';
      return button;
    }
    ensurePaneHistory(pane) {
      const existing = this.paneHistories.get(pane);
      if (existing) return existing;
      const initialEntry = this.getPaneHistoryEntry(pane);
      const history = initialEntry ? { entries: [initialEntry], index: 0 } : { entries: [], index: -1 };
      this.paneHistories.set(pane, history);
      return history;
    }
    getPaneHistoryEntry(pane) {
      if (pane.classList.contains("item-type-page")) {
        const header = pane.querySelector(".sidebar-item-header");
        const pageTitle = header?.querySelector("button[aria-controls]")?.textContent?.trim() ?? "";
        return pageTitle ? { target: pageTitle, reference: pageTitle } : null;
      }
      const rootBlock = pane.querySelector(BLOCK_SELECTOR);
      const blockId = rootBlock ? this.getBlockId(rootBlock)?.trim() : null;
      return blockId ? { target: blockId } : null;
    }
    updatePaneHistoryControls(pane, history = this.ensurePaneHistory(pane)) {
      const back = pane.querySelector(
        'button[data-horizontal-panes-history="back"]'
      );
      const forward = pane.querySelector(
        'button[data-horizontal-panes-history="forward"]'
      );
      if (back) back.disabled = history.index <= 0;
      if (forward) {
        forward.disabled = history.index < 0 || history.index >= history.entries.length - 1;
      }
    }
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
      this.pendingReferencePointer = null;
      this.pendingBlockPointer = null;
      if (!this.enabled || event.button !== 0) return;
      const resizePane = this.findPaneResizeTarget(event.clientX, event.clientY);
      if (resizePane) {
        this.beginPaneResize(resizePane, event);
        return;
      }
      const target = event.target;
      if (!(target instanceof this.getWindow().Element)) return;
      const targetElement = target;
      const referenceActivation = this.getPaneReferenceActivation(targetElement);
      const blockActivation = this.getPaneBlockActivation(targetElement);
      const referenceAction = this.isUnmodifiedPrimaryEvent(event) ? "replace" : this.isShiftPrimaryEvent(event) ? "insert" : null;
      if (this.options.openPaneLinks && referenceAction && referenceActivation) {
        this.pendingReferencePointer = {
          ...referenceActivation,
          action: referenceAction,
          pointerId: event.pointerId
        };
        event.stopImmediatePropagation();
      }
      if (this.options.openPaneLinks && referenceAction && blockActivation) {
        this.pendingBlockPointer = {
          ...blockActivation,
          action: referenceAction,
          pointerId: event.pointerId
        };
        event.stopImmediatePropagation();
      }
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
      if (this.paneResize && event.pointerId === this.paneResize.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.finishPaneResize();
        this.setResizeTarget(this.findPaneResizeTarget(event.clientX, event.clientY));
        return;
      }
      const referencePointer = this.pendingReferencePointer;
      this.pendingReferencePointer = null;
      if (referencePointer) {
        if (!this.options.openPaneLinks || referencePointer.pointerId !== event.pointerId || (referencePointer.action === "replace" ? !this.isUnmodifiedPrimaryEvent(event) : !this.isShiftPrimaryEvent(event))) {
          return;
        }
        const activation = this.getPaneReferenceActivation(event.target);
        if (!activation || activation.pane !== referencePointer.pane || activation.reference !== referencePointer.reference) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        this.suppressNextReferenceClick(activation);
        this.referenceOpenQueue = this.referenceOpenQueue.catch(() => void 0).then(
          () => this.navigatePaneReference(
            activation.reference,
            activation.pane,
            referencePointer.action
          )
        );
        return;
      }
      const blockPointer = this.pendingBlockPointer;
      this.pendingBlockPointer = null;
      if (!this.options.openPaneLinks || !blockPointer || blockPointer.pointerId !== event.pointerId || (blockPointer.action === "replace" ? !this.isUnmodifiedPrimaryEvent(event) : !this.isShiftPrimaryEvent(event))) {
        return;
      }
      const blockActivation = this.getPaneBlockActivation(event.target);
      if (!blockActivation || blockActivation.pane !== blockPointer.pane || blockActivation.blockId !== blockPointer.blockId) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressNextBlockClick(blockActivation);
      this.referenceOpenQueue = this.referenceOpenQueue.catch(() => void 0).then(
        () => this.navigatePaneTarget(
          blockActivation.blockId,
          blockActivation.pane,
          blockPointer.action
        )
      );
    };
    handlePointerCancel = (event) => {
      if (this.pendingReferencePointer?.pointerId === event.pointerId) {
        this.pendingReferencePointer = null;
      }
      if (this.pendingBlockPointer?.pointerId === event.pointerId) {
        this.pendingBlockPointer = null;
      }
      if (!this.paneResize || event.pointerId !== this.paneResize.pointerId) return;
      this.finishPaneResize();
      this.setResizeTarget(null);
    };
    handleClick = (event) => {
      if (this.handlePaneHistoryClick(event)) return;
      const suppressed = this.suppressedReferenceClick;
      if (suppressed) {
        const referenceActivation = this.getPaneReferenceActivation(event.target);
        if (referenceActivation && referenceActivation.pane === suppressed.pane && referenceActivation.reference === suppressed.reference) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.clearSuppressedReferenceClick();
          return;
        }
      }
      const suppressedBlock = this.suppressedBlockClick;
      if (!suppressedBlock) return;
      const blockActivation = this.getPaneBlockActivation(event.target);
      if (blockActivation && blockActivation.pane === suppressedBlock.pane && blockActivation.blockId === suppressedBlock.blockId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.clearSuppressedBlockClick();
      }
    };
    handlePaneHistoryClick(event) {
      if (!this.enabled || !(event.target instanceof this.getWindow().Element)) {
        return false;
      }
      const button = event.target.closest(
        "button[data-horizontal-panes-history]"
      );
      if (!button || button.disabled) return false;
      const pane = button.closest(".sidebar-item");
      const direction = button.getAttribute("data-horizontal-panes-history");
      if (!pane || pane.parentElement !== this.sidebarList || direction !== "back" && direction !== "forward") {
        return false;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.referenceOpenQueue = this.referenceOpenQueue.catch(() => void 0).then(() => this.navigatePaneHistory(pane, direction));
      return true;
    }
    getPaneReferenceActivation(target) {
      if (!(target instanceof this.getWindow().Element)) return null;
      const referenceElement = target.closest(
        "a.page-ref, a.tag, a.block-ref, .block-ref[data-ref]"
      );
      if (!referenceElement) return null;
      const pane = referenceElement.closest(".sidebar-item");
      if (!pane || pane.parentElement !== this.sidebarList) return null;
      const wrapper = referenceElement.closest(
        ".page-reference[data-ref], .block-ref[data-ref]"
      );
      const reference = (wrapper && pane.contains(wrapper) ? wrapper.getAttribute("data-ref") : null) ?? referenceElement.getAttribute("data-ref");
      const normalizedReference = reference?.trim();
      if (!normalizedReference) return null;
      return { pane, reference: normalizedReference };
    }
    getPaneBlockActivation(target) {
      if (!(target instanceof this.getWindow().Element)) return null;
      const bullet = target.closest(
        ".bullet-container, .bullet"
      );
      if (!bullet) return null;
      const block = bullet.closest(BLOCK_SELECTOR);
      const pane = (block ?? bullet).closest(".sidebar-item");
      const blockId = (this.getBlockId(bullet) ?? (block ? this.getBlockId(block) : null))?.trim();
      if (!pane || pane.parentElement !== this.sidebarList || !blockId) return null;
      return { pane, blockId };
    }
    isUnmodifiedPrimaryEvent(event) {
      return event.button === 0 && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
    }
    isShiftPrimaryEvent(event) {
      return event.button === 0 && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
    }
    suppressNextReferenceClick(activation) {
      this.clearSuppressedReferenceClick();
      this.suppressedReferenceClick = activation;
      this.suppressedReferenceClickTimer = window.setTimeout(() => {
        this.suppressedReferenceClick = null;
        this.suppressedReferenceClickTimer = null;
      }, 0);
    }
    clearSuppressedReferenceClick() {
      if (this.suppressedReferenceClickTimer !== null) {
        window.clearTimeout(this.suppressedReferenceClickTimer);
        this.suppressedReferenceClickTimer = null;
      }
      this.suppressedReferenceClick = null;
    }
    suppressNextBlockClick(activation) {
      this.clearSuppressedBlockClick();
      this.suppressedBlockClick = activation;
      this.suppressedBlockClickTimer = window.setTimeout(() => {
        this.suppressedBlockClick = null;
        this.suppressedBlockClickTimer = null;
      }, 0);
    }
    clearSuppressedBlockClick() {
      if (this.suppressedBlockClickTimer !== null) {
        window.clearTimeout(this.suppressedBlockClickTimer);
        this.suppressedBlockClickTimer = null;
      }
      this.suppressedBlockClick = null;
    }
    async navigatePaneHistory(sourcePane, direction) {
      const openReference = this.host.openPaneReference;
      if (!this.enabled || !openReference || !sourcePane.isConnected || !this.getPanes().includes(sourcePane)) {
        return;
      }
      const history = this.ensurePaneHistory(sourcePane);
      this.rememberPaneHistoryEntry(sourcePane, history);
      const nextIndex = history.index + (direction === "back" ? -1 : 1);
      const entry = history.entries[nextIndex];
      if (!entry) return;
      let target = entry.target;
      if (entry.reference && this.host.resolvePaneReference) {
        try {
          target = await this.host.resolvePaneReference(entry.reference) ?? entry.target;
        } catch {
          return;
        }
      }
      if (!sourcePane.isConnected || !this.getPanes().includes(sourcePane)) return;
      const existingPane = this.findPaneForTarget(target, entry.reference);
      if (existingPane) {
        this.scheduleFocus(existingPane);
        return;
      }
      const replacementHistory = {
        entries: [...history.entries],
        index: nextIndex
      };
      const { pendingInsertion, insertionComplete } = this.beginPendingPaneInsertion(
        sourcePane,
        "replace",
        false,
        replacementHistory
      );
      try {
        await openReference(target);
      } catch {
        this.finishPendingPaneInsertion(pendingInsertion);
        return;
      }
      if (this.pendingPaneInsertion === pendingInsertion) {
        pendingInsertion.timeout = window.setTimeout(
          () => this.finishPendingPaneInsertion(pendingInsertion),
          1500
        );
      }
      await insertionComplete;
    }
    async navigatePaneReference(reference, sourcePane, action) {
      const resolveReference = this.host.resolvePaneReference;
      const openReference = this.host.openPaneReference;
      if (!this.enabled || !resolveReference || !openReference) return;
      let target;
      try {
        target = await resolveReference(reference);
      } catch {
        return;
      }
      if (target === null) return;
      await this.navigatePaneTarget(target, sourcePane, action, reference);
    }
    async navigatePaneTarget(target, sourcePane, action, reference) {
      const openReference = this.host.openPaneReference;
      if (!this.enabled || !openReference || !sourcePane.isConnected || !this.getPanes().includes(sourcePane)) {
        return;
      }
      const existingPane = this.findPaneForTarget(target, reference);
      if (existingPane) {
        this.scheduleFocus(existingPane);
        return;
      }
      const replacementHistory = action === "replace" ? this.getReplacementHistory(sourcePane, { target, reference }) : null;
      const { pendingInsertion, insertionComplete } = this.beginPendingPaneInsertion(
        sourcePane,
        action,
        false,
        replacementHistory
      );
      try {
        await openReference(target);
      } catch {
        this.finishPendingPaneInsertion(pendingInsertion);
        return;
      }
      if (this.pendingPaneInsertion === pendingInsertion) {
        pendingInsertion.timeout = window.setTimeout(
          () => this.finishPendingPaneInsertion(pendingInsertion),
          1500
        );
      }
      await insertionComplete;
    }
    getReplacementHistory(sourcePane, nextEntry) {
      const history = this.ensurePaneHistory(sourcePane);
      this.rememberPaneHistoryEntry(sourcePane, history);
      const retainedEntries = history.index >= 0 ? history.entries.slice(0, history.index + 1) : [];
      return {
        entries: [...retainedEntries, nextEntry],
        index: retainedEntries.length
      };
    }
    rememberPaneHistoryEntry(pane, history = this.ensurePaneHistory(pane)) {
      this.rememberCurrentEditor();
      const entry = history.entries[history.index];
      if (!entry) return;
      entry.scrollTop = pane.scrollTop;
      const bookmark = this.editorBookmarks.get(pane);
      if (bookmark) {
        entry.editorBookmark = {
          blockId: bookmark.blockId,
          selectionStart: bookmark.selectionStart,
          selectionEnd: bookmark.selectionEnd
        };
      }
    }
    restorePaneHistoryEntry(pane, history) {
      const entry = history.entries[history.index];
      if (!entry) return;
      if (entry.scrollTop !== void 0) {
        pane.scrollTop = entry.scrollTop;
      }
      if (!entry.editorBookmark) {
        this.editorBookmarks.delete(pane);
        return;
      }
      const block = Array.from(pane.querySelectorAll(BLOCK_SELECTOR)).find(
        (candidate) => this.getBlockId(candidate) === entry.editorBookmark?.blockId
      ) ?? null;
      this.editorBookmarks.set(pane, {
        block,
        ...entry.editorBookmark
      });
    }
    transferPaneWidth(sourcePane, targetPane) {
      if (!sourcePane.classList.contains(MANUAL_WIDTH_CLASS)) return;
      const width = sourcePane.style.getPropertyValue(
        "--horizontal-panes-pane-width-override"
      );
      if (!width) return;
      targetPane.style.setProperty("--horizontal-panes-pane-width-override", width);
      targetPane.classList.add(MANUAL_WIDTH_CLASS);
    }
    findPaneForTarget(target, reference) {
      const targetKey = this.normalizeTargetKey(target);
      const referenceKey = reference ? this.normalizeTargetKey(reference) : null;
      return this.getPanes().find((pane) => {
        const rootBlock = pane.querySelector(BLOCK_SELECTOR);
        const rootBlockId = rootBlock ? this.getBlockId(rootBlock) : null;
        if (rootBlockId && (this.normalizeTargetKey(rootBlockId) === targetKey || referenceKey !== null && this.normalizeTargetKey(rootBlockId) === referenceKey)) {
          return true;
        }
        if (!referenceKey || !pane.classList.contains("item-type-page")) {
          return false;
        }
        const header = pane.querySelector(".sidebar-item-header");
        const pageTitle = header?.querySelector("button[aria-controls]")?.textContent ?? header?.textContent ?? "";
        return this.normalizeTargetKey(pageTitle) === referenceKey;
      }) ?? null;
    }
    normalizeTargetKey(target) {
      return String(target).trim().toLocaleLowerCase();
    }
    beginPendingPaneInsertion(sourcePane, action, startTimeout, replacementHistory = null) {
      let resolveInsertion = () => void 0;
      const insertionComplete = new Promise((resolve) => {
        resolveInsertion = resolve;
      });
      const pendingInsertion = {
        action,
        sourcePane,
        existingPanes: new Set(this.getNativePanes()),
        replacementPane: null,
        replacementHistory,
        timeout: null,
        resolve: resolveInsertion
      };
      this.finishPendingPaneInsertion();
      this.pendingPaneInsertion = pendingInsertion;
      if (startTimeout) {
        pendingInsertion.timeout = window.setTimeout(
          () => this.finishPendingPaneInsertion(pendingInsertion),
          1500
        );
      }
      return { pendingInsertion, insertionComplete };
    }
    closeNativePane(pane) {
      const closeIcon = pane.querySelector(
        '.sidebar-item-header .item-actions .icon-tabler-x, .sidebar-item-header .item-actions .ti-x, .sidebar-item-header .item-actions [data-icon="x"]'
      );
      const closeControl = closeIcon?.closest("button, a") ?? pane.querySelector(".sidebar-item-header .close") ?? Array.from(
        pane.querySelectorAll(".sidebar-item-header .item-actions button")
      ).at(-1) ?? null;
      if (!closeControl) return false;
      closeControl.click();
      return true;
    }
    finishPendingPaneInsertion(pendingInsertion = this.pendingPaneInsertion) {
      if (!pendingInsertion || this.pendingPaneInsertion !== pendingInsertion) return;
      if (pendingInsertion.timeout !== null) {
        window.clearTimeout(pendingInsertion.timeout);
      }
      this.pendingPaneInsertion = null;
      pendingInsertion.resolve();
    }
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
      this.pendingReferencePointer = null;
      this.pendingBlockPointer = null;
      this.clearSuppressedReferenceClick();
      this.clearSuppressedBlockClick();
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
      if (bookmark.block?.isConnected && container.contains(bookmark.block)) {
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

  body.horizontal-panes-active .horizontal-panes-history-controls {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin: 0;
    padding: 6px;
    color: var(--ls-secondary-text-color);
    border: 0;
    border-radius: 5px;
    background: transparent;
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button:hover:not(:disabled) {
    color: var(--ls-primary-text-color);
    background: color-mix(in srgb, var(--ls-primary-text-color) 8%, transparent);
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button > svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
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

  body.horizontal-panes-active .sidebar-item.collapsed .horizontal-panes-history-controls {
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
    scrollSnap: false,
    openPaneLinks: false
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
    },
    {
      key: "openPaneLinks",
      title: "Navigate links within panes",
      description: "Plain-click replaces the source pane; Shift-click inserts a reference or block immediately to its right.",
      type: "boolean",
      default: DEFAULT_SETTINGS.openPaneLinks
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
      scrollSnap: typeof settings.scrollSnap === "boolean" ? settings.scrollSnap : DEFAULT_SETTINGS.scrollSnap,
      openPaneLinks: typeof settings.openPaneLinks === "boolean" ? settings.openPaneLinks : DEFAULT_SETTINGS.openPaneLinks
    };
  }
  function controllerOptions(settings) {
    return {
      mainWidthPx: settings.mainWidthPx,
      paneWidthPx: settings.paneWidthPx,
      paneGapPx: settings.paneGapPx,
      mainPaneGapPx: settings.mainPaneGapPx,
      scrollSnap: settings.scrollSnap,
      openPaneLinks: settings.openPaneLinks
    };
  }
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  async function resolvePaneReference(reference) {
    if (UUID_PATTERN.test(reference)) return reference;
    let page = await logseq.Editor.getPage(reference);
    if (!page) {
      page = await logseq.Editor.createPage(reference, {}, { redirect: false });
    }
    return page?.uuid ?? page?.id ?? null;
  }
  async function openPaneReference(target) {
    await logseq.App.setRightSidebarVisible(true);
    logseq.Editor.openInRightSidebar(target);
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
      },
      resolvePaneReference,
      openPaneReference
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
