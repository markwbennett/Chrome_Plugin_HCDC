(function(){
  window.addEventListener('message',function(e){
    if(e.source!==window) return;
    const d=e.data;
    if(d&&d.type==='HCDC_NEXT_PAGE'&&typeof window.__doPostBack==='function'){
      window.__doPostBack(d.target,d.argument);
    }
  });
})(); 