exports.handler = async function(){
  return {
    statusCode:200,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Access-Control-Allow-Origin":"*"
    },
    body:JSON.stringify({ ok:true })
  };
};
