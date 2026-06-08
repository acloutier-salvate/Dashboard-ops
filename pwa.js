(function(){
  "use strict";

  const SW_URL = "./sw.js";
  let waitingWorker = null;

  function prefersReducedMotion(){
    try{ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch(e){ return false; }
  }

  function finishLaunchSplash(){
    const splash = document.getElementById("pwaLaunchSplash");
    document.documentElement.classList.add("pwa-launch-done");
    if(!splash) return;
    const removeDelay = prefersReducedMotion() ? 40 : 920;
    setTimeout(() => {
      if(splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, removeDelay);
  }

  function setupLaunchSplash(){
    const delay = prefersReducedMotion() ? 80 : 2650;
    const reveal = () => setTimeout(finishLaunchSplash, delay);
    if(document.readyState === "complete"){
      reveal();
    }else{
      window.addEventListener("load", reveal, {once:true});
      setTimeout(finishLaunchSplash, prefersReducedMotion() ? 350 : 3350);
    }
  }

  function ensureBanner(id, className, html){
    let banner = document.getElementById(id);
    if(banner) return banner;
    banner = document.createElement("div");
    banner.id = id;
    banner.className = className;
    banner.innerHTML = html;
    document.body.appendChild(banner);
    return banner;
  }

  function showOfflineBanner(){
    const banner = ensureBanner(
      "pwaOfflineBanner",
      "pwaBanner offline hidden",
      "<span>Mode hors ligne — certaines données peuvent ne pas être à jour</span>"
    );
    banner.classList.toggle("hidden", navigator.onLine);
  }

  function showUpdateBanner(worker){
    waitingWorker = worker;
    const banner = ensureBanner(
      "pwaUpdateBanner",
      "pwaBanner update hidden",
      '<span>Nouvelle version disponible</span><button type="button" id="pwaRefreshBtn">Actualiser</button>'
    );
    banner.classList.remove("hidden");
    const button = document.getElementById("pwaRefreshBtn");
    if(button){
      button.onclick = () => {
        if(waitingWorker) waitingWorker.postMessage({type:"SKIP_WAITING"});
      };
    }
  }

  function setupStandaloneClass(){
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;
    document.documentElement.classList.toggle("pwa-standalone", Boolean(standalone));
  }

  function registerServiceWorker(){
    if(!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(SW_URL).then(registration => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if(!worker) return;
          worker.addEventListener("statechange", () => {
            if(worker.state === "installed" && navigator.serviceWorker.controller){
              showUpdateBanner(worker);
            }
          });
        });
        if(registration.waiting && navigator.serviceWorker.controller){
          showUpdateBanner(registration.waiting);
        }
      }).catch(error => {
        console.warn("Dashboard OPS PWA inactive:", error);
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  function boot(){
    setupLaunchSplash();
    setupStandaloneClass();
    showOfflineBanner();
    window.addEventListener("online", showOfflineBanner);
    window.addEventListener("offline", showOfflineBanner);
    registerServiceWorker();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
