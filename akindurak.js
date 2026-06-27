let sliderInstance = null;

function initProjectSlider() {

  if (typeof gsap === "undefined") {
    console.error("GSAP wurde nicht gefunden.");
    return null;
  }

  const list = document.querySelector(".cms-projects-list");
  const cmsItems = [...document.querySelectorAll(".widget-cms-item, .cms-project-item")];
  const controller = document.querySelector(".controller");
  const controllerInner = document.querySelector(".controller-inner");
  const prevBtn = document.querySelector(".controller-prev");
  const nextBtn = document.querySelector(".controller-next");
  const projectCard = document.querySelector(".project-card");

  if (!list || !cmsItems.length || !controller || !controllerInner || !prevBtn || !nextBtn || !projectCard) {
    console.error("Projekt-Slider: erforderliche Elemente fehlen.");
    return null;
  }

  if (list.dataset.projectSliderInit === "true") {
    return null;
  }

  list.dataset.projectSliderInit = "true";

  // ── Detail Background ──────────────────────────────────────
  let detailBackground = document.querySelector(".project-detail-bg");

  if (!detailBackground) {
    detailBackground = document.createElement("div");
    detailBackground.className = "project-detail-bg";
    detailBackground.setAttribute("aria-hidden", "true");

    const backgroundImage = document.createElement("div");
    backgroundImage.className = "project-detail-bg__image";
    detailBackground.appendChild(backgroundImage);
    document.body.appendChild(detailBackground);
  }

  const detailBackgroundImage = detailBackground.querySelector(".project-detail-bg__image");

  gsap.set(detailBackground, { autoAlpha: 0 });
  gsap.set(detailBackgroundImage, { autoAlpha: 0, scale: 1.5, transformOrigin: "50% 50%" });

  // ── State ──────────────────────────────────────────────────
  const centerBtn = controllerInner;
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const BUFFER_SIZE = Math.max(5, cmsItems.length);

  let currentIndex = 0;
  let slideItems = [];
  let isOpen = false;
  let isMorphing = false;
  let isCardSwitching = false;
  let queuedCardDirection = 0;
  let resizeTimer = null;

  function getLayoutConfig() {
    if (mobileQuery.matches) {
      return {
        isMobile: true,
        slideWidth: window.innerWidth / 2,
        closedOuterWidth: 178, closedOuterHeight: 178,
        closedInnerWidth: 68, closedInnerHeight: 68,
        openOuterWidth: Math.min(253, window.innerWidth - 50),
        openOuterHeight: 78,
        openInnerWidth: Math.min(246, window.innerWidth - 57),
        openInnerHeight: 71,
        closedBottom: "calc(1.75rem + env(safe-area-inset-bottom))",
        openBottom: "calc(0.65rem + env(safe-area-inset-bottom))",
        closedArrowSideOffset: 12,
        openArrowSideOffset: 24
      };
    }
    return {
      isMobile: false,
      slideWidth: 375,
      closedOuterWidth: 200, closedOuterHeight: 200,
      closedInnerWidth: 78, closedInnerHeight: 78,
      openOuterWidth: 244, openOuterHeight: 78,
      openInnerWidth: 235, openInnerHeight: 69,
      closedBottom: 32, openBottom: 32,
      closedArrowSideOffset: 10,
      openArrowSideOffset: 22
    };
  }

  let layout = getLayoutConfig();

  // ── DOM-Hilfsfunktionen ────────────────────────────────────
  function ensureControllerIcon() {
    let icon = controllerInner.querySelector(".controller-state-icon");
    if (!icon) {
      icon = document.createElement("div");
      icon.className = "controller-state-icon";
      icon.textContent = "×";
      controllerInner.appendChild(icon);
    }
    return icon;
  }

  function ensureControllerMenuLabel() {
    let label = controller.querySelector(".controller-menu-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "controller-menu-label";
      label.textContent = "MENU";
      controller.appendChild(label);
    }
    return label;
  }

  function ensureControllerArrows() {
    let layer = controller.querySelector(".controller-arrows");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "controller-arrows";
      controller.appendChild(layer);
    }
    if (prevBtn.parentElement !== layer) layer.appendChild(prevBtn);
    if (nextBtn.parentElement !== layer) layer.appendChild(nextBtn);
    return layer;
  }

  function ensureArrowTrack(button, selector, direction) {
    let track = button.querySelector(".controller-arrow-track");
    if (track) return track;

    const original = button.querySelector(selector);
    if (!original) {
      console.error("Pfeilgrafik nicht gefunden:", selector);
      return null;
    }

    track = document.createElement("div");
    track.className = `controller-arrow-track controller-arrow-track--${direction}`;
    button.insertBefore(track, original);
    track.appendChild(original);

    const clone = original.cloneNode(true);
    clone.classList.add("controller-arrow-clone");
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    if (clone.tagName === "IMG") clone.alt = "";
    track.appendChild(clone);

    return track;
  }

  function createStandbyCard(sourceCard) {
    const clone = sourceCard.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.dataset.cardLayer = "standby";
    clone.setAttribute("aria-hidden", "true");
    sourceCard.insertAdjacentElement("afterend", clone);
    return clone;
  }

  const arrowLayer = ensureControllerArrows();
  const prevArrowTrack = ensureArrowTrack(prevBtn, ".controller-img-left", "prev");
  const nextArrowTrack = ensureArrowTrack(nextBtn, ".controller-img-right", "next");
  const controllerIcon = ensureControllerIcon();
  const controllerMenuLabel = ensureControllerMenuLabel();

  let activeCard = projectCard;
  let standbyCard = createStandbyCard(projectCard);
  gsap.set([activeCard, standbyCard], { autoAlpha: 0 });

  gsap.set([activeCard, standbyCard], {
    position: "fixed", top: "auto", left: "50%", right: "auto", bottom: 0,
    x: 0, y: 0, xPercent: -50, yPercent: 0, margin: 0, zIndex: 100, transformOrigin: "50% 100%"
  });

  activeCard.dataset.cardLayer = "active";
  activeCard.setAttribute("aria-hidden", "false");

  // ── Projekt-Daten ──────────────────────────────────────────
  function getRealIndex(relativeIndex) {
    return ((currentIndex + relativeIndex) % cmsItems.length + cmsItems.length) % cmsItems.length;
  }

  function getText(item, ...selectors) {
    for (const selector of selectors) {
      const value = item.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return "";
  }

  function getProject(index) {
    const item = cmsItems[index];
    if (!item) return { img: "", alt: "", title: "", client: "", tag1: "", tag2: "", url: "" };

    const image =
      item.querySelector("img.widget-cms-image") ||
      item.querySelector(".widget-cms-image img") ||
      item.querySelector(".hidden-hero-i img") ||
      item.querySelector(".project-image") ||
      item.querySelector(".card-hero-image") ||
      item.querySelector("img");

    const link =
      item.querySelector("a.widget-cms-link") ||
      item.querySelector(".widget-cms-link") ||
      item.querySelector("a.hidden-url") ||
      item.querySelector(".hidden-url");

    const title = getText(item, ".hidden-title", ".widget-cms-title");
    const client = getText(item, ".hidden-client", ".widget-cms-type");
    const tag1 = getText(item, ".hidden-tag-1", ".widget-cms-tag-1", ".widget-cms-title");
    const tag2 = getText(item, ".hidden-tag-2", ".widget-cms-tag-2", ".widget-cms-type");
    const url = link?.getAttribute?.("href") || link?.href || link?.textContent?.trim() || "";

    return {
      img: image?.currentSrc || image?.src || "",
      alt: image?.alt || title,
      title, client, tag1, tag2, url
    };
  }

  // ── Detail Background Animationen ─────────────────────────
  function setDetailBackgroundImage(index) {
    const project = getProject(index);
    if (!project.img) {
      detailBackgroundImage.style.backgroundImage = "none";
      return false;
    }
    detailBackgroundImage.style.backgroundImage = `url(${JSON.stringify(project.img)})`;
    return true;
  }

  function revealDetailBackground(index) {
    const hasImage = setDetailBackgroundImage(index);
    if (!hasImage) return gsap.timeline();

    gsap.killTweensOf([detailBackground, detailBackgroundImage]);
    const timeline = gsap.timeline();
    timeline.set(detailBackground, { autoAlpha: 1 });
    timeline.fromTo(detailBackgroundImage,
      { autoAlpha: 0, scale: 1.5 },
      { autoAlpha: 1, scale: 1, duration: layout.isMobile ? 0.9 : 1.15, ease: "expo.out", overwrite: true, force3D: true }
    );
    return timeline;
  }

  function hideDetailBackground() {
    gsap.killTweensOf([detailBackground, detailBackgroundImage]);
    const timeline = gsap.timeline();
    timeline.to(detailBackgroundImage, {
      autoAlpha: 0, scale: 1.08,
      duration: layout.isMobile ? 0.4 : 0.5, ease: "power3.in", overwrite: true, force3D: true
    });
    timeline.set(detailBackground, { autoAlpha: 0 });
    timeline.set(detailBackgroundImage, { scale: 1.5 });
    return timeline;
  }

  function switchDetailBackground(index) {
    const project = getProject(index);
    if (!project.img) return gsap.timeline();

    gsap.killTweensOf(detailBackgroundImage);
    const timeline = gsap.timeline();
    timeline.to(detailBackgroundImage, {
      opacity: 0, scale: 1.06,
      duration: layout.isMobile ? 0.16 : 0.2, ease: "power2.in", overwrite: true
    });
    timeline.add(() => {
      detailBackgroundImage.style.backgroundImage = `url(${JSON.stringify(project.img)})`;
    });
    timeline.fromTo(detailBackgroundImage,
      { opacity: 0, scale: 1.18 },
      { opacity: 1, scale: 1, duration: layout.isMobile ? 0.52 : 0.65, ease: "expo.out", overwrite: true, force3D: true }
    );
    return timeline;
  }

  // ── Karten-Rendering ───────────────────────────────────────
  function preloadProjectImages() {
    cmsItems.forEach((_, index) => {
      const project = getProject(index);
      if (!project.img) return;
      const image = new Image();
      image.decoding = "async";
      image.src = project.img;
    });
  }

  function getCardField(card, field) {
    if (!card) return null;
    const direct = card.querySelector(`[data-card-field="${field}"]`);
    if (direct) return direct;
    const fallback = {
      image: ".card-image-wrap img, img.card-hero-image",
      title: ".card-meta-row > :first-child, .card-title",
      client: ".card-meta-row > :last-child, .card-client",
      "tag-1": ".card-tag-text-1",
      "tag-2": ".card-tag-text-2",
      link: ".card-button"
    };
    const selector = fallback[field];
    return selector ? card.querySelector(selector) : null;
  }

  function setCardText(card, field, value) {
    const element = getCardField(card, field);
    if (!element) return;
    element.textContent = value;
    element.hidden = !value;
  }

  function updateCardLink(card, url) {
    const link = getCardField(card, "link");
    if (!link) return;
    const projectUrl = typeof url === "string" ? url.trim() : "";
    link.dataset.projectUrl = projectUrl;
    if (projectUrl) {
      link.removeAttribute("aria-disabled");
      link.style.pointerEvents = "auto";
      if (link.tagName === "A") link.href = projectUrl;
      return;
    }
    link.setAttribute("aria-disabled", "true");
    link.style.pointerEvents = "none";
    if (link.tagName === "A") link.removeAttribute("href");
  }

  function renderProjectCard(card, index) {
    if (!card) return;
    const project = getProject(index);
    const image = getCardField(card, "image");
    if (image) {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      if (project.img) image.src = project.img;
      image.alt = project.alt;
      image.hidden = !project.img;
    }
    setCardText(card, "title", project.title);
    setCardText(card, "client", project.client);
    setCardText(card, "tag-1", project.tag1);
    setCardText(card, "tag-2", project.tag2);
    updateCardLink(card, project.url);
  }

  function bindCardButton(card) {
    const button = getCardField(card, "link");
    if (!button || button.dataset.cardLinkBound === "true") return;
    button.dataset.cardLinkBound = "true";

    // Projekttitel für Barba-Transition
    function getCardTitle() {
      return getCardField(card, "title")?.textContent?.trim() || "";
    }

    if (button.tagName === "A") {
      // A-Tag: Barba fängt den Klick ab, wir setzen nur den Payload
      button.addEventListener("click", () => {
        window.__transitionPayload = {
          mode: "text",
          value: getCardTitle(),
        };
      });
      return;
    }

    // Kein A-Tag: manuell via barba.go()
    button.setAttribute("role", "link");
    if (!button.hasAttribute("tabindex")) button.setAttribute("tabindex", "0");

    function openProject(event) {
      const projectUrl = button.dataset.projectUrl;
      if (!projectUrl) { event.preventDefault(); return; }
      event.preventDefault();
      window.__transitionPayload = {
        mode: "text",
        value: getCardTitle(),
      };
      barba.go(projectUrl);
    }

    button.addEventListener("click", openProject);
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      openProject(event);
    });
  }

  // ── Slides ─────────────────────────────────────────────────
  function setSlideDetailState(element, relativeIndex) {
    const absoluteIndex = Math.abs(relativeIndex);
    if (relativeIndex === 0) {
      gsap.set(element, { x: 0, y: -40, scale: 0.95, zIndex: 100, opacity: 0, visibility: "visible", filter: "blur(5px)" });
      return;
    }
    gsap.set(element, {
      x: relativeIndex * layout.slideWidth * (absoluteIndex === 1 ? 2.15 : 2.6),
      y: absoluteIndex === 1 ? 20 : 45,
      scale: absoluteIndex === 1 ? 0.42 : 0.28,
      zIndex: 1, opacity: 0, visibility: "visible",
      filter: absoluteIndex === 1 ? "blur(10px)" : "blur(16px)"
    });
  }

  function addSlideItem(relativeIndex, detailHidden = false) {
    const project = getProject(getRealIndex(relativeIndex));
    const item = document.createElement("li");
    const image = document.createElement("img");

    item.className = "project-slide-item";
    item.dataset.relativeIndex = String(relativeIndex);
    image.src = project.img;
    image.alt = project.alt;
    item.appendChild(image);

    if (detailHidden) {
      setSlideDetailState(item, relativeIndex);
    } else {
      gsap.set(item, {
        x: relativeIndex * layout.slideWidth,
        y: 0,
        scale: relativeIndex === 0 ? 1.25 : 0.75,
        zIndex: relativeIndex === 0 ? 100 : 1,
        opacity: Math.abs(relativeIndex) > 2 ? 0 : 1,
        visibility: "visible",
        filter: "blur(0px)"
      });
    }

    list.appendChild(item);
    slideItems.push({ element: item, relativeIndex });
  }

  function removeSlideItem(relativeIndex) {
    const index = slideItems.findIndex((item) => item.relativeIndex === relativeIndex);
    if (index === -1) return;
    gsap.killTweensOf(slideItems[index].element);
    slideItems[index].element.remove();
    slideItems.splice(index, 1);
  }

  function rebuildSlides(detailHidden) {
    slideItems.forEach((item) => { gsap.killTweensOf(item.element); item.element.remove(); });
    slideItems = [];
    for (let index = -BUFFER_SIZE; index <= BUFFER_SIZE; index += 1) {
      addSlideItem(index, detailHidden);
    }
  }

  function updateSliderPosition() {
    slideItems.forEach((item) => {
      const active = item.relativeIndex === 0;
      gsap.killTweensOf(item.element);
      gsap.to(item.element, {
        x: item.relativeIndex * layout.slideWidth,
        y: 0,
        scale: active ? 1.25 : 0.75,
        zIndex: active ? 100 : 1,
        opacity: Math.abs(item.relativeIndex) > 2 ? 0 : 1,
        visibility: "visible",
        filter: "blur(0px)",
        duration: layout.isMobile ? 0.62 : 0.75,
        ease: "power3.out",
        overwrite: true
      });
    });
  }

  function shiftClosedSlider(direction) {
    if (direction > 0) {
      currentIndex = (currentIndex + 1) % cmsItems.length;
      removeSlideItem(-BUFFER_SIZE);
      slideItems.forEach((item) => {
        item.relativeIndex -= 1;
        item.element.dataset.relativeIndex = String(item.relativeIndex);
      });
      addSlideItem(BUFFER_SIZE);
    } else {
      currentIndex = (currentIndex - 1 + cmsItems.length) % cmsItems.length;
      removeSlideItem(BUFFER_SIZE);
      slideItems.forEach((item) => {
        item.relativeIndex += 1;
        item.element.dataset.relativeIndex = String(item.relativeIndex);
      });
      addSlideItem(-BUFFER_SIZE);
    }
    updateSliderPosition();
  }

  // ── Karten-Switch im offenen Zustand ───────────────────────
  function switchOpenProject(direction) {
    if (!isOpen || isMorphing) return;
    if (isCardSwitching) { queuedCardDirection = direction; return; }

    isCardSwitching = true;
    queuedCardDirection = 0;

    const nextIndex = direction > 0
      ? (currentIndex + 1) % cmsItems.length
      : (currentIndex - 1 + cmsItems.length) % cmsItems.length;

    renderProjectCard(standbyCard, nextIndex);

    const travelDistance = Math.max(activeCard.offsetHeight, standbyCard.offsetHeight) + (layout.isMobile ? 24 : 96);
    const outgoingY = direction > 0 ? -travelDistance : travelDistance;
    const incomingY = direction > 0 ? travelDistance : -travelDistance;
    const moveDuration = layout.isMobile ? 0.68 : 0.78;
    const fadeDuration = layout.isMobile ? 0.2 : 0.24;
    const fadeStart = moveDuration - fadeDuration - 0.03;

    activeCard.setAttribute("aria-hidden", "false");
    standbyCard.setAttribute("aria-hidden", "false");

    gsap.killTweensOf([activeCard, standbyCard]);
    gsap.set(activeCard, { x: 0, y: 0, scale: 1, opacity: 1, visibility: "visible", pointerEvents: "none", zIndex: 100, force3D: true });
    gsap.set(standbyCard, { x: 0, y: incomingY, scale: 1, opacity: 1, visibility: "visible", pointerEvents: "none", zIndex: 101, force3D: true });

    const timeline = gsap.timeline({
      onComplete: () => {
        const previousCard = activeCard;
        activeCard = standbyCard;
        standbyCard = previousCard;
        currentIndex = nextIndex;

        activeCard.dataset.cardLayer = "active";
        activeCard.setAttribute("aria-hidden", "false");
        standbyCard.dataset.cardLayer = "standby";
        standbyCard.setAttribute("aria-hidden", "true");

        gsap.set(activeCard, { x: 0, y: 0, scale: 1, opacity: 1, visibility: "visible", pointerEvents: "auto", zIndex: 100 });
        gsap.set(standbyCard, { x: 0, y: 0, scale: 1, opacity: 0, visibility: "hidden", pointerEvents: "none", zIndex: 99 });

        isCardSwitching = false;
        if (queuedCardDirection && isOpen && !isMorphing) {
          const queuedDirection = queuedCardDirection;
          queuedCardDirection = 0;
          switchOpenProject(queuedDirection);
        }
      }
    });

    timeline.add(switchDetailBackground(nextIndex), 0);
    timeline.to(activeCard, { y: outgoingY, duration: moveDuration, ease: "power4.inOut", overwrite: true, force3D: true }, 0);
    timeline.to(standbyCard, { y: 0, duration: moveDuration, ease: "power4.inOut", overwrite: true, force3D: true }, 0);
    timeline.to(activeCard, { opacity: 0, duration: fadeDuration, ease: "power2.out", overwrite: false }, fadeStart);
  }

  // ── Navigation ─────────────────────────────────────────────
  function moveNext(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (isMorphing) return;
    if (isOpen) { switchOpenProject(1); return; }
    shiftClosedSlider(1);
  }

  function movePrev(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (isMorphing) return;
    if (isOpen) { switchOpenProject(-1); return; }
    shiftClosedSlider(-1);
  }

  // ── Controller ─────────────────────────────────────────────
  function setupControllerGeometry() {
    gsap.set(controller, {
      position: "fixed", left: "50%", right: "auto", top: "auto",
      bottom: layout.closedBottom, x: 0, y: 0, xPercent: -50, yPercent: 0,
      width: layout.closedOuterWidth, height: layout.closedOuterHeight,
      margin: 0, padding: 0, borderRadius: "50%", boxSizing: "border-box",
      overflow: "visible", zIndex: 1000, pointerEvents: "auto",
      transformOrigin: "50% 50%", willChange: "width, height, bottom, border-radius"
    });

    gsap.set(controllerInner, {
      position: "absolute", left: "50%", top: "50%", right: "auto", bottom: "auto",
      x: 0, y: 0, xPercent: -50, yPercent: -50,
      width: layout.closedInnerWidth, height: layout.closedInnerHeight,
      margin: 0, padding: 0, borderRadius: "50%", boxSizing: "border-box",
      overflow: "hidden", zIndex: 3, pointerEvents: "auto",
      transformOrigin: "50% 50%", willChange: "width, height, border-radius"
    });

    gsap.set(arrowLayer, {
      position: "absolute", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "space-between",
      paddingLeft: layout.closedArrowSideOffset, paddingRight: layout.closedArrowSideOffset,
      boxSizing: "border-box", opacity: 1, visibility: "visible", zIndex: 30, pointerEvents: "none"
    });

    gsap.set([prevBtn, nextBtn], {
      position: "relative", inset: "auto", x: 0, y: 0, xPercent: 0, yPercent: 0,
      opacity: 1, visibility: "visible", scale: 1, margin: 0, zIndex: 1,
      pointerEvents: "auto", transformOrigin: "50% 50%"
    });

    gsap.set(controllerMenuLabel, {
      opacity: layout.isMobile ? 1 : 0,
      visibility: layout.isMobile ? "visible" : "hidden",
      y: 0
    });

    if (prevArrowTrack) gsap.set(prevArrowTrack, { xPercent: 0, opacity: 1, visibility: "visible" });
    if (nextArrowTrack) gsap.set(nextArrowTrack, { xPercent: 0, opacity: 1, visibility: "visible" });
  }

  function createControllerTimeline() {
    gsap.set(controllerIcon, {
      position: "absolute", left: "50%", top: "50%", x: 0, y: -28,
      xPercent: -50, yPercent: -50, opacity: 0, visibility: "visible",
      scale: 1, rotate: -45, zIndex: 40, pointerEvents: "none", transformOrigin: "50% 50%"
    });

    const timeline = gsap.timeline({ paused: true });

    timeline.to(controller, { width: layout.openOuterWidth, height: layout.openOuterHeight, bottom: layout.openBottom, borderRadius: "9999px", duration: 0.8, ease: "expo.inOut", overwrite: true }, 0);
    timeline.to(arrowLayer, { paddingLeft: layout.openArrowSideOffset, paddingRight: layout.openArrowSideOffset, duration: 0.8, ease: "expo.inOut", overwrite: true }, 0);
    timeline.to(controllerMenuLabel, { opacity: 0, y: -8, duration: 0.3, ease: "power2.out", overwrite: true }, 0);

    if (prevArrowTrack) timeline.to(prevArrowTrack, { xPercent: -200, duration: 0.8, ease: "expo.inOut", overwrite: true }, 0);
    if (nextArrowTrack) timeline.to(nextArrowTrack, { xPercent: 200, duration: 0.8, ease: "expo.inOut", overwrite: true }, 0);

    timeline.to(controllerInner, { width: layout.openInnerWidth, height: layout.openInnerHeight, borderRadius: "9999px", duration: 0.68, ease: "expo.inOut", overwrite: true }, 0.12);
    timeline.to(controllerIcon, { y: 0, opacity: 1, visibility: "visible", scale: 1, rotate: 0, duration: 0.62, ease: "expo.inOut", overwrite: true }, 0.18);

    return timeline;
  }

  // ── Slide-Animationen ──────────────────────────────────────
  function animateSlidesToDetail() {
    const timeline = gsap.timeline();
    slideItems.forEach((item) => {
      const relativeIndex = item.relativeIndex;
      const absoluteIndex = Math.abs(relativeIndex);
      gsap.killTweensOf(item.element);

      if (relativeIndex === 0) {
        timeline.to(item.element, { y: -40, scale: 0.95, opacity: 0, filter: "blur(5px)", duration: 0.65, ease: "power3.inOut", overwrite: true }, 0.15);
        return;
      }
      timeline.to(item.element, {
        x: relativeIndex * layout.slideWidth * (absoluteIndex === 1 ? 2.15 : 2.6),
        y: absoluteIndex === 1 ? 20 : 45,
        scale: absoluteIndex === 1 ? 0.42 : 0.28,
        opacity: 0,
        filter: absoluteIndex === 1 ? "blur(10px)" : "blur(16px)",
        duration: 0.95, ease: "power3.inOut", overwrite: true
      }, absoluteIndex === 1 ? 0 : 0.08);
    });
    return timeline;
  }

  function animateSlidesBack() {
    const timeline = gsap.timeline();
    slideItems.forEach((item) => {
      const active = item.relativeIndex === 0;
      gsap.killTweensOf(item.element);
      timeline.to(item.element, {
        x: item.relativeIndex * layout.slideWidth,
        y: 0,
        scale: active ? 1.25 : 0.75,
        zIndex: active ? 100 : 1,
        opacity: Math.abs(item.relativeIndex) > 2 ? 0 : 1,
        visibility: "visible",
        filter: "blur(0px)",
        duration: 0.85, ease: "power3.out", overwrite: true
      }, 0);
    });
    return timeline;
  }

  function openProjectCard() {
    standbyCard.setAttribute("aria-hidden", "true");
    gsap.set(standbyCard, { y: 0, opacity: 0, visibility: "hidden", pointerEvents: "none", zIndex: 99 });
    return gsap.fromTo(activeCard,
      { y: layout.isMobile ? 48 : 80, opacity: 0, visibility: "visible", pointerEvents: "none", zIndex: 100 },
      { y: 0, opacity: 1, visibility: "visible", pointerEvents: "auto", duration: layout.isMobile ? 0.65 : 0.72, ease: "expo.out", overwrite: true, force3D: true }
    );
  }

  function closeProjectCard() {
    queuedCardDirection = 0;
    isCardSwitching = false;
    gsap.killTweensOf([activeCard, standbyCard]);
    gsap.set(standbyCard, { opacity: 0, visibility: "hidden", pointerEvents: "none" });
    return gsap.to(activeCard, { y: layout.isMobile ? 48 : 80, opacity: 0, pointerEvents: "none", duration: 0.5, ease: "power3.in", overwrite: true });
  }

  // ── Toggle Detail-Mode ─────────────────────────────────────
  function toggleDetailMode(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (isMorphing || isCardSwitching) return;

    isMorphing = true;

    if (!isOpen) {
      renderProjectCard(activeCard, currentIndex);

      const master = gsap.timeline({ onComplete: () => { isOpen = true; isMorphing = false; } });
      master.add(animateSlidesToDetail(), 0);
      master.add(() => {
        controller.classList.add("is-open");
        document.documentElement.classList.add("project-detail-open");
      }, 0.05);
      master.to(controllerTimeline, { time: controllerTimeline.duration(), duration: 0.8, ease: "none", overwrite: true }, 0.05);

      const detailRevealStart = layout.isMobile ? 0.38 : 0.5;
      master.add(revealDetailBackground(currentIndex), detailRevealStart);
      master.add(openProjectCard(), detailRevealStart);
      return;
    }

    rebuildSlides(true);

    const master = gsap.timeline({ onComplete: () => { isOpen = false; isMorphing = false; } });
    master.add(closeProjectCard(), 0);
    master.add(hideDetailBackground(), 0);
    master.add(() => { controller.classList.remove("is-open"); }, 0);
    master.add(() => { document.documentElement.classList.remove("project-detail-open"); }, layout.isMobile ? 0.38 : 0.48);
    master.to(controllerTimeline, { time: 0, duration: 0.8, ease: "none", overwrite: true }, 0);
    master.add(animateSlidesBack(), 0.3);
  }

  // ── Responsive Refresh ─────────────────────────────────────
  function refreshResponsiveLayout() {
    if (isMorphing || isCardSwitching) return;
    const wasOpen = isOpen;
    layout = getLayoutConfig();
    controllerTimeline.kill();
    setupControllerGeometry();
    controllerTimeline = createControllerTimeline();

    if (wasOpen) {
      controllerTimeline.progress(1);
      controller.classList.add("is-open");
      document.documentElement.classList.add("project-detail-open");
    } else {
      controllerTimeline.progress(0);
      controller.classList.remove("is-open");
      document.documentElement.classList.remove("project-detail-open");
    }

    rebuildSlides(wasOpen);
    if (!wasOpen) updateSliderPosition();
  }

  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshResponsiveLayout, 180);
  };

  // ── Initialisierung ────────────────────────────────────────
  cmsItems.forEach((item) => { item.style.display = "none"; });

  setupControllerGeometry();
  controller.classList.remove("is-open");

  // Problem 3: Slider unsichtbar bis JS fertig ist
  gsap.set([list, controller], { autoAlpha: 0 });

  let controllerTimeline = createControllerTimeline();

  preloadProjectImages();
  rebuildSlides(false);
  updateSliderPosition();

  renderProjectCard(activeCard, currentIndex);
  renderProjectCard(standbyCard, (currentIndex + 1) % cmsItems.length);
  bindCardButton(activeCard);
  bindCardButton(standbyCard);

  gsap.set(activeCard, { y: layout.isMobile ? 48 : 80, opacity: 0, visibility: "visible", pointerEvents: "none", zIndex: 100, willChange: "transform, opacity", force3D: true });
  gsap.set(standbyCard, { y: 0, opacity: 0, visibility: "hidden", pointerEvents: "none", zIndex: 99, willChange: "transform, opacity", force3D: true });

  prevBtn.addEventListener("click", movePrev);
  nextBtn.addEventListener("click", moveNext);
  centerBtn.addEventListener("click", toggleDetailMode);
  window.addEventListener("resize", onResize);

  
 gsap.to([list, controller], {
  autoAlpha: 1,
  duration: 0.5,
  ease: "power2.out",
  delay: 0.1
});

  // ── Cleanup für Barba ──────────────────────────────────────
  function destroy() {
    prevBtn.removeEventListener("click", movePrev);
    nextBtn.removeEventListener("click", moveNext);
    centerBtn.removeEventListener("click", toggleDetailMode);
    window.removeEventListener("resize", onResize);

    gsap.killTweensOf([activeCard, standbyCard, detailBackground, detailBackgroundImage, controller, controllerInner, controllerIcon, controllerMenuLabel, arrowLayer, list]);
    if (prevArrowTrack) gsap.killTweensOf(prevArrowTrack);
    if (nextArrowTrack) gsap.killTweensOf(nextArrowTrack);
    slideItems.forEach((item) => gsap.killTweensOf(item.element));
    controllerTimeline.kill();

    slideItems.forEach((item) => item.element.remove());
    slideItems = [];

    if (standbyCard && standbyCard.parentElement) standbyCard.remove();
    if (detailBackground && detailBackground.parentElement) detailBackground.remove();

    controller.classList.remove("is-open");
    document.documentElement.classList.remove("project-detail-open");

    if (list) delete list.dataset.projectSliderInit;

    clearTimeout(resizeTimer);
  }

  return { destroy };
}

function resetSkewUp() {
  document.querySelectorAll(".skew-up").forEach((el) => {
    if (!el.dataset.originalHtml) {
      el.dataset.originalHtml = el.innerHTML;
    }
    el.innerHTML = el.dataset.originalHtml;
  });
}

function initSkewUp() {
  if (typeof gsap === "undefined" || typeof SplitType === "undefined") return;
  resetSkewUp();

  document.querySelectorAll(".skew-up").forEach((el) => {
    const split = new SplitType(el, {
      types: "lines, words",
      lineClass: "word-line",
    });

    const words = el.querySelectorAll(".word");
    if (!words.length) return;

    gsap.set(el, { opacity: 0 });
    gsap.set(words, { y: "100%", skewX: -6, opacity: 0 });

    const delay = el.id === "delay-skew" ? 0.5 : 0;

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          gsap.to(el, { opacity: 1, duration: 0.3 });

          gsap.to(words, {
            y: "0%",
            skewX: 0,
            opacity: 1,
            duration: 1.6,
            stagger: 0.03,
            ease: "expo.out",
            delay,
          });

          obs.disconnect();
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSkewUp();
});

if (window.barba) {
  barba.hooks.after(() => {
    initSkewUp();
  });
}

const LOGO_SRC =
  "https://cdn.prod.website-files.com/65aaadc263ad4e7a6d30a425/68f9fd7f1f1ffa469996db9e_AkinDurak.svg";

let lenis = null;

function ensureOverlay() {
  let overlay = document.querySelector(".transition-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "transition-overlay";
    overlay.innerHTML =
      `<div class="transition-center">
        <div class="transition-layer logo-layer">
          <img class="transition-logo" alt="Logo" />
        </div>
        <div class="transition-layer text-layer">
          <span class="transition-text"></span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  const logoEl = overlay.querySelector(".transition-logo");
  if (logoEl && LOGO_SRC) {
    logoEl.src = LOGO_SRC;
    logoEl.onerror = () => {
      const textLayer = overlay.querySelector(".transition-text");
      textLayer.textContent = "Akin Durak";
      textLayer.style.display = "inline-block";
      logoEl.style.display = "none";
    };
  }

  return overlay;
}

function setupTransitionClicks() {
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest(
        "a, button, .button-primary, .button-secondary, .button-link, .nav-link"
      );
      if (!el) return;

      if (el.classList.contains("nav-link")) {
        window.__transitionPayload = {
          mode: "text",
          value: (el.textContent || "").trim(),
        };
        return;
      }

      if (
        el.matches(
          ".button-primary, .button-secondary, .button-link, button"
        )
      ) {
        window.__transitionPayload = {
          mode: "logo",
          value: "",
        };
        return;
      }

      if (el.tagName && el.tagName.toLowerCase() === "a") {
        window.__transitionPayload = {
          mode: "text",
          value: (el.textContent || "").trim(),
        };
      }
    },
    true
  );
}

window.addEventListener("popstate", () => {
  window.__transitionPayload = {
    mode: "logo",
    value: "",
  };
});

function injectBaseStyles() {
  const styleEl = document.createElement("style");

  styleEl.innerHTML = `/* === Transition Overlay === */
.transition-overlay {
  position: fixed;
  inset: 0;
  background: #fff;
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
  transform: scaleY(0);
  transform-origin: top;
  will-change: transform, opacity;
}

.transition-overlay::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    rgba(255,255,255,0.9) 0%,
    rgba(255,255,255,1) 70%
  );
  opacity: 0.3;
}

.transition-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
}

.transition-layer {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.transition-text {
  font-family: "Urbanist", system-ui, -apple-system, sans-serif;
  font-weight: 500;
  font-size: 35px;
  letter-spacing: .02em;
  color: #000;
  opacity: 0;
  transform: translateY(20px);
  line-height: 1.1;
  text-align: center;
}

.transition-logo {
  width: 150px !important;
  height: auto !important;
  opacity: 0;
  display: block;
  transition: transform 0.8s ease, opacity 0.8s ease;
}

@media (max-width: 767px) {
  .transition-logo { width: 120px !important; }
  .transition-text { font-size: 26px; }
}

html {
  font-size: 16px;
}

@media (min-width: 992px) {
  html { font-size: calc(8px + 8 * ((100vw - 992px) / 928)); }
}

a { -webkit-tap-highlight-color: transparent; }

.no-click { pointer-events: none; }

body {
  font-kerning: normal;
  font-variant-ligatures: common-ligatures;
  text-rendering: optimizeLegibility;
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  font-style: normal;
  font-stretch: normal;
  box-sizing: border-box;
  overscroll-behavior: none;
}

::selection { background: #ffb7b7; }
::-moz-selection { background: #ffb7b7; }

.word-line { overflow: hidden; }
.skew-up { opacity: 1; }

.scroll-overlay {
  position: fixed;
  right: 0rem;
  top: 0;
  height: 100vh;
  width: 60px;
  opacity: 0;
  pointer-events: none !important;
  z-index: 9999;
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.scroll-pill {
  position: absolute;
  right: 0;
  pointer-events: auto !important;
  width: 25px;
  height: 110px;
  background: #000;
  border-radius: 999px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 10px 0;
  color: white;
  overflow: hidden;
  transition:
    width .35s cubic-bezier(.2,.8,.2,1),
    height .35s cubic-bezier(.2,.8,.2,1),
    border-radius .1s cubic-bezier(.2,.8,.2,1);
}

.scroll-pill:hover {
  width: 150px;
  height: 200px; 
  border-radius: 16px;
}

.pill-top,
.pill-content,
.pill-bottom {
  transition: opacity .2s ease, transform .25s ease;
}

.scroll-pill:hover .pill-top,
.scroll-pill:hover .pill-content,
.scroll-pill:hover .pill-bottom {
  opacity: 0;
  transform: translateY(-6px);
}

.pill-default {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.scroll-pill:hover .pill-default {
  display: none;
}

.pill-player {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  text-align: center;
  opacity: 0;
  transform: translateY(10px) scale(.96);
  transition: opacity .25s ease, transform .3s ease;
}

.scroll-pill:hover .pill-player {
  display: flex;
  opacity: 1;
  transform: translateY(0) scale(1);
}

.player-cover {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  object-fit: cover;
  opacity: 0;
  transition: opacity .3s ease;
}

.player-info { text-align: center; }

.player-title {
  font-size: 12px;
  font-weight: 600;
}

.player-artist {
  font-size: 10px;
  opacity: .65;
}

.player-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 14px;
  width: 100%;
  font-size: 14px;
  opacity: .85;
}

.player-controls button {
  background: none;
  border: none;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.pill-top,
.pill-bottom { font-size: 14px; }

.pill-content { opacity: 1; }

.pill-clock {
  position: relative;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
}

.hand {
  position: absolute;
  left: 50%;
  bottom: 50%;
  background: #000;
  transform-origin: bottom center;
  transform: translateX(-50%) rotate(0deg);
}

.hand.hour {
  width: 2px;
  height: 5px;
  border-radius: 2px;
}

.hand.minute {
  width: 2px;
  height: 7px;
  border-radius: 2px;
}

#musicIcon {
  font-size: 14px;
  color: white;
  cursor: pointer;
  transition: color .2s ease;
}

#musicIcon.is-playing { color: #1ed760; }

.clock-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

#clockTime { font-size: 8px; }

#clockAmPm {
  font-size: 7px;
  opacity: 0.8;
}

html, body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  display: none;
}

.brand-word,
.brand-logo {
  display: none !important;
}

body.is-home .brand-word {
  display: inline-flex !important;
}

body.is-home .brand-logo {
  display: none !important;
}

body:not(.is-home) .brand-word {
  display: none !important;
}

body:not(.is-home) .brand-logo {
  display: inline-flex !important;
}`;
  document.head.appendChild(styleEl);
}
function initBurgerMenu() {
  const burger = document.querySelector(".hamburger-wrapper");
  const burgerLines = document.querySelectorAll(".burger-line-2");
  const lineBlock = document.querySelector(".line-block");
  const menu = document.querySelector(".menu-outer-wrapper");
  const menuInner = document.querySelector(".menu__inner__wrap");
  const navLinks = document.querySelectorAll(".nav-link, .Link-4");
  const socialText = document.querySelectorAll(".new-text-socials");
  const numberHovers = document.querySelectorAll(".number-on-hover");
  const navMenu = document.querySelector(".nav-menü");

  if (!burger || !menu || !lineBlock || burgerLines.length === 0) {
    console.warn("Menüelemente fehlen.");
    return;
  }

  if (navMenu) navMenu.style.mixBlendMode = "difference";

  let menuOpen = false;

  if (window.gsap) {
    gsap.set(lineBlock, { scaleY: 0, opacity: 0, transformOrigin: "top" });
    gsap.set(menu, { width: 0, opacity: 0, pointerEvents: "none" });
  } else {
    lineBlock.style.opacity = "0";
    menu.style.opacity = "0";
    menu.style.pointerEvents = "none";
  }

  const openTl = gsap.timeline({ paused: true });

  openTl
    .set(menu, { display: "flex", pointerEvents: "auto" })
    .to(burgerLines, {
      y: 8,
      opacity: 0,
      stagger: 0.05,
      duration: 0.35,
      ease: "power2.inOut",
    })
    .to(
      lineBlock,
      {
        opacity: 1,
        scaleY: 1,
        duration: 0.55,
        ease: "expo.out",
      },
      "-=0.2"
    )
    .to(
      menu,
      {
        width: window.innerWidth <= 768 ? "100vw" : "50vw",
        opacity: 1,
        duration: 0.8,
        ease: "power3.out",
      },
      "-=0.3"
    )
    .from(
      menuInner,
      {
        yPercent: -10,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
      },
      "-=0.4"
    )
    .from(
      [...socialText, ...numberHovers, ...navLinks],
      {
        autoAlpha: 0,
        y: 25,
        stagger: 0.05,
        duration: 0.35,
        ease: "power2.out",
      },
      "-=0.4"
    );

  const closeTl = gsap.timeline({ paused: true });
  window.__closeMenuTl = closeTl;
  window.__closeMenuTl.progress(0).pause(0);

  closeTl
    .to([...navLinks, ...numberHovers, ...socialText], {
      autoAlpha: 0,
      y: 15,
      stagger: 0.03,
      duration: 0.25,
      ease: "power2.in",
    })
    .to(
      menu,
      {
        width: 0,
        opacity: 0,
        duration: 0.5,
        ease: "power3.inOut",
      },
      "-=0.2"
    )
    .to(
      lineBlock,
      {
        scaleY: 0,
        opacity: 0,
        duration: 0.4,
        ease: "expo.in",
        transformOrigin: "bottom",
      },
      "-=0.3"
    )
    .to(
      burgerLines,
      {
        y: 0,
        opacity: 1,
        stagger: 0.05,
        duration: 0.4,
        ease: "power2.out",
      },
      "-=0.2"
    )
    .set(menu, { pointerEvents: "none" });

  function toggleMenu() {
    if (openTl.isActive() || closeTl.isActive()) return;

    if (!menuOpen) {
      openTl.play(0);
      gsap.set(["html", "body"], { overflow: "hidden" });
      document.body.classList.add("menu-open");
    } else {
      closeTl.play(0);
      gsap.set(["html", "body"], { overflow: "auto" });
      document.body.classList.remove("menu-open");
    }

    menuOpen = !menuOpen;
  }

  burger.addEventListener("click", toggleMenu);
  lineBlock.addEventListener("click", toggleMenu);

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (menuOpen) toggleMenu();
    });
  });

  console.log("Burger-Menü initialisiert");
}

function initLenis() {
  if (typeof Lenis === "undefined") return;

  lenis = new Lenis({
    duration: 1.2,
    smoothWheel: true,
    smoothTouch: false,
    autoResize: true,
    touchMultiplier: 1.5,
    easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  });

  if (window.gsap) {
    gsap.ticker.add((t) => lenis.raf(t * 1000));
  }
}

function resetLenisScroll() {
  if (lenis) lenis.scrollTo(0, { immediate: true });
}

function initFreieArbeiten() {
  if (document.querySelector("iframe.freie-iframe")) return;

  const iframe = document.createElement("iframe");
  iframe.src = "https://3d-gallery-x.vercel.app";
  iframe.className = "freie-iframe";
  iframe.loading = "eager";

  if (window.innerWidth <= 768) {
    Object.assign(iframe.style, {
      position: "fixed",
      top: "15%",
      left: "50%",
      transform: "translateX(-50%)",
      width: "100vw",
      height: "100vh",
      border: "none",
      zIndex: "1",
      display: "block",
    });
  } else {
    Object.assign(iframe.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      border: "none",
      margin: "0",
      padding: "0",
      zIndex: "1",
      display: "block",
    });
  }

  document.body.appendChild(iframe);

  const hideSelectors = [
    ".main-wrapper",
    ".main_wrapper",
    ".mainwrapper",
    ".footer-wrapper",
    ".footer_wrapper",
    ".footerwrapper",
    ".padding-global",
    ".page-content",
  ];

  hideSelectors.forEach((sel) =>
    document.querySelectorAll(sel).forEach((el) => {
      el.dataset.prevDisplay = el.style.display;
      el.style.display = "none";
    })
  );

  const showSelectors = [
    ".nav-menü",
    ".nav-menu",
    ".menü-outer-wrapper",
    ".menu-outer-wrapper",
    ".nav",
    ".navbar",
  ];

  showSelectors.forEach((sel) =>
    document.querySelectorAll(sel).forEach((el) => {
      if (!el.dataset.prevPosition) {
        el.dataset.prevPosition = getComputedStyle(el).position;
      }

      el.style.position =
        getComputedStyle(el).position === "fixed"
          ? "fixed"
          : "relative";

      el.style.zIndex = "10";
      el.style.display = "";
    })
  );

  const menuWrapper =
    document.querySelector(".menü-outer-wrapper") ||
    document.querySelector(".menu-outer-wrapper");

  if (menuWrapper) {
    menuWrapper.style.position =
      menuWrapper.style.position || "relative";
    menuWrapper.style.zIndex = "11";
  }

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function cleanupFreieArbeiten() {
  const iframe = document.querySelector("iframe.freie-iframe");
  if (iframe) iframe.remove();

  document.querySelectorAll("[data-prev-display]").forEach((el) => {
    el.style.display = el.dataset.prevDisplay || "";
  });

  document.querySelectorAll("[data-prevPosition]").forEach((el) => {
    el.style.position = el.dataset.prevPosition || "";
  });

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

function injectMenuFixCSS() {
  const styleFix = document.createElement("style");

  styleFix.innerHTML = `
.menu-outer-wrapper {
  position: fixed !important;
  top: 0 !important;
  right: 0 !important;
  height: 100vh !important;
  width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 500 !important;
  background: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: width, opacity;
}

.hamburger-wrapper {
  position: relative;
  z-index: 10000 !important;
  cursor: pointer;
  pointer-events: auto;
}

.nav-menu {
  mix-blend-mode: difference;
  z-index: 10001;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
}
`;

  document.head.appendChild(styleFix);
}

function runPreloaderOncePerTab() {
  const FLAG = "preloader_shown_v1";
  if (sessionStorage.getItem(FLAG)) return;

  sessionStorage.setItem(FLAG, "1");

  const pre = document.createElement("div");
  pre.className = "preloader";
  pre.innerHTML = `<div class="preloader-percent">0%</div>`;
  document.body.appendChild(pre);

  const style = document.createElement("style");
  style.textContent = `
.preloader {
  position: fixed;
  inset: 0;
  background: #fff;
  z-index: 99999;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3rem;
  pointer-events: none;
}

.preloader-percent {
  font-family: "Urbanist", system-ui, -apple-system, sans-serif;
  font-size: 42px;
  font-weight: 500;
  color: #000;
  letter-spacing: 0.02em;
}
`;

  document.head.appendChild(style);

  const percent = pre.querySelector(".preloader-percent");
  const current = { value: 0 };

  const delayElement = document.querySelector("#delay-skew");
  if (delayElement) delayElement.style.opacity = 0;

  gsap.to(current, {
    value: 100,
    duration: 1,
    onUpdate: () =>
      (percent.textContent = `${Math.round(current.value)}%`),
    onComplete: () => {
      gsap.to(pre, {
        opacity: 0,
        duration: 0.6,
        ease: "power2.inOut",
        onComplete: () => pre.remove(),
      });
    },
  });

  if (delayElement) {
    const text = new SplitType(delayElement, {
      types: "lines, words",
      lineClass: "word-line",
    });

    const word = delayElement.querySelectorAll(".word-line .word");

    gsap.fromTo(
      word,
      { y: "100%", skewX: "-6", opacity: 0 },
      {
        y: "0%",
        skewX: "0",
        opacity: 1,
        duration: 2,
        stagger: 0.03,
        ease: "expo.out",
      }
    );
  }

  initSkewUp();
}

document.addEventListener("DOMContentLoaded", runPreloaderOncePerTab);

function applyHamburgerVisibilityFix() {
  const burger = document.querySelector(".hamburger-wrapper");
  const menuOuter =
    document.querySelector(".menu-outer-wrapper") ||
    document.querySelector(".menü-outer-wrapper");

  if (burger) {
    burger.style.zIndex = "10000";
    burger.style.pointerEvents = "auto";
    burger.style.opacity = "1";
    burger.style.display = "block";
  }

  if (menuOuter) {
    menuOuter.style.zIndex = "9999";
    menuOuter.style.pointerEvents = "none";
    menuOuter.style.opacity = "0";
    menuOuter.style.display = "flex";
  }
}

function updateNavbarBrand(namespace) {
  const isHome = namespace === "home";
  document.body.classList.toggle("is-home", isHome);

  console.log("Navbar Brand Switch:", {
    namespace,
    isHome,
    path: window.location.pathname
  });
}
function initBarbaAndTransitions() {
  if (typeof barba === "undefined") return;

  barba.init({
    transitions: [
      {
        name: "luxury-overlay-dynamic",

        async leave(data) {
          if (lenis) lenis.stop?.();
          
          const iframe = document.querySelector("iframe.freie-iframe");
          if (iframe) {
            if (gsap) {
              await gsap.to(iframe, {
                opacity: 0,
                duration: 0.6,
                ease: "power2.inOut",
              });
            }
            iframe.remove();
          }

          const overlay = ensureOverlay();
          const textEl = overlay.querySelector(".transition-text");
          const logoEl = overlay.querySelector(".transition-logo");

          const payload =
            window.__transitionPayload || {
              mode: "logo",
              value: "",
            };

          if (gsap) {
            gsap.set(overlay, {
              opacity: 1,
              scaleY: 0,
              transformOrigin: "top",
            });
            gsap.set([textEl, logoEl], { opacity: 0 });
          }

          if (payload.mode === "logo") {
            logoEl.style.display = "block";
            textEl.style.display = "none";
          } else {
            textEl.textContent = payload.value;
            textEl.style.display = "inline-block";
            logoEl.style.display = "none";
          }

          if (gsap) {
            await gsap.to(overlay, {
              scaleY: 1,
              duration: 1.2,
              ease: "expo.inOut",
            });

            document.documentElement.classList.remove("project-detail-open");
const detailBg = document.querySelector(".project-detail-bg");
if (detailBg) detailBg.remove();

            const el =
              payload.mode === "logo" ? logoEl : textEl;

            await gsap.to(el, {
              opacity: 1,
              duration: 0.8,
              ease: "power2.out",
            });

            await new Promise((r) => setTimeout(r, 400));

            await gsap.to(el, {
              opacity: 0,
              duration: 0.8,
              ease: "power2.inOut",
            });

            await gsap.to(data.current.container, {
              opacity: 0,
              duration: 0.3,
              ease: "power1.out",
            });
          }
        },

        async enter(data) {
          const overlay = document.querySelector(".transition-overlay");

          if (gsap) {
            await gsap.to(overlay, {
              scaleY: 0,
              duration: 1.2,
              ease: "expo.inOut",
              transformOrigin: "bottom",
            });

            gsap.from(data.next.container, {
              opacity: 0,
              duration: 0.6,
              ease: "power2.out",
            });
          }

          updateNavbarBrand(data.next.namespace);

          resetLenisScroll();
          lenis?.start?.();

          window.__transitionPayload = {
            mode: "text",
            value: "",
          };
        },
      },
    ],

    views: [
      {
        namespace: "home",
        afterEnter() {
          updateNavbarBrand("home");
        },
      },
      {
        namespace: "freie-arbeiten",
        afterEnter() {
          initFreieArbeiten();
        },
      },
      {
        namespace: "beruflicher-hintergrund",
        afterEnter() {
          gsap.from(".timeline-item", {
            opacity: 0,
            y: 40,
            stagger: 0.1,
            ease: "power2.out",
          });
        },
      },
     {                        
      namespace: "project",
      afterEnter() {
        updateNavbarBrand("project");
      },
    },
  ],
});

  barba.hooks.beforeLeave((data) => {
    if (document.body.classList.contains("menu-open")) {
      document.body.classList.remove("menu-open");
      gsap.set(["html", "body"], { overflow: "" });
      window.__closeMenuTl?.restart(true);
    }

    if (data.current?.namespace === "freie-arbeiten") {
      const iframe = document.querySelector("iframe.freie-iframe");
      if (iframe) {
        gsap.to(iframe, {
          opacity: 0,
          duration: 0.5,
          ease: "power2.out",
          pointerEvents: "none",
        });
        setTimeout(() => {
          cleanupFreieArbeiten();
        }, 400);
      }
    }
  });

  barba.hooks.after((data) => {
    const oldPage = data?.old?.container;
    if (oldPage && oldPage.remove) oldPage.remove();

    if (lenis && lenis.destroy) lenis.destroy();

    initLenis();
    resetLenisScroll();

     requestAnimationFrame(() => {
      try {
        if (window.Webflow) {
          Webflow.destroy?.();
          Webflow.ready?.();
          Webflow.require("ix2")?.init();
          Webflow.require("lottie")?.init();
        }
      } catch (e) {}
    });

    requestAnimationFrame(() => {
      lenis?.resize?.();
      if (window.ScrollTrigger) ScrollTrigger.refresh(true);
    });

    setTimeout(() => {
      lenis?.resize?.();
      if (window.ScrollTrigger) ScrollTrigger.refresh(true);
    }, 200);

    initSkewUp();
    injectGlobalPlayer();
    initGlobalTrack();
    initGlobalPlayerControls();
    initPillClocks();
    initScrollPill();
    applyHamburgerVisibilityFix();

   setTimeout(() => {
  const sliderList = document.querySelector(".cms-projects-list");
  if (sliderList) {
    delete sliderList.dataset.projectSliderInit;
    sliderInstance = initProjectSlider();
  }
}, 200);
  });
}

function initGlobalTrack() {
  const track = {
    src: "https://cdn.prod.website-files.com/65aaadc263ad4e7a6d30a425/698889d62c5c028e7f07435c_kontraa-hype-drill-music-438398.mp3",
    title: "Hype Drill Music",
    artist: "Kontraa",
    cover: "https://cdn.prod.website-files.com/65aaadc263ad4e7a6d30a425/69889630907027dc4d631f0d_04-35-14-220_200x200.jpg"
  };

  const player = document.getElementById("sitePlayer");
  if (!player) return;

  document.getElementById("playerTitle").textContent = track.title;
  document.getElementById("playerArtist").textContent = track.artist;
  document.getElementById("playerCover").src = track.cover;

  if (player.src !== track.src) {
    player.src = track.src;
  }
}

function initGlobalPlayerControls() {
  const audio = document.getElementById("sitePlayer");
  const playBtn = document.getElementById("playBtn");
  const cover = document.querySelector(".player-cover");
  const musicIcon = document.getElementById("musicIcon");

  if (!audio || !playBtn || !cover || !musicIcon) return;

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    playBtn.textContent = "⏸";
    cover.style.opacity = "1";
    musicIcon.classList.add("is-playing");
  });

  audio.addEventListener("pause", () => {
    playBtn.textContent = "▶";
    cover.style.opacity = "0";
    musicIcon.classList.remove("is-playing");
  });
}

function initPillClocks() {
  function updateAnalogClock() {
    const now = new Date();

    const minutes = now.getMinutes();
    const hours = now.getHours() % 12;

    const minuteDeg = minutes * 6;
    const hourDeg = hours * 30 + minutes * 0.5;

    const hourHand = document.querySelector(".hand.hour");
    const minuteHand = document.querySelector(".hand.minute");

    if (!hourHand || !minuteHand) return;

    hourHand.style.transform =
      `translateX(-50%) rotate(${hourDeg}deg)`;

    minuteHand.style.transform =
      `translateX(-50%) rotate(${minuteDeg}deg)`;
  }

  function updateClockText() {
    const now = new Date();

    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");

    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;
    if (hours === 0) hours = 12;

    const timeEl = document.getElementById("clockTime");
    const ampmEl = document.getElementById("clockAmPm");

    if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
    if (ampmEl) ampmEl.textContent = ampm;
  }

  updateAnalogClock();
  updateClockText();

  setInterval(updateAnalogClock, 1000);
  setInterval(updateClockText, 1000);
}

function initScrollPill() {
  let overlayTimer;

  const overlay = document.querySelector(".scroll-overlay");
  const pill = document.querySelector(".scroll-pill");

  if (!overlay || !pill) return;

  let pillHeight = pill.offsetHeight;

  function showOverlay() {
    overlay.style.opacity = "1";
    clearTimeout(overlayTimer);
  }

  function hideOverlayDelayed() {
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => {
      overlay.style.opacity = "0";
    }, 700);
  }

  function updatePillPosition() {
    const scrollTop = window.scrollY;

    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;

    const progress =
      docHeight > 0 ? scrollTop / docHeight : 0;

    const overlayHeight = window.innerHeight;
    const y = progress * (overlayHeight - pillHeight);

    pill.style.transform = `translateY(${y}px)`;
  }

  window.addEventListener("scroll", () => {
    showOverlay();
    hideOverlayDelayed();
    updatePillPosition();
  });

  window.addEventListener("resize", () => {
    pillHeight = pill.offsetHeight;
    updatePillPosition();
  });

  pill.addEventListener("mouseenter", showOverlay);
  pill.addEventListener("mouseleave", hideOverlayDelayed);

  updatePillPosition();
}

function injectGlobalPlayer() {
  if (document.querySelector(".scroll-overlay")) return;

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
<audio id="sitePlayer"
src="https://cdn.prod.website-files.com/65aaadc263ad4e7a6d30a425/698889d62c5c028e7f07435c_kontraa-hype-drill-music-438398.mp3"
preload="metadata"></audio>

<div class="scroll-overlay">
  <div class="scroll-pill">
    <div class="pill-default">
      <div class="pill-top">
        <div class="pill-clock">
          <div class="hand hour"></div>
          <div class="hand minute"></div>
        </div>
      </div>

      <div class="pill-content">
        <div class="music-icon" id="musicIcon">♪</div>
      </div>

      <div class="pill-bottom">
        <div class="clock-text">
          <div id="clockTime">03:11</div>
          <div id="clockAmPm">PM</div>
        </div>
      </div>
    </div>

    <div class="pill-player">
      <img id="playerCover" class="player-cover"
           src="https://cdn.prod.website-files.com/65aaadc263ad4e7a6d30a425/69889630907027dc4d631f0d_04-35-14-220_200x200.jpg">

      <div class="player-info">
        <div id="playerTitle" class="player-title">Hype</div>
        <div id="playerArtist" class="player-artist">Kontraa</div>
      </div>

      <div class="player-controls">
        <button id="prevBtn">⏮</button>
        <button id="playBtn">▶</button>
        <button id="nextBtn">⏭</button>
      </div>
    </div>
  </div>
</div>
`;

  document.body.appendChild(wrapper);
}

document.addEventListener("DOMContentLoaded", () => {
  injectBaseStyles();
  injectMenuFixCSS();
  ensureOverlay();
  setupTransitionClicks();

  initLenis();
  initBurgerMenu();
  runPreloaderOncePerTab();

  injectGlobalPlayer();
  initGlobalTrack();
  initGlobalPlayerControls();
  initPillClocks();
  initScrollPill();

  const initialNamespace = document
    .querySelector('[data-barba="container"]')
    ?.getAttribute('data-barba-namespace');

  updateNavbarBrand(initialNamespace);

  if (location.pathname.includes("freie-arbeiten")) {
    initFreieArbeiten();
  } else {
    cleanupFreieArbeiten();
  }

  if (window.ScrollTrigger) {
    if (location.pathname === "/" || location.pathname === "/index.html") {
      setTimeout(() => ScrollTrigger.refresh(), 200);
    } else {
      ScrollTrigger.refresh();
    }
  }

  applyHamburgerVisibilityFix();
  initBarbaAndTransitions();

    if (document.querySelector(".cms-projects-list")) {
    sliderInstance = initProjectSlider();
  }

  console.log("Setup abgeschlossen");
});
