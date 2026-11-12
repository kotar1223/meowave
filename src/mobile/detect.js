/* Phones get their own interface layer (src/mobile/): this marks the page
   before the first paint, so mobile.css applies from the very first frame.
   Runs in <head> right after boot.js, which already set data-os.

   Forced on in a desktop browser for testing with ?mobile=1 (remembered;
   ?mobile=0 clears it). */
(function(){
 var de=document.documentElement,os=de.getAttribute("data-os")||"";
 var force=null;
 try{
  var q=/[?&]mobile=([01])/.exec(location.search);
  if(q){localStorage.setItem("mw.forceMobile",q[1]);}
  force=localStorage.getItem("mw.forceMobile");
 }catch(_){}
 var on=force==="1"||(force!=="0"&&(os==="ios"||os==="android"));
 if(!on)return;
 de.setAttribute("data-mobile",os==="android"?"android":"ios");
 /* Portrait / landscape, kept current: the phone layout differs a lot
    between the two and media queries on width alone mix them up. */
 function orient(){de.setAttribute("data-orient",innerWidth>innerHeight?"land":"port")}
 orient();
 addEventListener("resize",orient,{passive:true});
 addEventListener("orientationchange",function(){setTimeout(orient,50)},{passive:true});
})();
