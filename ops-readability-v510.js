(function(){
  "use strict";

  function centerActiveNav(){
    const menu = document.querySelector(".menu");
    const active = menu?.querySelector(".nav.active");
    if(!menu || !active) return;
    if(menu.scrollWidth <= menu.clientWidth + 2) return;
    active.scrollIntoView({ behavior:"smooth", block:"nearest", inline:"center" });
  }

  document.addEventListener("click", (event) => {
    if(event.target?.closest?.(".menu .nav")){
      window.setTimeout(centerActiveNav, 90);
    }
  }, true);

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(centerActiveNav, 350), { once:true });
  }else{
    window.setTimeout(centerActiveNav, 350);
  }

  const menu = document.querySelector(".menu");
  if(menu && "MutationObserver" in window){
    const observer = new MutationObserver(() => window.setTimeout(centerActiveNav, 60));
    menu.querySelectorAll(".nav").forEach((button) => observer.observe(button, { attributes:true, attributeFilter:["class"] }));
  }
})();
