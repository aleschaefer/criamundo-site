function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function xmlResponse(xmlText, status = 200) {
  return new Response(xmlText, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

function textResponse(message, status = 200) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

function isValidXmlPayload(xmlText) {
  return Boolean(xmlText.trim()) && xmlText.includes("<?xml") && xmlText.includes("<siteData>");
}

async function handleGetContent(env) {
  const database = env.CONTENT_DB;

  if (!database) {
    return textResponse("Binding CONTENT_DB nao configurado no Cloudflare Workers.", 503);
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
    return textResponse("Content XML not found.", 404);
  }

  return xmlResponse(result.xml_content);
}

async function handlePostContent(request, env) {
  const database = env.CONTENT_DB;
  const adminPassword = env.ADMIN_PASSWORD;
  const providedPassword = request.headers.get("x-admin-password");

  if (!database) {
    return jsonResponse(
      { error: "Binding CONTENT_DB nao configurado no Cloudflare Workers." },
      503
    );
  }

  if (!adminPassword) {
    return jsonResponse(
      { error: "Variavel ADMIN_PASSWORD nao configurada no Cloudflare Workers." },
      503
    );
  }

  if (!providedPassword || providedPassword !== adminPassword) {
    return jsonResponse({ error: "Senha administrativa invalida." }, 401);
  }

  const xmlText = await request.text();
  if (!isValidXmlPayload(xmlText)) {
    return jsonResponse({ error: "Formato de XML invalido." }, 400);
  }

  const currentContent = await database
    .prepare(
      `SELECT id, xml_content
       FROM site_content
       WHERE id = 1
       LIMIT 1`
    )
    .first();

  const timestamp = new Date().toISOString();

  if (currentContent && currentContent.xml_content) {
    await database
      .prepare(
        `INSERT INTO site_content_backups (content_id, xml_content, created_at)
         VALUES (?1, ?2, ?3)`
      )
      .bind(currentContent.id, currentContent.xml_content, timestamp)
      .run();

    await database
      .prepare(
        `UPDATE site_content
         SET xml_content = ?1, updated_at = ?2
         WHERE id = 1`
      )
      .bind(xmlText, timestamp)
      .run();
  } else {
    await database
      .prepare(
        `INSERT INTO site_content (id, xml_content, updated_at)
         VALUES (1, ?1, ?2)`
      )
      .bind(xmlText, timestamp)
      .run();
  }

  return jsonResponse({
    ok: true,
    message: "XML publicado no D1 com backup automatico criado."
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/content" && request.method === "GET") {
      return handleGetContent(env);
    }

    if (url.pathname === "/api/admin/content" && request.method === "POST") {
      return handlePostContent(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
