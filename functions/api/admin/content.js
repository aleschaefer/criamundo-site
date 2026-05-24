function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function isValidXmlPayload(xmlText) {
  return Boolean(xmlText.trim()) && xmlText.includes("<?xml") && xmlText.includes("<siteData>");
}

export async function onRequestPost(context) {
  const database = context.env.CONTENT_DB;
  const adminPassword = context.env.ADMIN_PASSWORD;
  const providedPassword = context.request.headers.get("x-admin-password");

  if (!database) {
    return jsonResponse(
      { error: "Binding CONTENT_DB nao configurado no Cloudflare Pages." },
      503
    );
  }

  if (!adminPassword) {
    return jsonResponse(
      { error: "Variavel ADMIN_PASSWORD nao configurada no Cloudflare Pages." },
      503
    );
  }

  if (!providedPassword || providedPassword !== adminPassword) {
    return jsonResponse({ error: "Senha administrativa invalida." }, 401);
  }

  const xmlText = await context.request.text();
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
