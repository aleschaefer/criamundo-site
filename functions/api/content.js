function xmlResponse(xmlText, status = 200) {
  return new Response(xmlText, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

export async function onRequestGet(context) {
  const database = context.env.CONTENT_DB;

  if (!database) {
    return new Response("Binding CONTENT_DB nao configurado no Cloudflare Pages.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  const result = await database
    .prepare(
      `SELECT xml_content
       FROM site_content
       WHERE id = 1
       LIMIT 1`
    )
    .first();

  if (!result || !result.xml_content) {
    return new Response("Content XML not found.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  return xmlResponse(result.xml_content);
}
