'use strict';
onmessage=async event=>{
  const {source,options,assets}=event.data;
  try{importScripts(assets.filters,assets.reshape,assets.engine);const blob=await PortraitEngine.exportPhoto(source,options);postMessage({blob});}
  catch(error){postMessage({error:error.message||'Não foi possível exportar.'});}
  finally{source.close();}
};
