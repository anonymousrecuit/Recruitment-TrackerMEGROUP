/* ATS V2.4 Supabase compatibility shim.
   Keeps the existing app architecture intact and only aliases the already
   initialized global Supabase client for extensions that read window.sb. */
(function(){
  'use strict';
  try{
    if(!window.sb && typeof sb !== 'undefined' && sb){
      window.sb = sb;
    }
  }catch(error){
    console.warn('[ATS Compatibility] Supabase client alias was not installed', error);
  }
})();
